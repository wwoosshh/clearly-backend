import { Module } from '@nestjs/common';
import { EstimateController } from './estimate.controller';
import { EstimateService } from './estimate.service';
import { PointModule } from '../point/point.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [PointModule, ChatModule],
  controllers: [EstimateController],
  providers: [EstimateService],
  exports: [EstimateService],
})
export class EstimateModule {}
