import { Controller, Get, Param, Post, Query, Body } from '@nestjs/common';
import { RunsService } from './runs.service';

@Controller('runs')
export class RunsController {
    constructor(private readonly svc: RunsService) { }

    @Get() list(@Query('workflowId') workflowId?: string) { return this.svc.list(workflowId); }
    @Get(':runId') get(@Param('runId') runId: string) { return this.svc.get(runId); }
    @Get(':runId/logs') logs(@Param('runId') runId: string) { return this.svc.logs(runId); }

    @Post(':workflowId/start')
    start(@Param('workflowId') workflowId: string, @Body('input') input: any) {
        return this.svc.start(workflowId, input ?? {});
    }
}
