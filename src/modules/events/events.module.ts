import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EngineModule } from '../engine/engine.module';

@Module({
  imports: [PrismaModule, EngineModule],
  controllers: [EventsController],
})
export class EventsModule { }
