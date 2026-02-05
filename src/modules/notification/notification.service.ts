import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationGateway } from './notification.gateway';
import { FcmService } from './fcm.service';
import {
  NOTIFICATION_EVENTS,
  NotificationEvent,
  BulkNotificationEvent,
} from './notification.events';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationGateway,
    private readonly fcmService: FcmService,
  ) {}

  async create(
    userId: string,
    type: NotificationType,
    title: string,
    content: string,
    data?: Record<string, any>,
  ) {
    const notification = await this.prisma.notification.create({
      data: { userId, type, title, content, data: data ?? undefined },
    });

    this.gateway.sendToUser(userId, 'newNotification', notification);

    // FCM 푸시 알림 (비동기, 실패해도 무시)
    this.fcmService
      .sendToUser(userId, title, content || '', {
        type,
        notificationId: notification.id,
        ...(data
          ? Object.fromEntries(
              Object.entries(data).map(([k, v]) => [k, String(v)]),
            )
          : {}),
      })
      .catch((err) =>
        this.logger.warn(`FCM 전송 실패 (무시): userId=${userId}, ${err}`),
      );

    this.logger.log(`알림 생성: userId=${userId}, type=${type}`);

    return notification;
  }

  async createBulk(
    userIds: string[],
    type: NotificationType,
    title: string,
    content: string,
    data?: Record<string, any>,
  ) {
    const notifications = await Promise.all(
      userIds.map((userId) => this.create(userId, type, title, content, data)),
    );
    return notifications;
  }

  async findByUser(userId: string, page = 1, limit = 20) {
    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      data: notifications,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      unreadCount,
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
    return { success: notification.count > 0 };
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { count: result.count };
  }

  // ========================================
  // 이벤트 리스너
  // ========================================

  @OnEvent(NOTIFICATION_EVENTS.ESTIMATE_SUBMITTED)
  async handleEstimateSubmitted(event: NotificationEvent) {
    await this.create(
      event.userId,
      'ESTIMATE_SUBMITTED',
      event.title,
      event.content,
      event.data,
    );
  }

  @OnEvent(NOTIFICATION_EVENTS.ESTIMATE_ACCEPTED)
  async handleEstimateAccepted(event: NotificationEvent) {
    await this.create(
      event.userId,
      'ESTIMATE_ACCEPTED',
      event.title,
      event.content,
      event.data,
    );
  }

  @OnEvent(NOTIFICATION_EVENTS.ESTIMATE_REJECTED)
  async handleEstimateRejected(event: NotificationEvent) {
    await this.create(
      event.userId,
      'ESTIMATE_REJECTED',
      event.title,
      event.content,
      event.data,
    );
  }

  @OnEvent(NOTIFICATION_EVENTS.NEW_ESTIMATE_REQUEST)
  async handleNewEstimateRequest(event: BulkNotificationEvent) {
    await this.createBulk(
      event.userIds,
      'NEW_ESTIMATE_REQUEST',
      event.title,
      event.content,
      event.data,
    );
  }

  @OnEvent(NOTIFICATION_EVENTS.NEW_MESSAGE_FIRST_REPLY)
  async handleNewMessageFirstReply(event: NotificationEvent) {
    await this.create(
      event.userId,
      'NEW_MESSAGE',
      event.title,
      event.content,
      event.data,
    );
  }

  @OnEvent(NOTIFICATION_EVENTS.NEW_REVIEW)
  async handleNewReview(event: NotificationEvent) {
    await this.create(
      event.userId,
      'NEW_REVIEW',
      event.title,
      event.content,
      event.data,
    );
  }

  @OnEvent(NOTIFICATION_EVENTS.POINT_CHANGE)
  async handlePointChange(event: NotificationEvent) {
    await this.create(
      event.userId,
      'POINT_CHANGE',
      event.title,
      event.content,
      event.data,
    );
  }

  @OnEvent(NOTIFICATION_EVENTS.COMPLETION_REPORTED)
  async handleCompletionReported(event: NotificationEvent) {
    await this.create(
      event.userId,
      'COMPLETION_REPORTED',
      event.title,
      event.content,
      event.data,
    );
  }

  @OnEvent(NOTIFICATION_EVENTS.MATCHING_COMPLETED)
  async handleMatchingCompleted(event: NotificationEvent) {
    await this.create(
      event.userId,
      'MATCHING_COMPLETED',
      event.title,
      event.content,
      event.data,
    );
  }

  @OnEvent(NOTIFICATION_EVENTS.MATCHING_CANCELLED)
  async handleMatchingCancelled(event: NotificationEvent) {
    await this.create(
      event.userId,
      'MATCHING_CANCELLED',
      event.title,
      event.content,
      event.data,
    );
  }

  @OnEvent(NOTIFICATION_EVENTS.COMPANY_WARNING)
  async handleCompanyWarning(event: NotificationEvent) {
    await this.create(
      event.userId,
      'COMPANY_WARNING',
      event.title,
      event.content,
      event.data,
    );
  }

  @OnEvent(NOTIFICATION_EVENTS.COMPANY_SUSPENDED)
  async handleCompanySuspended(event: NotificationEvent) {
    await this.create(
      event.userId,
      'COMPANY_SUSPENDED',
      event.title,
      event.content,
      event.data,
    );
  }
}
