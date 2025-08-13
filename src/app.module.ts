import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { QueueModule } from './modules/queue/queue.module';
import { WsGateway } from './modules/ws/ws.gateway';
import { EngineModule } from './modules/engine/engine.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { RunsModule } from './modules/runs/runs.module';
import { EventsModule } from './modules/events/events.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    QueueModule,
    EngineModule,
    WorkflowsModule,
    RunsModule,
    EventsModule,
  ],
  providers: [WsGateway],
})
export class AppModule { }
