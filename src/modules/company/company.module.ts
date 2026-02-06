import { Module } from '@nestjs/common';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { CompanyMetricsService } from './company-metrics.service';
import { CompanyCustomerService } from './company-customer.service';
import { GeocodingModule } from '../geocoding/geocoding.module';

@Module({
  imports: [GeocodingModule],
  controllers: [CompanyController],
  providers: [CompanyService, CompanyMetricsService, CompanyCustomerService],
  exports: [CompanyService, CompanyMetricsService],
})
export class CompanyModule {}
