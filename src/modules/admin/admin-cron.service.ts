import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminCronService {
  private readonly logger = new Logger(AdminCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async rotateAdminPasswords() {
    this.logger.log('관리자 비밀번호 자동 로테이션 시작...');

    try {
      const admins = await this.prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true },
      });

      for (const admin of admins) {
        const newPassword = crypto.randomBytes(16).toString('hex');
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        await this.prisma.user.update({
          where: { id: admin.id },
          data: { passwordHash: hashedPassword },
        });

        this.logger.log(`관리자 비밀번호 변경 완료 - ${admin.email}: ${newPassword}`);
      }

      // 관리자 리프레시 토큰 전부 무효화
      const adminIds = admins.map((a) => a.id);
      if (adminIds.length > 0) {
        await this.prisma.refreshToken.deleteMany({
          where: { userId: { in: adminIds } },
        });
      }

      this.logger.log(`총 ${admins.length}명의 관리자 비밀번호 로테이션 완료`);
    } catch (error) {
      this.logger.error('관리자 비밀번호 로테이션 실패:', error);
    }
  }
}
