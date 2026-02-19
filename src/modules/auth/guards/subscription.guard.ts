import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SUBSCRIPTION_KEY } from '../../../common/decorators/subscription.decorator';
import { SubscriptionService } from '../../subscription/subscription.service';
import { PrismaService } from '../../../prisma/prisma.service';

const TIER_LEVEL: Record<string, number> = {
  BASIC: 1,
  PRO: 2,
  PREMIUM: 3,
};

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptionService: SubscriptionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredTier = this.reflector.getAllAndOverride<string>(
      SUBSCRIPTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredTier) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('인증이 필요합니다.');
    }

    // COMPANY 역할이 아니면 가드 패스 (USER/ADMIN은 구독 불필요)
    if (user.role !== 'COMPANY') {
      return true;
    }

    const company = await this.prisma.company.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!company) {
      throw new ForbiddenException('업체 정보를 찾을 수 없습니다.');
    }

    const subscription =
      await this.subscriptionService.getHighestActiveSubscription(company.id);

    if (!subscription) {
      throw new ForbiddenException(
        '구독이 필요합니다. 가입비를 결제해주세요.',
      );
    }

    const userLevel = TIER_LEVEL[subscription.tier] || 0;
    const requiredLevel = TIER_LEVEL[requiredTier] || 0;

    if (userLevel < requiredLevel) {
      throw new ForbiddenException(
        `이 기능을 사용하려면 ${requiredTier} 이상의 구독이 필요합니다.`,
      );
    }

    // request에 구독 정보 첨부
    request.subscription = subscription;
    request.companyId = company.id;

    return true;
  }
}
