import { Module } from '@nestjs/common';
import { PointController, AdminPointController } from './point.controller';
import { PointService } from './point.service';

@Module({
  controllers: [PointController, AdminPointController],
  providers: [PointService],
  exports: [PointService],
})
export class PointModule {}
