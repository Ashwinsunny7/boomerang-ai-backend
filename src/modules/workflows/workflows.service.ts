import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkflowsService {
    constructor(private prisma: PrismaService) { }

    create(data: any) { return this.prisma.workflow.create({ data }); }
    findAll() { return this.prisma.workflow.findMany({ orderBy: { updatedAt: 'desc' } }); }
    findOne(id: string) { return this.prisma.workflow.findUnique({ where: { id } }); }
    async update(id: string, data: any) {
        const exists = await this.findOne(id);
        if (!exists) throw new NotFoundException('Workflow not found');
        return this.prisma.workflow.update({ where: { id }, data });
    }
    remove(id: string) { return this.prisma.workflow.delete({ where: { id } }); }
}
