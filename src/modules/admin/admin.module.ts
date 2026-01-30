import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { AdminCronService } from './admin-cron.service';
import { PointModule } from '../point/point.module';

@Module({
  imports: [PointModule],
  controllers: [AdminController],
  providers: [AdminService, AdminBootstrapService, AdminCronService],
  exports: [AdminService],
})
export class AdminModule {}
