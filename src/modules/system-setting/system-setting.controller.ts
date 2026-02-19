import { Controller, Get } from '@nestjs/common';
import { SystemSettingService } from './system-setting.service';

@Controller('settings')
export class SystemSettingController {
  constructor(private readonly settingService: SystemSettingService) {}

  @Get('payment-bank-account')
  getPaymentBankAccount() {
    const value = this.settingService.get<string>('payment_bank_account', '');
    return value || null;
  }

  @Get('payment-info')
  getPaymentInfo() {
    return {
      bankName: this.settingService.get<string>('payment_bank_name', ''),
      bankAccount: this.settingService.get<string>('payment_bank_account', ''),
      accountHolder: this.settingService.get<string>('payment_account_holder', ''),
    };
  }
}
