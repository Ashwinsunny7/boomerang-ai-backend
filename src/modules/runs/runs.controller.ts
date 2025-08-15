import { Controller, Get, Param, Post, Query, Body, Patch, NotFoundException } from '@nestjs/common';
import { RunsService } from './runs.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('runs')
export class RunsController {
    constructor(private readonly svc: RunsService, private prisma: PrismaService) { }

    @Get() list(@Query('workflowId') workflowId?: string) { return this.svc.list(workflowId); }
    @Get(':runId') get(@Param('runId') runId: string) { return this.svc.get(runId); }
    @Get(':runId/logs') logs(@Param('runId') runId: string) { return this.svc.logs(runId); }

    @Post(':workflowId/start')
    start(@Param('workflowId') workflowId: string, @Body('input') input: any) {
        return this.svc.start(workflowId, input ?? {});
    }

    @Patch(':runId/input')
    async patchInput(@Param('runId') runId: string, @Body() delta: any) {
        const run = await this.prisma.run.findUnique({ where: { id: runId } });
        if (!run) throw new NotFoundException('Run not found');

        // naive shallow merge; good enough for demo
        const input = { ...(run.input as any ?? {}), ...delta };
        await this.prisma.run.update({ where: { id: runId }, data: { input } });
        return { ok: true, input };
    }
}
