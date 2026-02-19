import { Controller, Get } from '@nestjs/common';
import { SystemSettingService } from './system-setting.service';

@Controller('settings')
export class SystemSettingController {
  constructor(private readonly settingService: SystemSettingService) {}

  @Get('payment-bank-account')
  getPaymentBankAccount() {
    const value = this.settingService.get<string>('payment_bank_account', '');
    return { data: value || null };
  }
}
