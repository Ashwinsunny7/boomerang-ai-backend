import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
export class WorkflowsController {
    constructor(private readonly svc: WorkflowsService) { }

    @Post() create(@Body() body: any) { return this.svc.create(body); }
    @Get() findAll() { return this.svc.findAll(); }
    @Get(':id') findOne(@Param('id') id: string) { return this.svc.findOne(id); }
    @Put(':id') update(@Param('id') id: string, @Body() body: any) { return this.svc.update(id, body); }
    @Delete(':id') remove(@Param('id') id: string) { return this.svc.remove(id); }

    // Optional: /validate to check DAG, schemas, etc. (can add later)
}
