import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { AdminCronService } from './admin-cron.service';
import { SubscriptionModule } from '../subscription/subscription.module';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [SubscriptionModule, CompanyModule],
  controllers: [AdminController],
  providers: [AdminService, AdminBootstrapService, AdminCronService],
  exports: [AdminService],
})
export class AdminModule {}
