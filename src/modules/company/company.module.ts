import { Module } from '@nestjs/common';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { CompanyMetricsService } from './company-metrics.service';
import { GeocodingModule } from '../geocoding/geocoding.module';

@Module({
  imports: [GeocodingModule],
  controllers: [CompanyController],
  providers: [CompanyService, CompanyMetricsService],
  exports: [CompanyService, CompanyMetricsService],
})
export class CompanyModule {}
