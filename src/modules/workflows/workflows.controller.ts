import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('workflows')
export class WorkflowsController {
    constructor(private readonly svc: WorkflowsService, private prisma: PrismaService) { }

    @Post() create(@Body() body: any) { return this.svc.create(body); }
    @Get() findAll() { return this.svc.findAll(); }
    @Get(':id') findOne(@Param('id') id: string) { return this.svc.findOne(id); }
    @Put(':id') update(@Param('id') id: string, @Body() body: any) { return this.svc.update(id, body); }
    // @Delete(':id') remove(@Param('id') id: string) { return this.svc.remove(id); }
    @Delete(':id')
    async remove(@Param('id') id: string) {
        await this.prisma.$transaction(async (tx) => {
            // delete logs that belong to runs of this workflow
            await tx.log.deleteMany({
                where: { run: { workflowId: id } },
            });
            // delete runs of this workflow
            await tx.run.deleteMany({
                where: { workflowId: id },
            });
            // finally delete the workflow
            await tx.workflow.delete({
                where: { id },
            });
        });

        return { ok: true };
    }

    // Optional: /validate to check DAG, schemas, etc. (can add later)
}
