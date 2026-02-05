import { Global, Module } from '@nestjs/common';
import { SystemSettingService } from './system-setting.service';

@Global()
@Module({
  providers: [SystemSettingService],
  exports: [SystemSettingService],
})
export class SystemSettingModule {}
