import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { RedisService } from '../../common/cache/redis.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { SearchCompanyDto, SortBy } from './dto/search-company.dto';

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocodingService: GeocodingService,
    private readonly redis: RedisService,
  ) {}

  async create(data: any) {
    return this.prisma.company.create({ data });
  }

  async findById(id: string) {
    const cacheKey = `company:detail:${id}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            profileImage: true,
          },
        },
        subscriptions: {
          where: { status: 'ACTIVE' },
          include: { plan: { select: { tier: true } } },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('업체를 찾을 수 없습니다.');
    }

    const { subscriptions, ...rest } = company;
    const result = {
      ...rest,
      subscriptionTier: subscriptions[0]?.plan?.tier ?? null,
    };

    await this.redis.set(cacheKey, result, 600); // 10분 캐시
    return result;
  }

  async getMyCompany(userId: string) {
    // Redis 캐시 확인 (TTL 5분)
    const cacheKey = `company:profile:${userId}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const company = await this.prisma.company.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            profileImage: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('등록된 업체 정보가 없습니다.');
    }

    await this.redis.set(cacheKey, company, 300); // 5분 캐시
    return company;
  }

  async findAll(page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [companies, total] = await Promise.all([
      this.prisma.company.findMany({
        where: {
          verificationStatus: 'APPROVED',
          isActive: true,
        },
        skip,
        take: limit,
        orderBy: { averageRating: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              profileImage: true,
            },
          },
        },
      }),
      this.prisma.company.count({
        where: {
          verificationStatus: 'APPROVED',
          isActive: true,
        },
      }),
    ]);

    return {
      data: companies,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(id: string, data: UpdateCompanyDto, userId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
    });

    if (!company) {
      throw new NotFoundException('업체를 찾을 수 없습니다.');
    }

    if (company.userId !== userId) {
      throw new ForbiddenException('본인 업체만 수정할 수 있습니다.');
    }

    // DTO class instance → plain object 변환 (Json 필드가 Prisma에 올바르게 전달되도록)
    const updateData: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    // 주소가 변경된 경우 위도/경도 재계산
    if (updateData.address && updateData.address !== company.address) {
      try {
        const coords = await this.geocodingService.geocodeAddress(
          updateData.address,
        );
        if (coords) {
          updateData.latitude = coords.latitude;
          updateData.longitude = coords.longitude;
          this.logger.log(
            `업체 ${id} 주소 변경 → 좌표 재계산: ${coords.latitude}, ${coords.longitude}`,
          );
        } else {
          this.logger.warn(
            `업체 ${id} 주소 변경 → 좌표 변환 실패: "${updateData.address}"`,
          );
        }
      } catch (err) {
        this.logger.error(`업체 ${id} 주소 좌표 변환 오류: ${err}`);
      }
    }

    const updated = await this.prisma.company.update({
      where: { id },
      data: updateData,
    });

    // 캐시 무효화
    await this.redis.del(`company:profile:${userId}`, `company:detail:${id}`);
    return updated;
  }

  async updateApprovalStatus(id: string, status: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
    });

    if (!company) {
      throw new NotFoundException('업체를 찾을 수 없습니다.');
    }

    const updateData: Record<string, any> = {
      verificationStatus: status as any,
    };

    if (status === 'APPROVED') {
      updateData.approvedAt = new Date();
    }

    return this.prisma.company.update({
      where: { id },
      data: updateData,
    });
  }

  async searchCompanies(dto: SearchCompanyDto) {
    const {
      keyword,
      specialty,
      region,
      sortBy = SortBy.SCORE,
      page = 1,
      limit = 10,
    } = dto;

    // --- DB 레벨 필터링 (키워드) ---
    const whereConditions: any = {
      verificationStatus: 'APPROVED',
      isActive: true,
    };

    if (keyword) {
      whereConditions.OR = [
        { businessName: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const companies = await this.prisma.company.findMany({
      where: whereConditions,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            profileImage: true,
          },
        },
        subscriptions: {
          where: { status: 'ACTIVE' },
          include: { plan: true },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // --- 메모리 필터링 (JSON 필드: DB에서 직접 필터 불가) ---
    const companiesWithScore = companies
      .map((company) => {
        // 전문분야 필터 (JSON 배열이므로 메모리에서 처리)
        if (specialty) {
          const specs = Array.isArray(company.specialties)
            ? (company.specialties as string[])
            : [];
          if (!specs.some((s) => s.includes(specialty))) return null;
        }

        // 지역 필터 (JSON 배열이므로 메모리에서 처리)
        if (region) {
          const areas = Array.isArray(company.serviceAreas)
            ? (company.serviceAreas as string[])
            : [];
          const areaMatch = areas.some((a) => a.includes(region));
          const addrMatch = company.address?.includes(region);
          if (!areaMatch && !addrMatch) return null;
        }

        // 키워드가 specialties에 포함되는 경우도 매칭 (DB OR에서 누락될 수 있음)
        if (keyword) {
          const kw = keyword.toLowerCase();
          const nameMatch = company.businessName?.toLowerCase().includes(kw);
          const descMatch = company.description?.toLowerCase().includes(kw);
          const specMatch = Array.isArray(company.specialties)
            ? (company.specialties as string[]).some((s) =>
                s.toLowerCase().includes(kw),
              )
            : false;
          if (!nameMatch && !descMatch && !specMatch) return null;
        }

        // 구독 등급 가중치 (구독 없으면 기본 1.0 적용)
        const subscription = company.subscriptions[0];
        const priorityWeight = subscription?.plan?.priorityWeight ?? 1.0;

        // 점수 계산
        const ratingScore = this.calcRatingScore(
          company.averageRating != null ? Number(company.averageRating) : null,
        );
        const responseScore = this.calcResponseTimeScore(company.responseTime);
        const matchingScore = this.calcMatchingScore(company.totalMatchings);
        const subscriptionScore = this.calcSubscriptionScore(
          typeof priorityWeight === 'object' && priorityWeight !== null
            ? (priorityWeight as any).toNumber()
            : (priorityWeight as number),
        );
        const profileScore = this.calcProfileCompleteness(company);

        // 신규 업체 부스트 (가입 30일 이내 +15점, 이후 60일까지 점진 감소)
        const boostScore = this.calcNewCompanyBoost(company.approvedAt);

        const totalScore =
          ratingScore * 0.35 +
          profileScore * 0.25 +
          responseScore * 0.15 +
          matchingScore * 0.15 +
          subscriptionScore * 0.1 +
          boostScore;

        return {
          id: company.id,
          businessName: company.businessName,
          businessNumber: company.businessNumber,
          representative: company.representative,
          address: company.address,
          detailAddress: company.detailAddress,
          description: company.description,
          profileImages: company.profileImages,
          specialties: company.specialties,
          serviceAreas: company.serviceAreas,
          minPrice: company.minPrice,
          maxPrice: company.maxPrice,
          averageRating: company.averageRating,
          totalReviews: company.totalReviews,
          totalMatchings: company.totalMatchings,
          responseTime: company.responseTime,
          identityVerified: company.identityVerified,
          experienceYears: company.experienceYears,
          contactHours: company.contactHours,
          employeeCount: company.employeeCount,
          subscriptionTier: subscription?.plan?.tier ?? null,
          isNew: boostScore > 0,
          distance: null,
          score: Math.round(totalScore * 10) / 10,
          baseScore: Math.round(totalScore * 10) / 10,
          user: company.user,
        };
      })
      .filter(Boolean) as any[];

    // 정렬
    this.sortCompanies(companiesWithScore, sortBy);

    // 업체 고유 품질 점수를 DB에 저장 (비동기, 페이지 내 업체만)
    const total = companiesWithScore.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedData = companiesWithScore.slice(
      startIndex,
      startIndex + limit,
    );

    const scoreUpdates = paginatedData.map((c: any) =>
      this.prisma.company.update({
        where: { id: c.id },
        data: {
          searchScore: c.baseScore,
          searchScoreAt: new Date(),
        },
      }),
    );
    Promise.allSettled(scoreUpdates).catch(() => {});

    return {
      data: paginatedData,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
      searchLocation: null,
    };
  }

  /** 정렬 */
  private sortCompanies(companies: any[], sortBy: SortBy) {
    switch (sortBy) {
      case SortBy.RATING:
        companies.sort(
          (a, b) =>
            (Number(b.averageRating) || 0) - (Number(a.averageRating) || 0),
        );
        break;
      case SortBy.REVIEWS:
        companies.sort((a, b) => (b.totalReviews || 0) - (a.totalReviews || 0));
        break;
      case SortBy.MATCHINGS:
        companies.sort(
          (a, b) => (b.totalMatchings || 0) - (a.totalMatchings || 0),
        );
        break;
      case SortBy.PRICE_LOW:
        companies.sort(
          (a, b) => (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity),
        );
        break;
      case SortBy.PRICE_HIGH:
        companies.sort((a, b) => (b.maxPrice ?? 0) - (a.maxPrice ?? 0));
        break;
      case SortBy.SCORE:
      default:
        companies.sort((a, b) => b.score - a.score);
        break;
    }
  }

  /** 평점 점수: 5.0=100, 0.0=0 */
  private calcRatingScore(rating: number | null): number {
    if (rating == null) return 0;
    return (rating / 5.0) * 100;
  }

  /** 응답속도 점수: 0분=100, 60분+=0 */
  private calcResponseTimeScore(responseTime: number | null): number {
    if (responseTime == null) return 50;
    return Math.max(0, 100 * (1 - responseTime / 60));
  }

  /** 매칭실적 점수: log 스케일, 0=0, 1000+=100 */
  private calcMatchingScore(totalMatchings: number | null): number {
    if (!totalMatchings) return 0;
    return Math.min(
      100,
      (Math.log10(totalMatchings + 1) / Math.log10(1001)) * 100,
    );
  }

  /** 구독등급 점수: priorityWeight 기반, 3.0=100 */
  private calcSubscriptionScore(priorityWeight: number): number {
    return Math.min(100, (priorityWeight / 3.0) * 100);
  }

  /** 신규 업체 부스트: 승인 후 30일 이내 +15점, 60일까지 점진 감소 */
  private calcNewCompanyBoost(approvedAt: Date | null): number {
    if (!approvedAt) return 0;

    const now = new Date();
    const diffMs = now.getTime() - new Date(approvedAt).getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays <= 30) {
      return 15; // 30일 이내: 최대 부스트
    } else if (diffDays <= 60) {
      // 30~60일: 15에서 0으로 선형 감소
      return Math.round(15 * (1 - (diffDays - 30) / 30) * 10) / 10;
    }
    return 0; // 60일 이후: 부스트 없음
  }

  /** 프로필 완성도 점수: 정보가 많이 채워진 업체 우대 */
  private calcProfileCompleteness(company: any): number {
    let filled = 0;
    const total = 16;

    if (company.description) filled++;
    if (
      Array.isArray(company.specialties) &&
      (company.specialties as any[]).length > 0
    )
      filled++;
    if (
      Array.isArray(company.serviceAreas) &&
      (company.serviceAreas as any[]).length > 0
    )
      filled++;
    if (company.minPrice != null || company.maxPrice != null) filled++;
    if (
      Array.isArray(company.profileImages) &&
      (company.profileImages as any[]).length > 0
    )
      filled++;
    if (
      Array.isArray(company.certificates) &&
      (company.certificates as any[]).length > 0
    )
      filled++;
    if (company.address) filled++;
    if (company.contactHours) filled++;
    if (company.employeeCount != null) filled++;
    if (company.companyUrl) filled++;
    if (company.experienceYears != null) filled++;
    if (company.serviceDetail) filled++;
    if (
      Array.isArray(company.portfolio) &&
      (company.portfolio as any[]).length > 0
    )
      filled++;
    if (company.contactEmail) filled++;
    if (company.identityVerified) filled++;
    if (Array.isArray(company.videos) && (company.videos as any[]).length > 0)
      filled++;

    return (filled / total) * 100;
  }
}
