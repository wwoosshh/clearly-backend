import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type AuditAction =
  | 'COMPANY_APPROVED'
  | 'COMPANY_REJECTED'
  | 'COMPANY_SUSPENDED'
  | 'COMPANY_REACTIVATED'
  | 'USER_ACTIVATED'
  | 'USER_DEACTIVATED'
  | 'REPORT_RESOLVED'
  | 'REVIEW_HIDDEN'
  | 'REVIEW_SHOWN'
  | 'SUBSCRIPTION_CREATED'
  | 'SUBSCRIPTION_UPGRADED'
  | 'SUBSCRIPTION_DOWNGRADED'
  | 'SUBSCRIPTION_EXTENDED'
  | 'SUBSCRIPTION_CANCELLED'
  | 'SUBSCRIPTION_FREE_TRIAL'
  | 'PASSWORD_RESET';

export type AuditTargetType =
  | 'COMPANY'
  | 'USER'
  | 'REPORT'
  | 'REVIEW'
  | 'SUBSCRIPTION';

export interface AuditLogParams {
  adminId?: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 감사 로그 기록 (실패해도 호출자에 영향 없음) */
  async log(params: AuditLogParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          ...params,
          oldValue: params.oldValue as Prisma.InputJsonValue | undefined,
          newValue: params.newValue as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      this.logger.error(`감사 로그 기록 실패: ${error}`, params);
    }
  }
}
