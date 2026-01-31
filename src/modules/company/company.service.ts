import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { SearchCompanyDto, SortBy } from './dto/search-company.dto';

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocodingService: GeocodingService,
  ) {}

  async create(data: any) {
    return this.prisma.company.create({ data });
  }

  async findById(id: string) {
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
      },
    });

    if (!company) {
      throw new NotFoundException('업체를 찾을 수 없습니다.');
    }

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

    return this.prisma.company.update({
      where: { id },
      data,
    });
  }

  async updateApprovalStatus(id: string, status: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
    });

    if (!company) {
      throw new NotFoundException('업체를 찾을 수 없습니다.');
    }

    return this.prisma.company.update({
      where: { id },
      data: { verificationStatus: status as any },
    });
  }

  async searchCompanies(dto: SearchCompanyDto) {
    const {
      keyword,
      specialty,
      region,
      address,
      sortBy = SortBy.SCORE,
      page = 1,
      limit = 10,
      maxDistance = 50,
    } = dto;
    let { latitude, longitude } = dto;

    // 주소가 있으면 좌표로 변환 시도
    if (address && (!latitude || !longitude)) {
      const coords = await this.geocodingService.geocodeAddress(address);
      if (coords) {
        latitude = coords.latitude;
        longitude = coords.longitude;
      }
    }

    // 승인된 활성 업체 조회 (좌표 필수 조건 제거)
    const companies = await this.prisma.company.findMany({
      where: {
        verificationStatus: 'APPROVED',
        isActive: true,
      },
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
          where: {
            status: 'ACTIVE',
          },
          include: {
            plan: true,
          },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const hasSearchLocation = latitude != null && longitude != null;

    // 필터링 + 점수 산출
    const companiesWithScore = companies
      .map((company) => {
        // 키워드 필터: 업체명 또는 소개에 포함
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

        // 전문분야 필터
        if (specialty) {
          const specs = Array.isArray(company.specialties)
            ? (company.specialties as string[])
            : [];
          if (!specs.some((s) => s.includes(specialty))) return null;
        }

        // 지역 필터: serviceAreas 또는 address에 포함
        if (region) {
          const areas = Array.isArray(company.serviceAreas)
            ? (company.serviceAreas as string[])
            : [];
          const areaMatch = areas.some((a) => a.includes(region));
          const addrMatch = company.address?.includes(region);
          if (!areaMatch && !addrMatch) return null;
        }

        // 거리 계산 (좌표가 있는 경우에만)
        let distance: number | null = null;
        if (
          hasSearchLocation &&
          company.latitude != null &&
          company.longitude != null
        ) {
          distance = this.calculateHaversineDistance(
            latitude!,
            longitude!,
            Number(company.latitude),
            Number(company.longitude),
          );
          if (distance > maxDistance) return null;
        }

        // 구독 등급 가중치
        const subscription = company.subscriptions[0];
        const priorityWeight = subscription?.plan?.priorityWeight ?? 1.0;

        // 가중 점수 산출 (위치 유무에 따라 가중치 조정)
        const ratingScore = this.calcRatingScore(
          company.averageRating != null
            ? Number(company.averageRating)
            : null,
        );
        const responseScore = this.calcResponseTimeScore(
          company.responseTime,
        );
        const matchingScore = this.calcMatchingScore(
          company.totalMatchings,
        );
        const subscriptionScore = this.calcSubscriptionScore(
          typeof priorityWeight === 'object' && priorityWeight !== null
            ? (priorityWeight as any).toNumber()
            : (priorityWeight as number),
        );
        const profileScore = this.calcProfileCompleteness(company);

        let totalScore: number;
        if (hasSearchLocation && distance != null) {
          // 위치 정보 있을 때: 거리 포함
          const distanceScore = this.calcDistanceScore(distance, maxDistance);
          totalScore =
            distanceScore * 0.3 +
            ratingScore * 0.25 +
            profileScore * 0.15 +
            responseScore * 0.1 +
            matchingScore * 0.1 +
            subscriptionScore * 0.1;
        } else {
          // 위치 정보 없을 때: 거리 제외, 다른 요소로 보상
          totalScore =
            ratingScore * 0.35 +
            profileScore * 0.25 +
            responseScore * 0.15 +
            matchingScore * 0.15 +
            subscriptionScore * 0.1;
        }

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
          distance:
            distance != null ? Math.round(distance * 10) / 10 : null,
          score: Math.round(totalScore * 10) / 10,
          user: company.user,
        };
      })
      .filter(Boolean) as any[];

    // 정렬
    this.sortCompanies(companiesWithScore, sortBy);

    // 점수를 DB에 저장 (비동기, 검색 결과 반환에 영향 없음)
    const scoreUpdates = companiesWithScore.map((c) =>
      this.prisma.company.update({
        where: { id: c.id },
        data: {
          searchScore: c.score,
          searchScoreAt: new Date(),
        },
      }),
    );
    Promise.allSettled(scoreUpdates).catch(() => {});

    // 페이지네이션
    const total = companiesWithScore.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedData = companiesWithScore.slice(
      startIndex,
      startIndex + limit,
    );

    return {
      data: paginatedData,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
      searchLocation: hasSearchLocation
        ? { latitude, longitude }
        : null,
    };
  }

  /** 정렬 */
  private sortCompanies(companies: any[], sortBy: SortBy) {
    switch (sortBy) {
      case SortBy.RATING:
        companies.sort(
          (a, b) => (Number(b.averageRating) || 0) - (Number(a.averageRating) || 0),
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
        companies.sort(
          (a, b) => (b.maxPrice ?? 0) - (a.maxPrice ?? 0),
        );
        break;
      case SortBy.SCORE:
      default:
        companies.sort((a, b) => b.score - a.score);
        break;
    }
  }

  /** Haversine 공식으로 두 좌표 간 거리 계산 (km) */
  private calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // 지구 반경 (km)
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /** 거리 점수: 0km=100, maxDistance=0 */
  private calcDistanceScore(
    distance: number | null,
    maxDistance: number,
  ): number {
    if (distance == null) return 50; // 거리 정보 없으면 중간값
    return Math.max(0, 100 * (1 - distance / maxDistance));
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
    return Math.min(100, (Math.log10(totalMatchings + 1) / Math.log10(1001)) * 100);
  }

  /** 구독등급 점수: priorityWeight 기반, 3.0=100 */
  private calcSubscriptionScore(priorityWeight: number): number {
    return Math.min(100, (priorityWeight / 3.0) * 100);
  }

  /** 프로필 완성도 점수: 정보가 많이 채워진 업체 우대 */
  private calcProfileCompleteness(company: any): number {
    let filled = 0;
    const total = 7;

    if (company.description) filled++;
    if (Array.isArray(company.specialties) && (company.specialties as any[]).length > 0) filled++;
    if (Array.isArray(company.serviceAreas) && (company.serviceAreas as any[]).length > 0) filled++;
    if (company.minPrice != null || company.maxPrice != null) filled++;
    if (Array.isArray(company.profileImages) && (company.profileImages as any[]).length > 0) filled++;
    if (Array.isArray(company.certificates) && (company.certificates as any[]).length > 0) filled++;
    if (company.address) filled++;

    return (filled / total) * 100;
  }
}
