import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GetCustomersDto,
  CustomerSegment,
  CustomerSort,
} from './dto/get-customers.dto';

interface CustomerRow {
  userId: string;
  name: string;
  phone: string | null;
  profileImage: string | null;
  address: string | null;
  cleaningType: string | null;
  totalMatchings: number;
  completedMatchings: number;
  inProgressMatchings: number;
  totalRevenue: number;
  averageRating: number | null;
  lastInteractionAt: Date;
  hasChatOnly: boolean;
}

@Injectable()
export class CompanyCustomerService {
  constructor(private readonly prisma: PrismaService) {}

  async getCustomers(companyId: string, dto: GetCustomersDto) {
    const { page = 1, limit = 20, search, segment, sort } = dto;

    // 1) 매칭을 통해 연결된 고객 ID 조회
    const matchingUsers = await this.prisma.matching.findMany({
      where: { companyId },
      select: { userId: true },
      distinct: ['userId'],
    });

    // 2) 채팅방을 통해 연결된 고객 ID 조회
    const chatUsers = await this.prisma.chatRoom.findMany({
      where: { companyId },
      select: { userId: true },
      distinct: ['userId'],
    });

    // 3) 합집합 (unique userIds)
    const allUserIds = [
      ...new Set([
        ...matchingUsers.map((m) => m.userId),
        ...chatUsers.map((c) => c.userId),
      ]),
    ];

    if (allUserIds.length === 0) {
      return {
        items: [],
        meta: { total: 0, page, limit, totalPages: 0 },
        stats: { totalCustomers: 0, newThisMonth: 0, repeatCustomers: 0 },
      };
    }

    // 매칭이 있는 userId set
    const matchingUserIdSet = new Set(matchingUsers.map((m) => m.userId));

    // 4) 각 고객별 상세 정보 집계
    const customers: CustomerRow[] = [];

    for (const userId of allUserIds) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          phone: true,
          profileImage: true,
        },
      });

      if (!user) continue;

      // 매칭 데이터
      const matchings = await this.prisma.matching.findMany({
        where: { companyId, userId },
        select: {
          id: true,
          status: true,
          cleaningType: true,
          address: true,
          estimatedPrice: true,
          createdAt: true,
          completedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // 채팅방 데이터
      const chatRooms = await this.prisma.chatRoom.findMany({
        where: { companyId, userId },
        select: {
          id: true,
          lastSentAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // 리뷰 평균 평점
      const reviewAgg = await this.prisma.review.aggregate({
        where: { companyId, userId },
        _avg: { rating: true },
      });

      const totalMatchings = matchings.length;
      const completedMatchings = matchings.filter(
        (m) => m.status === 'COMPLETED',
      ).length;
      const inProgressMatchings = matchings.filter(
        (m) => m.status === 'REQUESTED' || m.status === 'ACCEPTED',
      ).length;
      const totalRevenue = matchings
        .filter((m) => m.status === 'COMPLETED')
        .reduce((sum, m) => sum + (m.estimatedPrice || 0), 0);

      // 가장 최근 상호작용 시각
      const lastMatchingDate = matchings[0]?.completedAt || matchings[0]?.createdAt;
      const lastChatDate = chatRooms[0]?.lastSentAt || chatRooms[0]?.createdAt;
      const dates = [lastMatchingDate, lastChatDate].filter(Boolean) as Date[];
      const lastInteractionAt =
        dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date(0);

      // 최근 매칭 주소 & 청소유형
      const latestMatching = matchings[0];

      customers.push({
        userId: user.id,
        name: user.name,
        phone: user.phone,
        profileImage: user.profileImage,
        address: latestMatching?.address || null,
        cleaningType: latestMatching?.cleaningType || null,
        totalMatchings,
        completedMatchings,
        inProgressMatchings,
        totalRevenue,
        averageRating: reviewAgg._avg.rating,
        lastInteractionAt,
        hasChatOnly: !matchingUserIdSet.has(userId),
      });
    }

    // 5) 검색 필터
    let filtered = customers;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q)) ||
          (c.address && c.address.toLowerCase().includes(q)),
      );
    }

    // 6) 세그먼트 필터
    switch (segment) {
      case CustomerSegment.IN_PROGRESS:
        filtered = filtered.filter((c) => c.inProgressMatchings > 0);
        break;
      case CustomerSegment.COMPLETED:
        filtered = filtered.filter(
          (c) => c.completedMatchings > 0 && c.inProgressMatchings === 0,
        );
        break;
      case CustomerSegment.REPEAT:
        filtered = filtered.filter((c) => c.completedMatchings >= 2);
        break;
      case CustomerSegment.CHAT_ONLY:
        filtered = filtered.filter((c) => c.hasChatOnly);
        break;
    }

    // 7) 정렬
    switch (sort) {
      case CustomerSort.RECENT:
        filtered.sort(
          (a, b) => b.lastInteractionAt.getTime() - a.lastInteractionAt.getTime(),
        );
        break;
      case CustomerSort.FREQUENCY:
        filtered.sort((a, b) => b.totalMatchings - a.totalMatchings);
        break;
      case CustomerSort.REVENUE:
        filtered.sort((a, b) => b.totalRevenue - a.totalRevenue);
        break;
    }

    // 통계 계산
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const newThisMonth = customers.filter(
      (c) => c.lastInteractionAt >= monthStart && c.totalMatchings <= 1,
    ).length;
    const repeatCustomers = customers.filter(
      (c) => c.completedMatchings >= 2,
    ).length;

    // 8) 페이지네이션
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paged = filtered.slice(skip, skip + limit);

    return {
      items: paged.map((c) => ({
        userId: c.userId,
        name: c.name,
        phone: c.phone,
        profileImage: c.profileImage,
        address: c.address,
        cleaningType: c.cleaningType,
        totalMatchings: c.totalMatchings,
        completedMatchings: c.completedMatchings,
        inProgressMatchings: c.inProgressMatchings,
        totalRevenue: c.totalRevenue,
        averageRating: c.averageRating,
        lastInteractionAt: c.lastInteractionAt.toISOString(),
        isRepeat: c.completedMatchings >= 2,
        isChatOnly: c.hasChatOnly,
      })),
      meta: { total, page, limit, totalPages },
      stats: {
        totalCustomers: customers.length,
        newThisMonth,
        repeatCustomers,
      },
    };
  }

  async getCustomerDetail(companyId: string, userId: string) {
    // 유저 정보
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        phone: true,
        profileImage: true,
      },
    });

    if (!user) {
      throw new NotFoundException('고객을 찾을 수 없습니다.');
    }

    // 매칭 이력 (리뷰 포함)
    const matchings = await this.prisma.matching.findMany({
      where: { companyId, userId },
      include: {
        review: {
          select: {
            id: true,
            rating: true,
            content: true,
          },
        },
        chatRoom: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 채팅방 목록
    const chatRooms = await this.prisma.chatRoom.findMany({
      where: { companyId, userId },
      select: {
        id: true,
        matchingId: true,
        lastMessage: true,
        lastSentAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // 통계
    const completedMatchings = matchings.filter(
      (m) => m.status === 'COMPLETED',
    );
    const totalRevenue = completedMatchings.reduce(
      (sum, m) => sum + (m.estimatedPrice || 0),
      0,
    );
    const reviewAgg = await this.prisma.review.aggregate({
      where: { companyId, userId },
      _avg: { rating: true },
    });

    // 첫 상호작용 일시
    const allDates = [
      ...matchings.map((m) => m.createdAt),
      ...chatRooms.map((c) => c.createdAt),
    ];
    const firstInteractionAt =
      allDates.length > 0
        ? new Date(Math.min(...allDates.map((d) => d.getTime())))
        : null;

    // 메모 조회
    const memo = await this.prisma.customerMemo.findUnique({
      where: {
        companyId_userId: { companyId, userId },
      },
    });

    return {
      user,
      stats: {
        totalMatchings: matchings.length,
        completedMatchings: completedMatchings.length,
        totalRevenue,
        averageRating: reviewAgg._avg.rating,
        firstInteractionAt: firstInteractionAt?.toISOString() || null,
      },
      memo: memo?.content || null,
      matchings: matchings.map((m) => ({
        id: m.id,
        status: m.status,
        cleaningType: m.cleaningType,
        address: m.address,
        detailAddress: m.detailAddress,
        estimatedPrice: m.estimatedPrice,
        desiredDate: m.desiredDate,
        completedAt: m.completedAt,
        createdAt: m.createdAt,
        review: m.review,
        chatRoomId: m.chatRoom?.id || null,
      })),
      chatRooms: chatRooms.map((c) => ({
        id: c.id,
        lastMessage: c.lastMessage,
        lastSentAt: c.lastSentAt,
        createdAt: c.createdAt,
        hasMatching: !!c.matchingId,
      })),
    };
  }

  async upsertMemo(companyId: string, userId: string, content: string) {
    const memo = await this.prisma.customerMemo.upsert({
      where: {
        companyId_userId: { companyId, userId },
      },
      update: { content },
      create: { companyId, userId, content },
    });

    return {
      id: memo.id,
      content: memo.content,
      updatedAt: memo.updatedAt,
    };
  }
}
