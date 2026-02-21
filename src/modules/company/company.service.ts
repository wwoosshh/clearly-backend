import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { RedisService } from '../../common/cache/redis.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { SearchCompanyDto, SortBy } from './dto/search-company.dto';

interface CompanyWithScore {
  id: string;
  businessName: string;
  averageRating: string | null;
  totalReviews: number;
  totalMatchings: number;
  minPrice: number | null;
  maxPrice: number | null;
  score: number;
  [key: string]: unknown;
}

interface RawCompanyRow {
  id: string;
  business_name: string;
  business_number: string;
  representative: string;
  address: string | null;
  detail_address: string | null;
  description: string | null;
  profile_images: unknown;
  specialties: unknown;
  service_areas: unknown;
  min_price: number | null;
  max_price: number | null;
  average_rating: string | null;
  total_reviews: number;
  total_matchings: number;
  response_time: number | null;
  identity_verified: boolean;
  experience_years: number | null;
  contact_hours: string | null;
  employee_count: number | null;
  approved_at: Date | null;
  certificates: unknown;
  company_url: string | null;
  service_detail: string | null;
  portfolio: unknown;
  contact_email: string | null;
  videos: unknown;
  subscription_tier: string | null;
  priority_weight: string | null;
  user_id: string;
  user_name: string;
  user_profile_image: string | null;
}

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocodingService: GeocodingService,
    private readonly redis: RedisService,
  ) {}

  async create(data: Prisma.CompanyCreateInput) {
    return this.prisma.company.create({ data });
  }

  async findById(id: string) {
    const cacheKey = `company:detail:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached as Record<string, unknown>;

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
    const cached = await this.redis.get<{ id: string; [key: string]: unknown }>(cacheKey);
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
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    // 주소가 변경된 경우 위도/경도 재계산
    const newAddress = updateData.address as string | undefined;
    if (newAddress && newAddress !== company.address) {
      try {
        const coords = await this.geocodingService.geocodeAddress(
          newAddress,
        );
        if (coords) {
          updateData.latitude = coords.latitude;
          updateData.longitude = coords.longitude;
          this.logger.log(
            `업체 ${id} 주소 변경 → 좌표 재계산: ${coords.latitude}, ${coords.longitude}`,
          );
        } else {
          this.logger.warn(
            `업체 ${id} 주소 변경 → 좌표 변환 실패: "${newAddress}"`,
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

    const updateData: Prisma.CompanyUpdateInput = {
      verificationStatus: status as VerificationStatus,
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

    // --- DB 레벨 필터링 (jsonb 포함) ---
    const conditions: string[] = [
      `c.verification_status = 'APPROVED'`,
      `c.is_active = true`,
    ];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (specialty) {
      conditions.push(
        `EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.specialties, '[]'::jsonb)) AS s WHERE s ILIKE $${paramIdx})`,
      );
      params.push(`%${specialty}%`);
      paramIdx++;
    }

    if (region) {
      conditions.push(
        `(EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.service_areas, '[]'::jsonb)) AS a WHERE a ILIKE $${paramIdx}) OR c.address ILIKE $${paramIdx})`,
      );
      params.push(`%${region}%`);
      paramIdx++;
    }

    if (keyword) {
      conditions.push(
        `(c.business_name ILIKE $${paramIdx} OR c.description ILIKE $${paramIdx} OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.specialties, '[]'::jsonb)) AS s WHERE s ILIKE $${paramIdx}))`,
      );
      params.push(`%${keyword}%`);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    // COUNT 쿼리
    const countQuery = `SELECT COUNT(*)::int AS total FROM companies c WHERE ${whereClause}`;
    const countResult = await this.prisma.$queryRawUnsafe<[{ total: number }]>(
      countQuery,
      ...params,
    );
    const total = countResult[0]?.total ?? 0;

    // 정렬
    let orderClause: string;
    switch (sortBy) {
      case SortBy.RATING:
        orderClause = 'c.average_rating DESC NULLS LAST';
        break;
      case SortBy.REVIEWS:
        orderClause = 'c.total_reviews DESC';
        break;
      case SortBy.MATCHINGS:
        orderClause = 'c.total_matchings DESC';
        break;
      case SortBy.PRICE_LOW:
        orderClause = 'c.min_price ASC NULLS LAST';
        break;
      case SortBy.PRICE_HIGH:
        orderClause = 'c.max_price DESC NULLS LAST';
        break;
      case SortBy.SCORE:
      default:
        orderClause =
          'c.search_score DESC NULLS LAST, c.average_rating DESC NULLS LAST';
        break;
    }

    const offset = (page - 1) * limit;
    const limitParamIdx = paramIdx;
    const offsetParamIdx = paramIdx + 1;
    params.push(limit, offset);

    // 데이터 쿼리 (구독 정보 포함)
    const dataQuery = `
      SELECT
        c.id, c.business_name, c.business_number, c.representative,
        c.address, c.detail_address, c.description, c.profile_images,
        c.specialties, c.service_areas, c.min_price, c.max_price,
        c.average_rating, c.total_reviews, c.total_matchings,
        c.response_time, c.identity_verified, c.experience_years,
        c.contact_hours, c.employee_count, c.approved_at,
        c.certificates, c.company_url, c.service_detail,
        c.portfolio, c.contact_email, c.videos,
        sp.tier AS subscription_tier,
        sp.priority_weight AS priority_weight,
        u.id AS user_id, u.name AS user_name, u.profile_image AS user_profile_image
      FROM companies c
      LEFT JOIN LATERAL (
        SELECT cs.plan_id
        FROM company_subscriptions cs
        WHERE cs.company_id = c.id AND cs.status = 'ACTIVE'
        ORDER BY cs.created_at DESC
        LIMIT 1
      ) latest_sub ON true
      LEFT JOIN subscription_plans sp ON sp.id = latest_sub.plan_id
      LEFT JOIN users u ON u.id = c.user_id
      WHERE ${whereClause}
      ORDER BY ${orderClause}
      LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
    `;

    const rows = await this.prisma.$queryRawUnsafe<RawCompanyRow[]>(
      dataQuery,
      ...params,
    );

    // 페이지 결과에 대해서만 점수 계산
    const data = rows.map((row) => {
      const priorityWeight = row.priority_weight
        ? Number(row.priority_weight)
        : 1.0;

      const ratingScore = this.calcRatingScore(
        row.average_rating != null ? Number(row.average_rating) : null,
      );
      const responseScore = this.calcResponseTimeScore(row.response_time);
      const matchingScore = this.calcMatchingScore(row.total_matchings);
      const subscriptionScore = this.calcSubscriptionScore(priorityWeight);
      const profileScore = this.calcProfileCompletenessRaw(row);
      const boostScore = this.calcNewCompanyBoost(row.approved_at);

      const totalScore =
        ratingScore * 0.35 +
        profileScore * 0.25 +
        responseScore * 0.15 +
        matchingScore * 0.15 +
        subscriptionScore * 0.1 +
        boostScore;

      const score = Math.round(totalScore * 10) / 10;

      return {
        id: row.id,
        businessName: row.business_name,
        businessNumber: row.business_number,
        representative: row.representative,
        address: row.address,
        detailAddress: row.detail_address,
        description: row.description,
        profileImages: row.profile_images,
        specialties: row.specialties,
        serviceAreas: row.service_areas,
        minPrice: row.min_price,
        maxPrice: row.max_price,
        averageRating: row.average_rating,
        totalReviews: row.total_reviews,
        totalMatchings: row.total_matchings,
        responseTime: row.response_time,
        identityVerified: row.identity_verified,
        experienceYears: row.experience_years,
        contactHours: row.contact_hours,
        employeeCount: row.employee_count,
        subscriptionTier: row.subscription_tier ?? null,
        isNew: boostScore > 0,
        distance: null,
        score,
        baseScore: score,
        user: {
          id: row.user_id,
          name: row.user_name,
          profileImage: row.user_profile_image,
        },
      };
    });

    // SCORE 정렬일 경우 계산된 점수로 재정렬
    if (sortBy === SortBy.SCORE) {
      data.sort((a, b) => b.score - a.score);
    }

    // 검색 점수 배치 업데이트 (비동기)
    if (data.length > 0) {
      this.prisma
        .$transaction(
          data.map((c) =>
            this.prisma.company.update({
              where: { id: c.id },
              data: {
                searchScore: c.baseScore,
                searchScoreAt: new Date(),
              },
            }),
          ),
        )
        .catch(() => {});
    }

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      searchLocation: null,
    };
  }

  /** 정렬 */
  private sortCompanies(companies: CompanyWithScore[], sortBy: SortBy) {
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

  /** 프로필 완성도 점수 (raw query 결과용) */
  private calcProfileCompletenessRaw(row: RawCompanyRow): number {
    let filled = 0;
    const total = 16;
    const isNonEmptyArray = (v: unknown) => Array.isArray(v) && v.length > 0;

    if (row.description) filled++;
    if (isNonEmptyArray(row.specialties)) filled++;
    if (isNonEmptyArray(row.service_areas)) filled++;
    if (row.min_price != null || row.max_price != null) filled++;
    if (isNonEmptyArray(row.profile_images)) filled++;
    if (isNonEmptyArray(row.certificates)) filled++;
    if (row.address) filled++;
    if (row.contact_hours) filled++;
    if (row.employee_count != null) filled++;
    if (row.company_url) filled++;
    if (row.experience_years != null) filled++;
    if (row.service_detail) filled++;
    if (isNonEmptyArray(row.portfolio)) filled++;
    if (row.contact_email) filled++;
    if (row.identity_verified) filled++;
    if (isNonEmptyArray(row.videos)) filled++;

    return (filled / total) * 100;
  }

  /** 프로필 완성도 점수: 정보가 많이 채워진 업체 우대 */
  private calcProfileCompleteness(company: Record<string, unknown>): number {
    let filled = 0;
    const total = 16;
    const isNonEmptyArray = (v: unknown) => Array.isArray(v) && v.length > 0;

    if (company.description) filled++;
    if (isNonEmptyArray(company.specialties)) filled++;
    if (isNonEmptyArray(company.serviceAreas)) filled++;
    if (company.minPrice != null || company.maxPrice != null) filled++;
    if (isNonEmptyArray(company.profileImages)) filled++;
    if (isNonEmptyArray(company.certificates)) filled++;
    if (company.address) filled++;
    if (company.contactHours) filled++;
    if (company.employeeCount != null) filled++;
    if (company.companyUrl) filled++;
    if (company.experienceYears != null) filled++;
    if (company.serviceDetail) filled++;
    if (isNonEmptyArray(company.portfolio)) filled++;
    if (company.contactEmail) filled++;
    if (company.identityVerified) filled++;
    if (isNonEmptyArray(company.videos)) filled++;

    return (filled / total) * 100;
  }
}
