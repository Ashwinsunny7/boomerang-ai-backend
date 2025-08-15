import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActionsService {
    constructor(private prisma: PrismaService) { }

    list() {
        return this.prisma.actionKind.findMany({ orderBy: { name: 'asc' } });
    }

    getByKey(key: string) {
        return this.prisma.actionKind.findUnique({ where: { key } });
    }

    create(data: {
        key: string;
        name: string;
        executor: string;
        schemaJson: any;
        uiSchemaJson?: any;
        defaultsJson?: any;
    }) {
        return this.prisma.actionKind.create({ data });
    }
}
