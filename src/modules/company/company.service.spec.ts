import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { RedisService } from '../../common/cache/redis.service';
import { SortBy } from './dto/search-company.dto';

describe('CompanyService', () => {
  let service: CompanyService;
  let prisma: any;
  let redis: any;
  let geocodingService: any;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'company@test.com',
    name: '업체 유저',
    phone: '01012345678',
    profileImage: null,
  };

  const mockCompany = {
    id: 'company-uuid-1',
    userId: 'user-uuid-1',
    businessName: '테스트 청소업체',
    businessNumber: '123-45-67890',
    representative: '김대표',
    address: '서울시 강남구 테헤란로 123',
    detailAddress: '5층',
    description: '전문 청소 업체입니다.',
    profileImages: ['img1.jpg'],
    specialties: ['이사청소', '입주청소'],
    serviceAreas: ['서울 강남구'],
    minPrice: 100000,
    maxPrice: 500000,
    averageRating: 4.5,
    totalReviews: 20,
    totalMatchings: 50,
    responseTime: 15,
    identityVerified: true,
    experienceYears: 5,
    contactHours: '09:00-18:00',
    employeeCount: 10,
    verificationStatus: 'APPROVED',
    isActive: true,
    approvedAt: new Date(),
    user: mockUser,
    subscriptions: [
      {
        plan: { tier: 'PRO' },
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyService,
        {
          provide: PrismaService,
          useValue: {
            company: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
            $queryRawUnsafe: jest.fn(),
            $transaction: jest.fn(),
          },
        },
        {
          provide: GeocodingService,
          useValue: {
            geocodeAddress: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<CompanyService>(CompanyService);
    prisma = module.get(PrismaService);
    redis = module.get(RedisService);
    geocodingService = module.get(GeocodingService);
  });

  describe('findById', () => {
    it('구독 tier 정보가 포함된 업체를 반환', async () => {
      redis.get.mockResolvedValue(null);
      prisma.company.findUnique.mockResolvedValue(mockCompany);

      const result = await service.findById('company-uuid-1');

      expect(result.id).toBe('company-uuid-1');
      expect(result.businessName).toBe('테스트 청소업체');
      expect(result.subscriptionTier).toBe('PRO');
      expect(redis.set).toHaveBeenCalledWith(
        'company:detail:company-uuid-1',
        expect.any(Object),
        600,
      );
    });

    it('존재하지 않는 업체면 NotFoundException', async () => {
      redis.get.mockResolvedValue(null);
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(
        service.findById('nonexistent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('캐시된 데이터가 있으면 캐시에서 반환', async () => {
      const cachedCompany = {
        id: 'company-uuid-1',
        businessName: '테스트 청소업체',
        subscriptionTier: 'PRO',
      };
      redis.get.mockResolvedValue(cachedCompany);

      const result = await service.findById('company-uuid-1');

      expect(result).toEqual(cachedCompany);
      expect(prisma.company.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('업체 정보를 정상적으로 수정', async () => {
      prisma.company.findUnique.mockResolvedValue(mockCompany);
      const updatedCompany = {
        ...mockCompany,
        description: '수정된 소개글입니다.',
      };
      prisma.company.update.mockResolvedValue(updatedCompany);

      const result = await service.update(
        'company-uuid-1',
        { description: '수정된 소개글입니다.' } as any,
        'user-uuid-1',
      );

      expect(result.description).toBe('수정된 소개글입니다.');
      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: 'company-uuid-1' },
        data: expect.objectContaining({
          description: '수정된 소개글입니다.',
        }),
      });
      expect(redis.del).toHaveBeenCalledWith(
        'company:profile:user-uuid-1',
        'company:detail:company-uuid-1',
      );
    });

    it('소유자가 아니면 ForbiddenException', async () => {
      prisma.company.findUnique.mockResolvedValue(mockCompany);

      await expect(
        service.update(
          'company-uuid-1',
          { description: '수정' } as any,
          'unauthorized-user',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('존재하지 않는 업체면 NotFoundException', async () => {
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(
        service.update(
          'nonexistent-id',
          { description: '수정' } as any,
          'user-uuid-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('주소 변경 시 좌표를 재계산', async () => {
      prisma.company.findUnique.mockResolvedValue(mockCompany);
      geocodingService.geocodeAddress.mockResolvedValue({
        latitude: 37.5665,
        longitude: 126.978,
      });
      prisma.company.update.mockResolvedValue({
        ...mockCompany,
        address: '서울시 종로구 세종로 1',
        latitude: 37.5665,
        longitude: 126.978,
      });

      await service.update(
        'company-uuid-1',
        { address: '서울시 종로구 세종로 1' } as any,
        'user-uuid-1',
      );

      expect(geocodingService.geocodeAddress).toHaveBeenCalledWith('서울시 종로구 세종로 1');
      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: 'company-uuid-1' },
        data: expect.objectContaining({
          address: '서울시 종로구 세종로 1',
          latitude: 37.5665,
          longitude: 126.978,
        }),
      });
    });
  });

  describe('searchCompanies', () => {
    it('페이지네이션된 결과와 점수를 반환', async () => {
      const mockRawRow = {
        id: 'company-uuid-1',
        business_name: '테스트 청소업체',
        business_number: '123-45-67890',
        representative: '김대표',
        address: '서울시 강남구',
        detail_address: '5층',
        description: '전문 청소 업체입니다.',
        profile_images: ['img1.jpg'],
        specialties: ['이사청소'],
        service_areas: ['서울 강남구'],
        min_price: 100000,
        max_price: 500000,
        average_rating: '4.5',
        total_reviews: 20,
        total_matchings: 50,
        response_time: 15,
        identity_verified: true,
        experience_years: 5,
        contact_hours: '09:00-18:00',
        employee_count: 10,
        approved_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), // 100일 전
        certificates: ['cert1.jpg'],
        company_url: 'https://test.com',
        service_detail: '상세 설명',
        portfolio: ['port1.jpg'],
        contact_email: 'test@test.com',
        videos: [],
        subscription_tier: 'PRO',
        priority_weight: '2.0',
        user_id: 'user-uuid-1',
        user_name: '업체 유저',
        user_profile_image: null,
      };

      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 1 }])  // count query
        .mockResolvedValueOnce([mockRawRow]);     // data query
      prisma.$transaction.mockResolvedValue([]);

      const result = await service.searchCompanies({
        keyword: '청소',
        sortBy: SortBy.SCORE,
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].businessName).toBe('테스트 청소업체');
      expect(result.data[0].score).toBeDefined();
      expect(typeof result.data[0].score).toBe('number');
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.totalPages).toBe(1);
    });

    it('필터 없이 기본 검색 수행', async () => {
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);
      prisma.$transaction.mockResolvedValue([]);

      const result = await service.searchCompanies({
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });
});
