import { Module } from '@nestjs/common';
import { EstimateController } from './estimate.controller';
import { EstimateService } from './estimate.service';
import { SubscriptionModule } from '../subscription/subscription.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [SubscriptionModule, ChatModule],
  controllers: [EstimateController],
  providers: [EstimateService],
  exports: [EstimateService],
})
export class EstimateModule {}
