import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowGraph } from '../../common/types/workflow';
import { registry } from '../../common/registry';
import { Queue } from 'bullmq';
import { WsGateway } from '../ws/ws.gateway';
import { Inject } from '@nestjs/common';
import { EXEC_QUEUE } from '../queue/queue.tokens';
import { RunStatus } from '@prisma/client';

@Injectable()
export class EngineService {
    constructor(
        private prisma: PrismaService,
        @Inject(EXEC_QUEUE) private execQueue: Queue,
        private ws: WsGateway,
    ) { }

    private outEdges(graph: WorkflowGraph, nodeId: string, predicate?: string) {
        const all = (graph.edges || []).filter(e => e.source === nodeId);
        if (!predicate) return all.map(e => e.target);
        return all.filter(e => e.predicate === predicate).map(e => e.target);
    }
    private firstNodes(graph: WorkflowGraph) {
        const targets = new Set(graph.edges.map(e => e.target));
        return graph.nodes.map(n => n.id).filter(id => !targets.has(id));
    }
    private node(graph: WorkflowGraph, nodeId: string) {
        const n = graph.nodes.find(n => n.id === nodeId);
        if (!n) throw new NotFoundException(`Node ${nodeId} not found`);
        return n;
    }

    async startRun(workflowId: string, input: any) {
        const run = await this.prisma.run.create({ data: { workflowId, input, status: RunStatus.PENDING } });
        const wf = await this.prisma.workflow.findUnique({ where: { id: workflowId } });
        const graph = wf!.graph as WorkflowGraph;
        const first = this.firstNodes(graph);
        await Promise.all(first.map(nodeId => this.execQueue.add('executeNode', { runId: run.id, nodeId })));
        await this.prisma.run.update({ where: { id: run.id }, data: { status: RunStatus.RUNNING, startedAt: new Date() } });
        this.ws.emitRunStatus(run.id, 'RUNNING');
        return run.id;
    }

    async process(runId: string, nodeId: string) {
        const run = await this.prisma.run.findUnique({ where: { id: runId }, include: { workflow: true } });
        if (!run) throw new NotFoundException('Run not found');
        const graph = run.workflow.graph as WorkflowGraph;
        const n = this.node(graph, nodeId);
        const exec = registry.get(n.type);
        if (!exec) throw new Error(`No executor for ${n.type}`);

        const emit = async (payload: any) => {
            await this.prisma.log.create({ data: { runId, nodeId, level: payload.level, message: payload.message, details: payload.details } });
            this.ws.emitLog(runId, nodeId, payload);
        };

        this.ws.emitNodeStarted(runId, nodeId);
        await this.prisma.run.update({ where: { id: runId }, data: { currentNodeId: nodeId } });

        try {
            exec.validate(n.config);
            const ctx = {
                runId, workflowId: run.workflowId, nodeId,
                input: run.input, bag: {}, emit,
                getNextEdges: (pred?: string) => this.outEdges(graph, nodeId, pred),
            };

            const out = await exec.execute(n.config, ctx);

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
                    data: { status: RunStatus.SUCCESS, finishedAt: new Date(), currentNodeId: null }
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
                    data: { status: RunStatus.SUCCESS, finishedAt: new Date(), currentNodeId: null }
                });
                this.ws.emitRunStatus(runId, 'SUCCESS');
            } else {
                await Promise.all(nextIds.map(nid => this.execQueue.add('executeNode', { runId, nodeId: nid })));
            }
        } catch (e: any) {
            await emit({ level: "ERROR", message: String(e?.message ?? e) });
            await this.prisma.run.update({ where: { id: runId }, data: { status: RunStatus.FAILED, finishedAt: new Date() } });
            this.ws.emitNodeCompleted(runId, nodeId, 'ERROR');
            this.ws.emitRunStatus(runId, 'FAILED');
        }
    }
}
