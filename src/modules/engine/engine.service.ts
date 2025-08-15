import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowGraph } from '../../common/types/workflow';
import { registry } from '../../common/registry';
import { Queue } from 'bullmq';
import { WsGateway } from '../ws/ws.gateway';
import { EXEC_QUEUE } from '../queue/queue.tokens';
import { RunStatus } from '@prisma/client';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { ActionsService } from '../actions/actions.service';

// If you have a ctx type, import it. Otherwise keep as 'any' for adapters:
type ExecCtx = {
    runId: string;
    workflowId: string;
    nodeId: string;
    input: any;
    bag: Record<string, any>;
    emit: (payload: { level: string; message: string; details?: any }) => Promise<void>;
    getNextEdges: (predicate?: string) => string[];
};
// add this near the top (after imports)
type ExecResult =
    | { status: 'OK'; next?: string[] }
    | { status: 'WAIT'; next?: string[]; resumeAt: Date }
    | { status: 'END' };


@Injectable()
export class EngineService {
    private ajv = addFormats(new Ajv({ allErrors: true }), ['email', 'uri']);

    constructor(
        private prisma: PrismaService,
        @Inject(EXEC_QUEUE) private execQueue: Queue,
        private ws: WsGateway,
        private actions: ActionsService
    ) { }

    // ---------- Dynamic (catalog) helpers ----------
    private validateJson(schema: any, data: any) {
        const v = this.ajv.compile(schema);
        if (!v(data)) {
            const msg = v.errors?.map((e) => `${e.instancePath} ${e.message}`).join(', ');
            throw new Error(`Config validation failed: ${msg}`);
        }
    }

