import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { CompanyModule } from './modules/company/company.module';
import { MatchingModule } from './modules/matching/matching.module';
import { ChatModule } from './modules/chat/chat.module';
import { ReviewModule } from './modules/review/review.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { NotificationModule } from './modules/notification/notification.module';
import { AdminModule } from './modules/admin/admin.module';
import { UploadModule } from './modules/upload/upload.module';
import { PointModule } from './modules/point/point.module';
import { EstimateModule } from './modules/estimate/estimate.module';
import { ReportModule } from './modules/report/report.module';
import { FaqModule } from './modules/faq/faq.module';
import { InquiryModule } from './modules/inquiry/inquiry.module';
import { GeocodingModule } from './modules/geocoding/geocoding.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuthModule,
    UserModule,
    CompanyModule,
    MatchingModule,
    ChatModule,
    ReviewModule,
    SubscriptionModule,
    NotificationModule,
    AdminModule,
    UploadModule,
    PointModule,
    EstimateModule,
    ReportModule,
    FaqModule,
    InquiryModule,
    GeocodingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
