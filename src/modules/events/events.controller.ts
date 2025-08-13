import { Body, Controller, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as jsonLogic from 'json-logic-js';
import { EngineService } from '../engine/engine.service';

@Controller('events')
export class EventsController {
    constructor(private prisma: PrismaService, private engine: EngineService) { }

    // Example: lead ingestion -> evaluate triggerRule on each workflow
    @Post('leads')
    async ingestLead(@Body() payload: any) {
        const workflows = await this.prisma.workflow.findMany();
        const triggered: string[] = [];

        await Promise.all(
            workflows.map(async (wf) => {
                const rule = wf.triggerRule as any;
                if (!rule) return;
                let pass = false;
                try { pass = jsonLogic.apply(rule, payload); } catch { pass = false; }
                if (pass) {
                    triggered.push(wf.id);
                    await this.engine.startRun(wf.id, payload);
                }
            })
        );
        return { triggered };
    }
}
