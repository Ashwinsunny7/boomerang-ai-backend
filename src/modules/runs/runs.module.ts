import { Module, forwardRef } from '@nestjs/common';
import { RunsService } from './runs.service';
import { RunsController } from './runs.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EngineModule } from '../engine/engine.module';

@Module({
  imports: [PrismaModule, forwardRef(() => EngineModule)],
  controllers: [RunsController],
  providers: [RunsService],
})
export class RunsModule { }
