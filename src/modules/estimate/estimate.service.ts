import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { ChatService } from '../chat/chat.service';
import { RedisService } from '../../common/cache/redis.service';
import { Prisma, CleaningType } from '@prisma/client';
import { CreateEstimateRequestDto } from './dto/create-estimate-request.dto';
import { SubmitEstimateDto } from './dto/submit-estimate.dto';
import {
  NOTIFICATION_EVENTS,
  NotificationEvent,
  BulkNotificationEvent,
} from '../notification/notification.events';
import { SystemSettingService } from '../system-setting/system-setting.service';

@Injectable()
export class EstimateService {
  private readonly logger = new Logger(EstimateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
    private readonly chatService: ChatService,
    private readonly eventEmitter: EventEmitter2,
    private readonly settings: SystemSettingService,
    private readonly redis: RedisService,
  ) {}

  /** 견적요청 생성 (USER) */
  async createEstimateRequest(userId: string, dto: CreateEstimateRequestDto) {
    // 동시 활성 견적 요청 최대 3건 제한
    const activeRequestCount = await this.prisma.estimateRequest.count({
      where: {
        userId,
        status: 'OPEN',
      },
    });
    const maxConcurrent = this.settings.get('max_concurrent_requests', 3);
    if (activeRequestCount >= maxConcurrent) {
      throw new BadRequestException(
        `동시에 최대 ${maxConcurrent}건의 견적요청만 가능합니다. 기존 요청이 마감된 후 다시 시도해주세요.`,
      );
    }

    // 동일 주소 + 동일 청소 유형으로 7일 이내 중복 요청 차단
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const duplicateRequest = await this.prisma.estimateRequest.findFirst({
      where: {
        userId,
        address: dto.address,
        cleaningType: dto.cleaningType,
        createdAt: { gte: sevenDaysAgo },
      },
    });
    if (duplicateRequest) {
      throw new BadRequestException(
        '동일 주소/청소 유형으로 7일 이내 중복 요청은 불가합니다.',
      );
    }

    const request = await this.prisma.estimateRequest.create({
      data: {
        userId,
        cleaningType: dto.cleaningType,
        address: dto.address,
        detailAddress: dto.detailAddress,
        latitude: dto.latitude,
        longitude: dto.longitude,
        areaSize: dto.areaSize,
        desiredDate: dto.desiredDate ? new Date(dto.desiredDate) : undefined,
        desiredTime: dto.desiredTime,
        message: dto.message,
        budget: dto.budget,
        images: dto.images,
        checklist: dto.checklist ?? undefined,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    this.logger.log(`견적요청 생성: id=${request.id}, userId=${userId}`);

    // 지역 + 전문분야 기반 타겟 업체 필터링 (DB 레벨)
    const reqLat = dto.latitude ?? request.latitude;
    const reqLng = dto.longitude ?? request.longitude;

    const baseWhere: Prisma.CompanyWhereInput = {
      isActive: true,
      verificationStatus: 'APPROVED',
    };

    // 좌표가 있으면 사각 범위(bounding box)로 DB에서 사전 필터링
    if (reqLat && reqLng) {
      const maxRangeKm = 50; // 최대 서비스 범위
      const latDelta = maxRangeKm / 111; // 위도 1도 ≈ 111km
      const lngDelta =
        maxRangeKm / (111 * Math.cos((Number(reqLat) * Math.PI) / 180));
      baseWhere.latitude = {
        gte: Number(reqLat) - latDelta,
        lte: Number(reqLat) + latDelta,
      };
      baseWhere.longitude = {
        gte: Number(reqLng) - lngDelta,
        lte: Number(reqLng) + lngDelta,
      };
    }

    const candidates = await this.prisma.company.findMany({
      where: baseWhere,
      select: {
        userId: true,
        serviceAreas: true,
        specialties: true,
        address: true,
        latitude: true,
        longitude: true,
        serviceRange: true,
      },
    });

    // 전문분야 + 정밀 거리 필터 (메모리 내 최소한의 필터링)
    const matchingCompanies = candidates.filter((company) => {
      const specs = Array.isArray(company.specialties)
        ? (company.specialties as string[])
        : [];
      const hasSpecialty =
        specs.length === 0 || specs.some((s) => s === dto.cleaningType);
      if (!hasSpecialty) return false;

      // 정밀 거리 검증 (bounding box로 걸러진 후보만)
      if (reqLat && reqLng && company.latitude && company.longitude) {
        const dist = this.haversineKm(
          Number(reqLat),
          Number(reqLng),
          Number(company.latitude),
          Number(company.longitude),
        );
        const maxRange = company.serviceRange ?? 50;
        return dist <= maxRange;
      }

      // 좌표 없으면 텍스트 기반 지역 매칭 (폴백)
      const areas = Array.isArray(company.serviceAreas)
        ? (company.serviceAreas as string[])
        : [];
      const requestRegionTokens = dto.address
        .replace(/특별시|광역시|특별자치시|특별자치도/g, '')
        .split(/[\s,]+/)
        .filter((t) => t.length >= 2)
        .slice(0, 3);

      return (
        areas.length === 0 ||
        areas.some((area) =>
          requestRegionTokens.some((token) => area.includes(token)),
        ) ||
        (company.address &&
          requestRegionTokens.some((token) =>
            company.address!.includes(token),
          ))
      );
    });

    if (matchingCompanies.length > 0) {
      this.eventEmitter.emit(
        NOTIFICATION_EVENTS.NEW_ESTIMATE_REQUEST,
        new BulkNotificationEvent(
          matchingCompanies.map((c) => c.userId),
          'NEW_ESTIMATE_REQUEST',
          '새 견적요청이 도착했습니다',
          `${dto.address} 지역 견적요청이 등록되었습니다.`,
          { estimateRequestId: request.id, cleaningType: dto.cleaningType },
        ),
      );
    }

    return request;
  }

  /** 견적요청 목록 (업체용: OPEN 전체, 유저용: 본인 것) */
  async getEstimateRequests(
    userId: string,
    role: string,
    page = 1,
    limit = 10,
  ) {
    const where: Prisma.EstimateRequestWhereInput = {};

    if (role === 'USER') {
      where.userId = userId;
    } else if (role === 'COMPANY') {
      where.status = 'OPEN';
    }

    const [requests, total] = await Promise.all([
      this.prisma.estimateRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true } },
          estimates: {
            include: {
              company: {
                select: { id: true, businessName: true },
              },
            },
          },
        },
      }),
      this.prisma.estimateRequest.count({ where }),
    ]);

    return {
      data: requests,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** 견적요청 상세 */
  async getEstimateRequestById(id: string, userId: string, role: string) {
    const request = await this.prisma.estimateRequest.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        estimates: {
          include: {
            company: {
              select: {
                id: true,
                businessName: true,
                averageRating: true,
                totalReviews: true,
                user: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('견적요청을 찾을 수 없습니다.');
    }

    // 권한 체크: USER는 본인 요청만, COMPANY는 OPEN이거나 본사가 견적 제출한 요청만
    if (role === 'USER' && request.userId !== userId) {
      throw new ForbiddenException('본인의 견적요청만 조회할 수 있습니다.');
    }
    if (role === 'COMPANY') {
      const company = await this.prisma.company.findUnique({
        where: { userId },
        select: { id: true },
      });
      const hasSubmitted = company
        ? request.estimates.some((e) => e.companyId === company.id)
        : false;
      if (request.status !== 'OPEN' && !hasSubmitted) {
        throw new ForbiddenException('열린 견적요청이거나 본사가 견적을 제출한 요청만 조회할 수 있습니다.');
      }
    }

    return request;
  }

  /** 견적 제출 (COMPANY, 일일 한도 차감) */
  async submitEstimate(
    userId: string,
    estimateRequestId: string,
    dto: SubmitEstimateDto,
  ) {
    // 업체 정보 조회
    const company = await this.prisma.company.findUnique({
      where: { userId },
    });
    if (!company) {
      throw new NotFoundException('업체 정보를 찾을 수 없습니다.');
    }

    // 견적요청 확인
    const request = await this.prisma.estimateRequest.findUnique({
      where: { id: estimateRequestId },
    });
    if (!request) {
      throw new NotFoundException('견적요청을 찾을 수 없습니다.');
    }
    if (request.status !== 'OPEN') {
      throw new BadRequestException('마감된 견적요청입니다.');
    }

    // 이미 제출한 견적 확인
    const existing = await this.prisma.estimate.findFirst({
      where: {
        estimateRequestId,
        companyId: company.id,
      },
    });
    if (existing) {
      throw new BadRequestException('이미 견적을 제출하셨습니다.');
    }

    // 견적 수 제한 확인
    const currentEstimateCount = await this.prisma.estimate.count({
      where: { estimateRequestId },
    });
    if (currentEstimateCount >= (request.maxEstimates ?? 5)) {
      throw new BadRequestException(
        `이 견적요청은 최대 ${request.maxEstimates ?? 5}개의 견적까지만 받을 수 있습니다.`,
      );
    }

    // 일일 견적 한도 확인
    const limitInfo = await this.subscriptionService.canSubmitEstimate(
      company.id,
    );
    if (limitInfo.limit === 0) {
      throw new BadRequestException(
        '구독이 필요합니다. 가입비를 결제해주세요.',
      );
    }
    if (limitInfo.remaining <= 0) {
      throw new BadRequestException(
        `오늘의 견적 제출 한도(${limitInfo.limit}건)를 초과했습니다.`,
      );
    }

    // 견적 생성 (unique 제약조건으로 동시 중복 제출 방지)
    let estimate;
    try {
      estimate = await this.prisma.estimate.create({
        data: {
          estimateRequestId,
          companyId: company.id,
          price: dto.price,
          message: dto.message,
          estimatedDuration: dto.estimatedDuration,
          availableDate: dto.availableDate
            ? new Date(dto.availableDate)
            : undefined,
          images: dto.images,
        },
        include: {
          company: {
            select: { id: true, businessName: true },
          },
          estimateRequest: {
            select: { id: true, cleaningType: true, address: true, userId: true },
          },
        },
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('이미 견적을 제출하셨습니다.');
      }
      throw err;
    }

    // 일일 카운터 증가
    await this.subscriptionService.incrementEstimateCount(company.id);

    this.logger.log(
      `견적 제출: id=${estimate.id}, companyId=${company.id}, requestId=${estimateRequestId}`,
    );

    // 견적요청 작성자에게 알림
    this.eventEmitter.emit(
      NOTIFICATION_EVENTS.ESTIMATE_SUBMITTED,
      new NotificationEvent(
        estimate.estimateRequest.userId,
        'ESTIMATE_SUBMITTED',
        '새 견적이 도착했습니다',
        `${company.businessName}에서 견적을 보냈습니다.`,
        { estimateRequestId, estimateId: estimate.id },
      ),
    );

    return estimate;
  }

  /** 내가 받은 견적 목록 (유저용 매칭내역) */
  async getMyEstimates(userId: string, page = 1, limit = 10) {
    const [estimates, total] = await Promise.all([
      this.prisma.estimate.findMany({
        where: {
          estimateRequest: { userId },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          company: {
            select: {
              id: true,
              businessName: true,
              averageRating: true,
              totalReviews: true,
              user: { select: { id: true, name: true } },
            },
          },
          estimateRequest: {
            select: {
              id: true,
              cleaningType: true,
              address: true,
              desiredDate: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.estimate.count({
        where: { estimateRequest: { userId } },
      }),
    ]);

    return {
      data: estimates,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** 견적 단건 조회 */
  async getEstimateById(estimateId: string, userId: string) {
    const estimate = await this.prisma.estimate.findUnique({
      where: { id: estimateId },
      include: {
        company: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
        estimateRequest: true,
      },
    });

    if (!estimate) {
      throw new NotFoundException('견적을 찾을 수 없습니다.');
    }

    // 본인의 견적요청에 대한 견적이거나, 해당 업체의 견적인지 확인
    const isRequestOwner = estimate.estimateRequest.userId === userId;
    const isCompanyOwner = estimate.company.user.id === userId;
    if (!isRequestOwner && !isCompanyOwner) {
      throw new ForbiddenException('해당 견적을 조회할 권한이 없습니다.');
    }

    return estimate;
  }

  /** 견적 수락 → Matching + ChatRoom 생성 (USER) */
  async acceptEstimate(userId: string, estimateId: string) {
    const estimate = await this.prisma.estimate.findUnique({
      where: { id: estimateId },
      include: {
        estimateRequest: true,
        company: true,
      },
    });

    if (!estimate) {
      throw new NotFoundException('견적을 찾을 수 없습니다.');
    }

    if (estimate.estimateRequest.userId !== userId) {
      throw new ForbiddenException(
        '본인의 견적요청에 대한 견적만 수락할 수 있습니다.',
      );
    }

    if (estimate.status !== 'SUBMITTED') {
      throw new BadRequestException('이미 처리된 견적입니다.');
    }

    // 트랜잭션: 견적 수락 + 매칭 생성 + 채팅방 생성 + 견적요청 마감
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. 견적 상태 변경
      const updatedEstimate = await tx.estimate.update({
        where: { id: estimateId },
        data: { status: 'ACCEPTED' },
      });

      // 2. 같은 요청의 다른 견적 거절 처리
      const otherEstimates = await tx.estimate.findMany({
        where: {
          estimateRequestId: estimate.estimateRequestId,
          id: { not: estimateId },
          status: 'SUBMITTED',
        },
        select: { id: true, companyId: true },
      });

      if (otherEstimates.length > 0) {
        await tx.estimate.updateMany({
          where: {
            id: { in: otherEstimates.map((e) => e.id) },
          },
          data: { status: 'REJECTED' },
        });
      }

      // 3. 매칭 생성
      const matching = await tx.matching.create({
        data: {
          userId,
          companyId: estimate.companyId,
          estimateId,
          cleaningType: estimate.estimateRequest.cleaningType,
          address: estimate.estimateRequest.address,
          detailAddress: estimate.estimateRequest.detailAddress,
          areaSize: estimate.estimateRequest.areaSize,
          desiredDate: estimate.estimateRequest.desiredDate,
          desiredTime: estimate.estimateRequest.desiredTime,
          message: estimate.estimateRequest.message,
          estimatedPrice: estimate.price,
          status: 'ACCEPTED',
        },
      });

      // 4. 채팅방 생성
      const chatRoom = await tx.chatRoom.create({
        data: {
          matchingId: matching.id,
          userId,
          companyId: estimate.companyId,
          estimateId,
        },
      });

      // 5. 견적요청 마감
      await tx.estimateRequest.update({
        where: { id: estimate.estimateRequestId },
        data: { status: 'CLOSED' },
      });

      // 6. 업체 매칭 카운트 증가
      await tx.company.update({
        where: { id: estimate.companyId },
        data: { totalMatchings: { increment: 1 } },
      });

      return { estimate: updatedEstimate, matching, chatRoom };
    });

    // 시스템 메시지 생성
    await this.chatService.sendMessage(
      result.chatRoom.id,
      userId,
      `견적이 수락되었습니다. 견적 금액: ${estimate.price.toLocaleString()}원`,
      'SYSTEM',
    );

    this.logger.log(
      `견적 수락: estimateId=${estimateId}, matchingId=${result.matching.id}, chatRoomId=${result.chatRoom.id}`,
    );

    // 업체에게 견적 수락 알림
    this.eventEmitter.emit(
      NOTIFICATION_EVENTS.ESTIMATE_ACCEPTED,
      new NotificationEvent(
        estimate.company.userId,
        'ESTIMATE_ACCEPTED',
        '견적이 수락되었습니다',
        `고객이 견적을 수락했습니다. 채팅방에서 상담을 진행해주세요.`,
        { estimateId, chatRoomId: result.chatRoom.id },
      ),
    );

    return result;
  }

  /** 견적 거부 (USER) */
  async rejectEstimate(userId: string, estimateId: string) {
    const estimate = await this.prisma.estimate.findUnique({
      where: { id: estimateId },
      include: {
        estimateRequest: true,
        company: { select: { id: true, userId: true, businessName: true } },
      },
    });

    if (!estimate) {
      throw new NotFoundException('견적을 찾을 수 없습니다.');
    }

    if (estimate.estimateRequest.userId !== userId) {
      throw new ForbiddenException(
        '본인의 견적요청에 대한 견적만 거부할 수 있습니다.',
      );
    }

    if (estimate.status !== 'SUBMITTED') {
      throw new BadRequestException('이미 처리된 견적입니다.');
    }

    const updated = await this.prisma.estimate.update({
      where: { id: estimateId },
      data: { status: 'REJECTED' },
    });

    this.logger.log(`견적 거부: estimateId=${estimateId}, userId=${userId}`);

    // 업체에게 견적 거절 알림
    this.eventEmitter.emit(
      NOTIFICATION_EVENTS.ESTIMATE_REJECTED,
      new NotificationEvent(
        estimate.company.userId,
        'ESTIMATE_REJECTED',
        '견적이 거절되었습니다',
        `고객이 견적을 거절했습니다.`,
        { estimateId, estimateRequestId: estimate.estimateRequestId },
      ),
    );

    return updated;
  }

  /** 견적 비교 데이터 조회 (USER: 본인 견적요청에 대한 견적들 비교) */
  async getEstimatesForComparison(requestId: string, userId: string) {
    const request = await this.prisma.estimateRequest.findUnique({
      where: { id: requestId },
      include: {
        estimates: {
          include: {
            company: {
              select: {
                id: true,
                businessName: true,
                specialties: true,
                minPrice: true,
                maxPrice: true,
                totalMatchings: true,
                responseTime: true,
                averageRating: true,
                totalReviews: true,
                verificationStatus: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('견적요청을 찾을 수 없습니다.');
    }

    if (request.userId !== userId) {
      throw new ForbiddenException('본인의 견적요청만 비교할 수 있습니다.');
    }

    return {
      request: {
        id: request.id,
        cleaningType: request.cleaningType,
        address: request.address,
        areaSize: request.areaSize,
        budget: request.budget,
        desiredDate: request.desiredDate,
        status: request.status,
      },
      estimates: request.estimates.map((est) => ({
        estimateId: est.id,
        companyId: est.companyId,
        businessName: est.company.businessName,
        price: est.price,
        estimatedDuration: est.estimatedDuration,
        availableDate: est.availableDate,
        message: est.message,
        status: est.status,
        averageRating: Number(est.company.averageRating ?? 0),
        totalReviews: est.company.totalReviews,
        totalMatchings: est.company.totalMatchings,
        responseTime: est.company.responseTime,
        isVerified: est.company.verificationStatus === 'APPROVED',
        specialties: Array.isArray(est.company.specialties)
          ? (est.company.specialties as string[])
          : [],
        minPrice: est.company.minPrice,
        maxPrice: est.company.maxPrice,
      })),
    };
  }

  /** Haversine 거리 계산 (km) */
  private haversineKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** 예상 가격 조회 (공개 API) */
  async getPriceEstimate(
    cleaningType: string,
    areaSize?: number,
    address?: string,
  ) {
    const areaBucket = areaSize ? this.getAreaBucket(areaSize) : null;

    // Redis 캐시 (1시간)
    const cacheKey = `estimate:price:${cleaningType}:${areaBucket ? `${areaBucket.min}-${areaBucket.max}` : 'all'}:${address ?? 'all'}`;
    const cached = await this.redis.get<{ minPrice: number; avgPrice: number; maxPrice: number; sampleCount: number }>(cacheKey);
    if (cached) return cached;

    // 1차: cleaningType + areaSize 구간 + 지역으로 조회
    const baseWhere: Prisma.MatchingWhereInput = {
      status: 'COMPLETED',
      estimatedPrice: { gt: 0 },
      cleaningType: cleaningType as CleaningType,
    };

    if (areaBucket) {
      baseWhere.areaSize = { gte: areaBucket.min, lte: areaBucket.max };
    }

    if (address) {
      const region = address.split(/[\s,]+/)[0];
      if (region && region.length >= 2) {
        baseWhere.address = { contains: region };
      }
    }

    type AggResult = {
      _avg: { estimatedPrice: number | null };
      _min: { estimatedPrice: number | null };
      _max: { estimatedPrice: number | null };
      _count: { id: number };
    };

    const aggregate = (where: Prisma.MatchingWhereInput): Promise<AggResult> =>
      this.prisma.matching.aggregate({
        where,
        _avg: { estimatedPrice: true },
        _min: { estimatedPrice: true },
        _max: { estimatedPrice: true },
        _count: { id: true },
      }) as Promise<AggResult>;

    let result = await aggregate(baseWhere);

    // 2차 폴백: 결과 0건이면 cleaningType + areaSize 구간만으로 조회
    if (result._count.id === 0 && (address || areaBucket)) {
      const fallbackWhere: Prisma.MatchingWhereInput = {
        status: 'COMPLETED',
        estimatedPrice: { gt: 0 },
        cleaningType: cleaningType as CleaningType,
      };

      if (areaBucket) {
        fallbackWhere.areaSize = { gte: areaBucket.min, lte: areaBucket.max };
      }

      result = await aggregate(fallbackWhere);
    }

    // 3차 폴백: cleaningType만으로 조회
    if (result._count.id === 0) {
      result = await aggregate({
        status: 'COMPLETED',
        estimatedPrice: { gt: 0 },
        cleaningType: cleaningType as CleaningType,
      });
    }

    const priceResult = {
      minPrice: result._min.estimatedPrice ?? 0,
      avgPrice: Math.round(result._avg.estimatedPrice ?? 0),
      maxPrice: result._max.estimatedPrice ?? 0,
      sampleCount: result._count.id,
    };

    await this.redis.set(cacheKey, priceResult, 3600); // 1시간 캐시
    return priceResult;
  }

  private getAreaBucket(areaSize: number): { min: number; max: number } {
    if (areaSize <= 15) return { min: 1, max: 15 };
    if (areaSize <= 25) return { min: 16, max: 25 };
    if (areaSize <= 35) return { min: 26, max: 35 };
    if (areaSize <= 50) return { min: 36, max: 50 };
    return { min: 51, max: 99999 };
  }

  /** 업체가 제출한 견적 목록 (COMPANY) */
  async getCompanyEstimates(userId: string, page = 1, limit = 10) {
    const company = await this.prisma.company.findUnique({
      where: { userId },
    });
    if (!company) {
      throw new NotFoundException('업체 정보를 찾을 수 없습니다.');
    }

    const where = { companyId: company.id };

    const [estimates, total] = await Promise.all([
      this.prisma.estimate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          estimateRequest: {
            select: {
              id: true,
              cleaningType: true,
              address: true,
              detailAddress: true,
              areaSize: true,
              desiredDate: true,
              desiredTime: true,
              message: true,
              budget: true,
              status: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.estimate.count({ where }),
    ]);

    return {
      data: estimates,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
