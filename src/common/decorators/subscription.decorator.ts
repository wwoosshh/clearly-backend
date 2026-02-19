import { SetMetadata } from '@nestjs/common';

export const SUBSCRIPTION_KEY = 'requiredSubscription';
export const RequireSubscription = (tier: 'BASIC' | 'PRO' | 'PREMIUM') =>
  SetMetadata(SUBSCRIPTION_KEY, tier);
