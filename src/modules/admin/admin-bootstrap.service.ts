import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await this.ensureAdminExists();
  }

  private async ensureAdminExists() {
    const adminEmail = process.env.ADMIN_EMAIL || 'clearly@gmail.com';
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      this.logger.warn(
        'ADMIN_PASSWORD 환경변수가 설정되지 않았습니다. 관리자 계정 자동 생성을 건너뜁니다.',
      );
      return;
    }

    const existingAdmin = await this.prisma.user.findFirst({
      where: { email: adminEmail, role: 'ADMIN' },
    });

    if (existingAdmin) {
      this.logger.log(`관리자 계정이 이미 존재합니다: ${adminEmail}`);
      return;
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    await this.prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: hashedPassword,
        name: '관리자',
        role: 'ADMIN',
        isActive: true,
      },
    });

    this.logger.log(`관리자 계정 생성 완료: ${adminEmail}`);
  }
}
