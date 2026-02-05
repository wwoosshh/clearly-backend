import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as admin from 'firebase-admin';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private isInitialized = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const serviceAccount = this.configService.get<string>(
      'FIREBASE_SERVICE_ACCOUNT',
    );
    if (!serviceAccount) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT 미설정 - FCM 푸시 알림 비활성화',
      );
      return;
    }

    try {
      const parsed = JSON.parse(serviceAccount);
      admin.initializeApp({
        credential: admin.credential.cert(parsed),
      });
      this.isInitialized = true;
      this.logger.log('Firebase Admin SDK 초기화 완료');
    } catch (error) {
      this.logger.error(`Firebase 초기화 실패: ${error}`);
    }
  }

  /** 디바이스 토큰 등록 */
  async registerToken(
    userId: string,
    token: string,
    platform: 'ANDROID' | 'IOS' | 'WEB',
  ) {
    const existing = await this.prisma.deviceToken.findUnique({
      where: { token },
    });

    if (existing) {
      if (existing.userId === userId && existing.isActive) {
        return existing;
      }
      return this.prisma.deviceToken.update({
        where: { token },
        data: { userId, platform, isActive: true },
      });
    }

    return this.prisma.deviceToken.create({
      data: { userId, token, platform },
    });
  }

  /** 디바이스 토큰 해제 */
  async unregisterToken(userId: string, token: string) {
    const existing = await this.prisma.deviceToken.findFirst({
      where: { userId, token },
    });
    if (!existing) return { success: false };

    await this.prisma.deviceToken.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
    return { success: true };
  }

  /** 특정 유저에게 푸시 알림 전송 */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    if (!this.isInitialized) return;

    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId, isActive: true },
      select: { id: true, token: true },
    });

    if (tokens.length === 0) return;

    const message: admin.messaging.MulticastMessage = {
      tokens: tokens.map((t) => t.token),
      notification: { title, body },
      data: data ?? undefined,
      android: {
        priority: 'high',
        notification: { channelId: 'clearly_default' },
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } },
      },
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);
      this.logger.log(
        `FCM 전송: userId=${userId}, success=${response.successCount}, fail=${response.failureCount}`,
      );

      // 실패한 토큰 비활성화 (UNREGISTERED, INVALID_ARGUMENT)
      const invalidTokenIds: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (
          resp.error &&
          (resp.error.code === 'messaging/registration-token-not-registered' ||
            resp.error.code === 'messaging/invalid-registration-token')
        ) {
          invalidTokenIds.push(tokens[idx].id);
        }
      });

      if (invalidTokenIds.length > 0) {
        await this.prisma.deviceToken.updateMany({
          where: { id: { in: invalidTokenIds } },
          data: { isActive: false },
        });
        this.logger.log(`비활성 토큰 처리: ${invalidTokenIds.length}개`);
      }
    } catch (error) {
      this.logger.error(`FCM 전송 실패: userId=${userId}, error=${error}`);
    }
  }

  /** 여러 유저에게 푸시 알림 전송 */
  async sendToUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    if (!this.isInitialized) return;
    await Promise.allSettled(
      userIds.map((userId) => this.sendToUser(userId, title, body, data)),
    );
  }
}
