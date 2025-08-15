import { Module } from '@nestjs/common';
import { ActionsService } from './actions.service';
import { ActionsController } from './actions.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    providers: [ActionsService],
    controllers: [ActionsController],
    exports: [ActionsService],
})
export class ActionsModule { }
