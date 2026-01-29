import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminCronService } from './admin-cron.service';

@Module({
  imports: [ScheduleModule],
  controllers: [AdminController],
  providers: [AdminService, AdminCronService],
  exports: [AdminService],
})
export class AdminModule {}
