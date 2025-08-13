import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EngineService } from '../engine/engine.service';

@Injectable()
export class RunsService {
    constructor(private prisma: PrismaService, private engine: EngineService) { }

    list(workflowId?: string) {
        return this.prisma.run.findMany({
            where: workflowId ? { workflowId } : {},
            orderBy: { startedAt: 'desc' },
            take: 100,
        });
    }
    get(runId: string) { return this.prisma.run.findUnique({ where: { id: runId } }); }
    logs(runId: string) { return this.prisma.log.findMany({ where: { runId }, orderBy: { ts: 'asc' } }); }

    start(workflowId: string, input: any) { return this.engine.startRun(workflowId, input); }
}
