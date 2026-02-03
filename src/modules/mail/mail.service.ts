import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    const port = this.configService.get<number>('SMTP_PORT', 465);
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST', 'smtp.gmail.com'),
      port,
      secure: port === 465,
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASSWORD'),
      },
    });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const frontendUrl = this.configService.get(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    const smtpUser = this.configService.get('SMTP_USER', '');
    const from = this.configService.get(
      'SMTP_FROM',
      `Clearly <${smtpUser}>`,
    );

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;padding:40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                <!-- Header -->
                <tr>
                  <td style="padding:32px 32px 0;">
                    <h1 style="margin:0;font-size:22px;font-weight:800;color:#111827;letter-spacing:-0.5px;">Clearly</h1>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding:24px 32px 32px;">
                    <h2 style="margin:0 0 12px;font-size:18px;font-weight:700;color:#111827;">비밀번호 재설정</h2>
                    <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#6b7280;">
                      비밀번호 재설정을 요청하셨습니다.<br>
                      아래 버튼을 클릭하여 새 비밀번호를 설정해주세요.
                    </p>
                    <a href="${resetUrl}"
                       style="display:inline-block;padding:12px 32px;background-color:#111827;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                      비밀번호 재설정
                    </a>
                    <p style="margin:24px 0 0;font-size:12px;line-height:18px;color:#9ca3af;">
                      이 링크는 1시간 후 만료됩니다.<br>
                      본인이 요청하지 않았다면 이 이메일을 무시하셔도 됩니다.
                    </p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
                    <p style="margin:0;font-size:11px;color:#d1d5db;">&copy; Clearly. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: '[Clearly] 비밀번호 재설정',
        html,
      });
      this.logger.log(`비밀번호 재설정 이메일 발송 완료: ${to}`);
    } catch (error) {
      this.logger.error(`이메일 발송 실패: ${to}`, error);
      throw error;
    }
  }
}
