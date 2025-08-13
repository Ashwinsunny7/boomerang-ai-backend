import { Module, forwardRef } from '@nestjs/common';
import { EngineService } from './engine.service';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { WsGateway } from '../ws/ws.gateway';

@Module({
  imports: [PrismaModule, forwardRef(() => QueueModule)],
  providers: [EngineService, WsGateway],
  exports: [EngineService],
})
export class EngineModule { }
