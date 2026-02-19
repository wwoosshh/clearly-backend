import { SubscriptionTier, SubscriptionStatus } from '@prisma/client';

export interface ActiveSubscriptionInfo {
  id: string;
  companyId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  planName: string;
  dailyEstimateLimit: number;
  priorityWeight: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  isTrial: boolean;
  cancelledAt: Date | null;
}

export interface EstimateLimitInfo {
  used: number;
  limit: number;
  remaining: number;
  resetAt: string; // KST 자정 ISO string
}

export interface GroupedPlans {
  BASIC: PlanInfo[];
  PRO: PlanInfo[];
  PREMIUM: PlanInfo[];
}

export interface PlanInfo {
  id: string;
  name: string;
  tier: SubscriptionTier;
  durationMonths: number;
  price: number;
  dailyEstimateLimit: number;
  priorityWeight: number;
  features: any;
}