    private render(tpl: string | undefined, ctx: ExecCtx) {
        if (!tpl) return '';
        // Use your existing templating util if you have one:
        // import { render } from '../../common/templating';
        // return render(tpl, { ...ctx.input, ...ctx.bag, nodeId: ctx.nodeId });
        // Minimal fallback:
        return tpl.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, expr) => {
            try {
                const path = String(expr).trim().split('.');
                let cur: any = { ...ctx.input, ...ctx.bag };
                for (const k of path) cur = cur?.[k];
                return cur == null ? '' : String(cur);
            } catch {
                return '';
            }
        });
    }

    // Adapters delegate to your existing registry handlers so you don't duplicate logic
    private async execHttp(config: any, ctx: ExecCtx): Promise<ExecResult> {
        const h = registry.get('API_CALL');
        if (!h) throw new Error('HTTP executor requires API_CALL handler in registry');
        h.validate(config);
        const r = await h.execute(config, ctx);
        if (!r) throw new Error('API_CALL returned void');
        return r as ExecResult;
    }


    private async execWait(config: any, ctx: ExecCtx): Promise<ExecResult> {
        const h = registry.get('WAIT');
        if (!h) throw new Error('WAIT executor requires WAIT handler in registry');
        h.validate(config);
        const r = await h.execute(config, ctx);
        if (!r) throw new Error('WAIT returned void');
        return r as ExecResult;
    }

    private async execIf(config: any, ctx: ExecCtx): Promise<ExecResult> {
        const h = registry.get('IF');
        if (!h) throw new Error('IF executor requires IF handler in registry');
        h.validate(config);
        const r = await h.execute(config, ctx);
        if (!r) throw new Error('IF returned void');
        return r as ExecResult;
    }

    // You parked these for later — keep them but ensure they match the signature
    private async execEmail(_config: any, _ctx: ExecCtx): Promise<ExecResult> {
        throw new Error('EMAIL executor not implemented (parked).');
    }

    private async execLlmChat(_config: any, _ctx: ExecCtx): Promise<ExecResult> {
        throw new Error('LLM_CHAT executor not implemented (parked).');
    }


    // 3) Now execDynamic can return ExecResult without casts
    private async execDynamic(node: any, ctx: ExecCtx): Promise<ExecResult> {
        const action = await this.actions.getByKey(node.type);
        if (!action) throw new Error(`Unknown node type: ${node.type}`);

        this.validateJson(action.schemaJson, node.config);

        switch (action.executor) {
            case 'HTTP': return this.execHttp(node.config, ctx);
            case 'WAIT': return this.execWait(node.config, ctx);
            case 'IF': return this.execIf(node.config, ctx);
            case 'EMAIL': return this.execEmail(node.config, ctx);
            case 'LLM_CHAT': return this.execLlmChat(node.config, ctx);
            default: throw new Error(`Unsupported executor: ${action.executor}`);
        }
    }


    // ---------- Graph helpers ----------
    private outEdges(graph: WorkflowGraph, nodeId: string, predicate?: string) {
        const all = (graph.edges || []).filter((e) => e.source === nodeId);
        if (!predicate) return all.map((e) => e.target);
        return all.filter((e) => e.predicate === predicate).map((e) => e.target);
    }

    private firstNodes(graph: WorkflowGraph) {
        const targets = new Set(graph.edges.map((e) => e.target));
        return graph.nodes.map((n) => n.id).filter((id) => !targets.has(id));
    }

    private node(graph: WorkflowGraph, nodeId: string) {
        const n = graph.nodes.find((n) => n.id === nodeId);
        if (!n) throw new NotFoundException(`Node ${nodeId} not found`);
        return n;
    }

    // ---------- Public API ----------
    async startRun(workflowId: string, input: any) {
        const run = await this.prisma.run.create({
            data: { workflowId, input, status: RunStatus.PENDING },
        });
        const wf = await this.prisma.workflow.findUnique({ where: { id: workflowId } });
        const graph = wf!.graph as WorkflowGraph;
        const first = this.firstNodes(graph);

        await Promise.all(
            first.map((nodeId) => this.execQueue.add('executeNode', { runId: run.id, nodeId }))
        );

        await this.prisma.run.update({
            where: { id: run.id },
            data: { status: RunStatus.RUNNING, startedAt: new Date() },
        });
        this.ws.emitRunStatus(run.id, 'RUNNING');
        return run.id;
    }

    async process(runId: string, nodeId: string) {
        const run = await this.prisma.run.findUnique({
            where: { id: runId },
            include: { workflow: true },
        });
        if (!run) throw new NotFoundException('Run not found');

        const graph = run.workflow.graph as WorkflowGraph;
        const n = this.node(graph, nodeId);

        // engine ctx + logger
        const emit = async (payload: any) => {
            await this.prisma.log.create({
                data: {
                    runId,
                    nodeId,
                    level: payload.level,
                    message: payload.message,
                    details: payload.details,
                },
            });
            this.ws.emitLog(runId, nodeId, payload);
        };

        const ctx: ExecCtx = {
            runId,
            workflowId: run.workflowId,
            nodeId,
            input: run.input,
            bag: {}, // NOTE: per-node bag (you can persist if you want later)
            emit,
            getNextEdges: (pred?: string) => this.outEdges(graph, nodeId, pred),
        };

        this.ws.emitNodeStarted(runId, nodeId);
        await this.prisma.run.update({ where: { id: runId }, data: { currentNodeId: nodeId } });

        // ...
        try {
            // Try static registry first
            const handler = registry.get(n.type);

            let out: ExecResult;

            if (handler) {
                handler.validate(n.config);
                const r = await handler.execute(n.config, ctx);
                if (!r) throw new Error('Executor returned void');
                out = r as ExecResult;
            } else {
                out = await this.execDynamic(n, ctx);
            }

            // Optional runtime sanity check:
            if (!out || !out.status) {
                throw new Error('Executor returned invalid result');
            }

            // ====== rest of your logic stays the same ======
            if (out.status === 'WAIT') {
                const defaults = this.outEdges(graph, nodeId);
                const nextIds = out.next && out.next.length ? out.next : defaults;
                const delay = Math.max(0, out.resumeAt.getTime() - Date.now());
                if (nextIds[0]) {
                    await this.execQueue.add('executeNode', { runId, nodeId: nextIds[0] }, { delay });
                }
                this.ws.emitNodeCompleted(runId, nodeId, 'WAIT');
                return;
            }

            if (out.status === 'END') {
                this.ws.emitNodeCompleted(runId, nodeId, 'OK');
                await this.prisma.run.update({
                    where: { id: runId },
                    data: { status: RunStatus.SUCCESS, finishedAt: new Date(), currentNodeId: null },
                });
                this.ws.emitRunStatus(runId, 'SUCCESS');
                return;
            }

            // status === 'OK'
            const nextIds = out.next && out.next.length ? out.next : this.outEdges(graph, nodeId);
            this.ws.emitNodeCompleted(runId, nodeId, 'OK');
            if (nextIds.length === 0) {
                await this.prisma.run.update({
                    where: { id: runId },
                    data: { status: RunStatus.SUCCESS, finishedAt: new Date(), currentNodeId: null },
                });
                this.ws.emitRunStatus(runId, 'SUCCESS');
            } else {
                await Promise.all(
                    nextIds.map((nid) => this.execQueue.add('executeNode', { runId, nodeId: nid })),
                );
            }
        } catch (e: any) {
            await emit({ level: 'ERROR', message: String(e?.message ?? e) });
            await this.prisma.run.update({
                where: { id: runId },
                data: { status: RunStatus.FAILED, finishedAt: new Date() },
            });
            this.ws.emitNodeCompleted(runId, nodeId, 'ERROR');
            this.ws.emitRunStatus(runId, 'FAILED');
        }

    }
}
