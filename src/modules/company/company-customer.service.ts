import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import {
  GetCustomersDto,
  CustomerSegment,
  CustomerSort,
} from './dto/get-customers.dto';
import { PipelineStage } from '@prisma/client';

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
  pipelineStage: PipelineStage;
  tags: string[];
  memoContent: string | null;
}

@Injectable()
export class CompanyCustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
  ) {}

  private async buildCustomerRows(companyId: string): Promise<CustomerRow[]> {
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

    if (allUserIds.length === 0) return [];

    const matchingUserIdSet = new Set(matchingUsers.map((m) => m.userId));

    // 메모 배치 조회
    const memos = await this.prisma.customerMemo.findMany({
      where: { companyId, userId: { in: allUserIds } },
    });
    const memoMap = new Map(memos.map((m) => [m.userId, m]));

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

      const chatRooms = await this.prisma.chatRoom.findMany({
        where: { companyId, userId },
        select: {
          id: true,
          lastSentAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

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

      const lastMatchingDate =
        matchings[0]?.completedAt || matchings[0]?.createdAt;
      const lastChatDate =
        chatRooms[0]?.lastSentAt || chatRooms[0]?.createdAt;
      const dates = [lastMatchingDate, lastChatDate].filter(Boolean) as Date[];
      const lastInteractionAt =
        dates.length > 0
          ? new Date(Math.max(...dates.map((d) => d.getTime())))
          : new Date(0);

      const latestMatching = matchings[0];
      const memo = memoMap.get(userId);

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
        pipelineStage: memo?.pipelineStage || PipelineStage.LEAD,
        tags: memo?.tags || [],
        memoContent: memo?.content || null,
      });
    }

    return customers;
  }

  async getCustomers(companyId: string, dto: GetCustomersDto) {
    const { page = 1, limit = 20, search, segment, sort, stage, tag } = dto;

    const customers = await this.buildCustomerRows(companyId);

    if (customers.length === 0) {
      return {
        items: [],
        meta: { total: 0, page, limit, totalPages: 0 },
        stats: { totalCustomers: 0, newThisMonth: 0, repeatCustomers: 0 },
      };
    }

    // 검색 필터
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

    // 세그먼트 필터
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

    // 파이프라인 단계 필터
    if (stage) {
      filtered = filtered.filter((c) => c.pipelineStage === stage);
    }

    // 태그 필터
    if (tag) {
      filtered = filtered.filter((c) => c.tags.includes(tag));
    }

    // 정렬
    switch (sort) {
      case CustomerSort.RECENT:
        filtered.sort(
          (a, b) =>
            b.lastInteractionAt.getTime() - a.lastInteractionAt.getTime(),
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

    // 페이지네이션
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
        pipelineStage: c.pipelineStage,
        tags: c.tags,
        memoContent: c.memoContent,
      })),
      meta: { total, page, limit, totalPages },
      stats: {
        totalCustomers: customers.length,
        newThisMonth,
        repeatCustomers,
      },
    };
  }

  async getCustomersPipeline(
    companyId: string,
    search?: string,
    tag?: string,
  ) {
    let customers = await this.buildCustomerRows(companyId);

    if (search) {
      const q = search.toLowerCase();
      customers = customers.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q)),
      );
    }

    if (tag) {
      customers = customers.filter((c) => c.tags.includes(tag));
    }

    const stages: PipelineStage[] = [
      PipelineStage.LEAD,
      PipelineStage.CONSULTING,
      PipelineStage.BOOKED,
      PipelineStage.COMPLETED,
      PipelineStage.VIP,
    ];

    const pipeline = stages.map((stage) => ({
      stage,
      customers: customers
        .filter((c) => c.pipelineStage === stage)
        .sort(
          (a, b) =>
            b.lastInteractionAt.getTime() - a.lastInteractionAt.getTime(),
        )
        .map((c) => ({
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
          pipelineStage: c.pipelineStage,
          tags: c.tags,
          memoContent: c.memoContent,
        })),
    }));

    return pipeline;
  }

  async updateCustomerStage(
    companyId: string,
    userId: string,
    stage: PipelineStage,
  ) {
    const memo = await this.prisma.customerMemo.upsert({
      where: { companyId_userId: { companyId, userId } },
      update: { pipelineStage: stage },
      create: { companyId, userId, content: '', pipelineStage: stage },
    });
    return { userId, pipelineStage: memo.pipelineStage };
  }

  async updateCustomerTags(
    companyId: string,
    userId: string,
    tags: string[],
  ) {
    const memo = await this.prisma.customerMemo.upsert({
      where: { companyId_userId: { companyId, userId } },
      update: { tags },
      create: { companyId, userId, content: '', tags },
    });
    return { userId, tags: memo.tags };
  }

  async getCustomerStats(companyId: string) {
    const customers = await this.buildCustomerRows(companyId);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const totalCustomers = customers.length;
    const newThisMonth = customers.filter(
      (c) => c.lastInteractionAt >= monthStart && c.totalMatchings <= 1,
    ).length;
    const repeatCustomers = customers.filter(
      (c) => c.completedMatchings >= 2,
    ).length;
    const repeatRate =
      totalCustomers > 0
        ? Math.round((repeatCustomers / totalCustomers) * 100)
        : 0;
    const totalRevenue = customers.reduce((sum, c) => sum + c.totalRevenue, 0);

    // 월별 매출 트렌드 (최근 6개월)
    const monthlyRevenue: { month: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);

      const matchings = await this.prisma.matching.findMany({
        where: {
          companyId,
          status: 'COMPLETED',
          completedAt: { gte: start, lt: end },
        },
        select: { estimatedPrice: true },
      });

      const revenue = matchings.reduce(
        (sum, m) => sum + (m.estimatedPrice || 0),
        0,
      );
      const label = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyRevenue.push({ month: label, revenue });
    }

    // 매출 TOP 5
    const topCustomers = [...customers]
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 5)
      .map((c) => ({
        userId: c.userId,
        name: c.name,
        totalRevenue: c.totalRevenue,
        completedMatchings: c.completedMatchings,
      }));

    // 파이프라인 단계별 수
    const stageCounts: Record<string, number> = {};
    for (const stage of Object.values(PipelineStage)) {
      stageCounts[stage] = customers.filter(
        (c) => c.pipelineStage === stage,
      ).length;
    }

    return {
      totalCustomers,
      newThisMonth,
      repeatRate,
      totalRevenue,
      monthlyRevenue,
      topCustomers,
      stageCounts,
    };
  }

  async sendBatchMessage(
    companyId: string,
    companyUserId: string,
    userIds: string[],
    content: string,
  ) {
    const results: { userId: string; success: boolean; error?: string }[] = [];

    for (const userId of userIds) {
      try {
        // 채팅방 찾기/생성
        const room = await this.chatService.createRoom(userId, companyId);
        // 메시지 발송
        await this.chatService.sendMessage(
          room.id,
          companyUserId,
          content,
          'TEXT',
        );
        results.push({ userId, success: true });
      } catch (err: any) {
        results.push({
          userId,
          success: false,
          error: err.message || 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return { successCount, failCount, results };
  }

  // ===== 태그 프리셋 관리 =====

  async getCompanyTags(companyId: string) {
    return this.prisma.companyTag.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createCompanyTag(companyId: string, name: string, color?: string) {
    return this.prisma.companyTag.create({
      data: {
        companyId,
        name,
        ...(color && { color }),
      },
    });
  }

  async deleteCompanyTag(companyId: string, tagId: string) {
    const tag = await this.prisma.companyTag.findFirst({
      where: { id: tagId, companyId },
    });
    if (!tag) throw new NotFoundException('태그를 찾을 수 없습니다.');

    // 해당 태그가 달린 CustomerMemo에서 제거
    const memosWithTag = await this.prisma.customerMemo.findMany({
      where: { companyId, tags: { has: tag.name } },
    });

    for (const memo of memosWithTag) {
      await this.prisma.customerMemo.update({
        where: { id: memo.id },
        data: { tags: memo.tags.filter((t) => t !== tag.name) },
      });
    }

    await this.prisma.companyTag.delete({ where: { id: tagId } });
    return { deleted: true };
  }

  // ===== 기존 메서드 =====

  async getCustomerDetail(companyId: string, userId: string) {
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

    const allDates = [
      ...matchings.map((m) => m.createdAt),
      ...chatRooms.map((c) => c.createdAt),
    ];
    const firstInteractionAt =
      allDates.length > 0
        ? new Date(Math.min(...allDates.map((d) => d.getTime())))
        : null;

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
      pipelineStage: memo?.pipelineStage || PipelineStage.LEAD,
      tags: memo?.tags || [],
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
