import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('구독 플랜 시드 데이터 생성 시작...');

  const plans = [
    // Basic 플랜 (4개 기간)
    {
      name: 'Basic 1개월',
      tier: 'BASIC' as const,
      durationMonths: 1,
      price: 20000,
      dailyEstimateLimit: 3,
      priorityWeight: 1.0,
      sortOrder: 1,
      features: { searchWeight: 1.0 },
    },
    {
      name: 'Basic 3개월',
      tier: 'BASIC' as const,
      durationMonths: 3,
      price: 60000,
      dailyEstimateLimit: 3,
      priorityWeight: 1.0,
      sortOrder: 2,
      features: { searchWeight: 1.0 },
    },
    {
      name: 'Basic 6개월',
      tier: 'BASIC' as const,
      durationMonths: 6,
      price: 120000,
      dailyEstimateLimit: 3,
      priorityWeight: 1.0,
      sortOrder: 3,
      features: { searchWeight: 1.0 },
    },
    {
      name: 'Basic 12개월',
      tier: 'BASIC' as const,
      durationMonths: 12,
      price: 200000,
      dailyEstimateLimit: 3,
      priorityWeight: 1.0,
      sortOrder: 4,
      features: { searchWeight: 1.0 },
    },
    // Pro 플랜
    {
      name: 'Pro 1개월',
      tier: 'PRO' as const,
      durationMonths: 1,
      price: 50000,
      dailyEstimateLimit: 10,
      priorityWeight: 2.0,
      sortOrder: 5,
      features: { searchWeight: 2.0, customerManagement: true },
    },
    // Premium 플랜
    {
      name: 'Premium 1개월',
      tier: 'PREMIUM' as const,
      durationMonths: 1,
      price: 100000,
      dailyEstimateLimit: 50,
      priorityWeight: 3.0,
      sortOrder: 6,
      features: { searchWeight: 3.0, customerManagement: true, prioritySupport: true },
    },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: {
        tier_durationMonths: {
          tier: plan.tier,
          durationMonths: plan.durationMonths,
        },
      },
      update: {
        name: plan.name,
        price: plan.price,
        dailyEstimateLimit: plan.dailyEstimateLimit,
        priorityWeight: plan.priorityWeight,
        sortOrder: plan.sortOrder,
        features: plan.features,
      },
      create: plan,
    });
    console.log(`  플랜 생성/업데이트: ${plan.name}`);
  }

  console.log('구독 플랜 시드 데이터 생성 완료!');

  // 기존 업체 마이그레이션
  console.log('\n기존 업체 구독 마이그레이션 시작...');

  const basicPlan3m = await prisma.subscriptionPlan.findFirst({
    where: { tier: 'BASIC', durationMonths: 3 },
  });

  if (!basicPlan3m) {
    console.log('Basic 3개월 플랜을 찾을 수 없습니다.');
    return;
  }

  const approvedCompanies = await prisma.company.findMany({
    where: { verificationStatus: 'APPROVED' },
    select: { id: true, approvedAt: true },
  });

  const now = new Date();
  let activeCount = 0;
  let expiredCount = 0;

  for (const company of approvedCompanies) {
    // 이미 구독이 있으면 건너뛰기
    const existing = await prisma.companySubscription.findFirst({
      where: { companyId: company.id },
    });
    if (existing) continue;

    const approvedAt = company.approvedAt || now;
    const trialEnd = new Date(approvedAt);
    trialEnd.setMonth(trialEnd.getMonth() + 3);

    if (trialEnd > now) {
      // 아직 무료체험 기간 중
      await prisma.companySubscription.create({
        data: {
          companyId: company.id,
          planId: basicPlan3m.id,
          status: 'ACTIVE',
          currentPeriodStart: approvedAt,
          currentPeriodEnd: trialEnd,
          isTrial: true,
        },
      });
      activeCount++;
    } else {
      // 무료체험 만료
      await prisma.companySubscription.create({
        data: {
          companyId: company.id,
          planId: basicPlan3m.id,
          status: 'EXPIRED',
          currentPeriodStart: approvedAt,
          currentPeriodEnd: trialEnd,
          isTrial: true,
        },
      });
      expiredCount++;
    }
  }

  console.log(`기존 업체 마이그레이션 완료: ACTIVE ${activeCount}건, EXPIRED ${expiredCount}건`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
