import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { ResolveReportDto, ReportActionType } from './dto/resolve-report.dto';
import { SystemSettingService } from '../system-setting/system-setting.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
    private readonly settings: SystemSettingService,
  ) {}

  // ─── 대시보드 ───────────────────────────────────────────

  async getDashboardStats() {
    const [
      totalUsers,
      totalCompanies,
      pendingCompanies,
      totalMatchings,
      pendingReports,
      completedMatchings,
      totalReviews,
      openEstimateRequests,
      activeChatRooms,
      pendingInquiries,
      activeSubscriptions,
      trialSubscriptions,
      expiredSubscriptions,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.company.count(),
      this.prisma.company.count({
        where: { verificationStatus: 'PENDING' },
      }),
      this.prisma.matching.count(),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
      this.prisma.matching.count({ where: { status: 'COMPLETED' } }),
      this.prisma.review.count(),
      this.prisma.estimateRequest.count({ where: { status: 'OPEN' } }),
      this.prisma.chatRoom.count({ where: { isActive: true } }),
      this.prisma.inquiry.count({ where: { status: 'PENDING' } }),
      this.prisma.companySubscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.companySubscription.count({ where: { status: 'ACTIVE', isTrial: true } }),
      this.prisma.companySubscription.count({ where: { status: 'EXPIRED' } }),
    ]);

    return {
      totalUsers,
      totalCompanies,
      pendingCompanies,
      totalMatchings,
      pendingReports,
      completedMatchings,
      totalReviews,
      openEstimateRequests,
      activeChatRooms,
      pendingInquiries,
      activeSubscriptions,
      trialSubscriptions,
      expiredSubscriptions,
    };
  }

  // ─── 사용자 관리 ────────────────────────────────────────

  async getUsers(page: number, limit: number, filters: any) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters?.role) {
      where.role = filters.role;
    }
    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive === 'true';
    }
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { email: { contains: filters.search } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: true,
      },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    const isCompany = user.role === 'COMPANY' && user.company;
    const companyId = user.company?.id;

    // 매칭: 일반 유저는 userId, 업체는 companyId로 조회
    const matchingWhere = isCompany ? { companyId } : { userId };

    // 리뷰: 일반 유저는 userId(작성자), 업체는 companyId(대상)
    const reviewWhere = isCompany ? { companyId } : { userId };

    // 신고: 본인이 신고하거나 신고당한 것 (업체일 경우 companyId도 포함)
    const reportOrConditions: any[] = [
      { reporterId: userId },
      { targetType: 'USER', targetId: userId },
    ];
    if (isCompany && companyId) {
      reportOrConditions.push({ targetType: 'COMPANY', targetId: companyId });
    }

    const queries: Promise<any>[] = [
      this.prisma.matching.findMany({
        where: matchingWhere,
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          company: {
            select: { id: true, businessName: true },
          },
        },
      }),
      this.prisma.review.findMany({
        where: reviewWhere,
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true } },
          company: {
            select: { id: true, businessName: true },
          },
        },
      }),
      this.prisma.report.findMany({
        where: { OR: reportOrConditions },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      this.prisma.estimateRequest.findMany({
        where: { userId },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
    ];

    // 업체일 경우 제출한 견적도 함께 조회
    if (isCompany && companyId) {
      queries.push(
        this.prisma.estimate.findMany({
          where: { companyId },
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            estimateRequest: {
              select: {
                id: true,
                cleaningType: true,
                address: true,
                status: true,
                user: { select: { id: true, name: true } },
              },
            },
          },
        }),
      );
    }

    const results = await Promise.all(queries);

    return {
      ...user,
      recentMatchings: results[0],
      recentReviews: results[1],
      recentReports: results[2],
      estimateRequests: results[3],
      recentEstimates: results[4] ?? [],
    };
  }

  async toggleUserActive(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    const newIsActive = !user.isActive;

    return this.prisma.$transaction(async (tx) => {
      const updateData: any = { isActive: newIsActive };
      if (newIsActive) {
        updateData.deactivatedAt = null;
      }

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: updateData,
      });

      if (user.role === 'COMPANY' && user.company) {
        await tx.company.update({
          where: { id: user.company.id },
          data: { isActive: newIsActive },
        });
      }

      return updatedUser;
    });
  }

  // ─── 업체 관리 ──────────────────────────────────────────

  async getCompanies(page: number, limit: number, status?: string) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.verificationStatus = status;
    }

    const [companies, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              phone: true,
              isActive: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.company.count({ where }),
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

  async getCompanyDetail(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('업체를 찾을 수 없습니다.');
    }

    const [matchings, reviews, estimates, activeSubscription, subscriptions] =
      await Promise.all([
        this.prisma.matching.findMany({
          where: { companyId },
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        }),
        this.prisma.review.findMany({
          where: { companyId },
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, name: true } },
          },
        }),
        this.prisma.estimate.findMany({
          where: { companyId },
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            estimateRequest: {
              select: {
                id: true,
                cleaningType: true,
                address: true,
                status: true,
              },
            },
          },
        }),
        this.subscriptionService.getHighestActiveSubscription(companyId),
        this.prisma.companySubscription.findMany({
          where: { companyId },
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { plan: true },
        }),
      ]);

    return {
      ...company,
      matchings,
      reviews,
      estimates,
      activeSubscription,
      subscriptions,
    };
  }

  async approveCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('업체를 찾을 수 없습니다.');
    }

    const updatedCompany = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id: companyId },
        data: {
          verificationStatus: 'APPROVED',
          approvedAt: new Date(),
        },
      });

      await tx.user.update({
        where: { id: company.userId },
        data: { isActive: true },
      });

      return updated;
    });

    // 신규 업체 승인 시 3개월 무료 Basic 구독 생성 (트랜잭션 외부 - 실패해도 승인은 유지)
    try {
      await this.subscriptionService.createFreeTrial(companyId);
      this.logger.log(`무료 체험 구독 생성: companyId=${companyId}`);
    } catch (error) {
      this.logger.error(
        `무료 체험 구독 생성 실패: companyId=${companyId}, error=${error}`,
      );
    }

    return updatedCompany;
  }

  async rejectCompany(companyId: string, rejectionReason: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('업체를 찾을 수 없습니다.');
    }

    return this.prisma.company.update({
      where: { id: companyId },
      data: {
        verificationStatus: 'REJECTED',
        rejectionReason,
      },
    });
  }

  async suspendCompany(companyId: string, reason: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('업체를 찾을 수 없습니다.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedCompany = await tx.company.update({
        where: { id: companyId },
        data: {
          verificationStatus: 'SUSPENDED',
          rejectionReason: reason,
          isActive: false,
        },
      });

      await tx.user.update({
        where: { id: company.userId },
        data: { isActive: false },
      });

      return updatedCompany;
    });
  }

  async reactivateCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('업체를 찾을 수 없습니다.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedCompany = await tx.company.update({
        where: { id: companyId },
        data: {
          verificationStatus: 'APPROVED',
          rejectionReason: null,
          isActive: true,
        },
      });

      await tx.user.update({
        where: { id: company.userId },
        data: { isActive: true },
      });

      return updatedCompany;
    });
  }

  // ─── 채팅 모니터링 ─────────────────────────────────────

  async getChatRooms(page: number, limit: number, filters: any) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive === 'true';
    }
    if (filters?.refundStatus) {
      where.refundStatus = filters.refundStatus;
    }
    if (filters?.search) {
      where.OR = [
        { user: { name: { contains: filters.search } } },
        { company: { businessName: { contains: filters.search } } },
      ];
    }

    const [chatRooms, total] = await Promise.all([
      this.prisma.chatRoom.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
          company: {
            select: { id: true, businessName: true },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { content: true, createdAt: true },
          },
          _count: { select: { messages: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.chatRoom.count({ where }),
    ]);

    return {
      data: chatRooms,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getChatRoomDetail(roomId: string) {
    const chatRoom = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        company: {
          select: { id: true, businessName: true, businessNumber: true },
        },
        matching: {
          select: {
            id: true,
            status: true,
            cleaningType: true,
            estimatedPrice: true,
          },
        },
        estimate: {
          select: {
            id: true,
            price: true,
            status: true,
          },
        },
        _count: { select: { messages: true } },
      },
    });

    if (!chatRoom) {
      throw new NotFoundException('채팅방을 찾을 수 없습니다.');
    }

    return chatRoom;
  }

  async getChatRoomMessages(roomId: string, page: number, limit: number) {
    const chatRoom = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
    });

    if (!chatRoom) {
      throw new NotFoundException('채팅방을 찾을 수 없습니다.');
    }

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { roomId },
        skip,
        take: limit,
        include: {
          sender: {
            select: { id: true, name: true, role: true, profileImage: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.chatMessage.count({ where: { roomId } }),
    ]);

    return {
      data: messages,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── 신고 관리 ──────────────────────────────────────────

  async getReports(page: number, limit: number, filters?: any) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.targetType) {
      where.targetType = filters.targetType;
    }

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip,
        take: limit,
        include: {
          reporter: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.report.count({ where }),
    ]);

    // Resolve target entities
    const reportsWithTargets = await Promise.all(
      reports.map(async (report) => {
        let target: any = null;
        if (report.targetType === 'USER') {
          target = await this.prisma.user.findUnique({
            where: { id: report.targetId },
            select: { id: true, name: true, email: true },
          });
        } else if (report.targetType === 'COMPANY') {
          target = await this.prisma.company.findUnique({
            where: { id: report.targetId },
            select: { id: true, businessName: true },
          });
        } else if (report.targetType === 'REVIEW') {
          target = await this.prisma.review.findUnique({
            where: { id: report.targetId },
            select: { id: true, content: true, rating: true },
          });
        }
        return { ...report, target };
      }),
    );

    return {
      data: reportsWithTargets,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getReportDetail(reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reporter: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            role: true,
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException('신고를 찾을 수 없습니다.');
    }

    // Resolve target entity
    let target: any = null;
    if (report.targetType === 'USER') {
      target = await this.prisma.user.findUnique({
        where: { id: report.targetId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
        },
      });
    } else if (report.targetType === 'COMPANY') {
      target = await this.prisma.company.findUnique({
        where: { id: report.targetId },
        select: {
          id: true,
          businessName: true,
          businessNumber: true,
          verificationStatus: true,
          isActive: true,
        },
      });
    } else if (report.targetType === 'REVIEW') {
      target = await this.prisma.review.findUnique({
        where: { id: report.targetId },
        select: {
          id: true,
          content: true,
          rating: true,
          isVisible: true,
          user: { select: { id: true, name: true } },
          company: { select: { id: true, businessName: true } },
        },
      });
    }

    // Get other reports for the same target
    const relatedReports = await this.prisma.report.findMany({
      where: {
        targetType: report.targetType,
        targetId: report.targetId,
        id: { not: reportId },
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { id: true, name: true } },
      },
    });

    return {
      ...report,
      target,
      relatedReports,
    };
  }

  async resolveReport(reportId: string, dto: ResolveReportDto) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('신고를 찾을 수 없습니다.');
    }

    const updatedReport = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: dto.status,
        adminNote: dto.adminNote,
        resolvedAt: new Date(),
      },
    });

    // Execute action if specified
    if (dto.actionType) {
      switch (dto.actionType) {
        case ReportActionType.SUSPEND_USER:
          if (report.targetType === 'USER') {
            await this.prisma.user.update({
              where: { id: report.targetId },
              data: { isActive: false },
            });
          }
          break;
        case ReportActionType.SUSPEND_COMPANY:
          if (report.targetType === 'COMPANY') {
            const company = await this.prisma.company.findUnique({
              where: { id: report.targetId },
            });
            if (company) {
              await this.prisma.$transaction(async (tx) => {
                await tx.company.update({
                  where: { id: report.targetId },
                  data: {
                    verificationStatus: 'SUSPENDED',
                    rejectionReason: dto.adminNote,
                    isActive: false,
                  },
                });
                await tx.user.update({
                  where: { id: company.userId },
                  data: { isActive: false },
                });
              });
            }
          }
          break;
        case ReportActionType.HIDE_REVIEW:
          if (report.targetType === 'REVIEW') {
            await this.prisma.review.update({
              where: { id: report.targetId },
              data: { isVisible: false },
            });
          }
          break;
      }
    }

    return updatedReport;
  }

  // ─── 리뷰 관리 ──────────────────────────────────────────

  async getReviews(page: number, limit: number, filters?: any) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters?.isVisible !== undefined) {
      where.isVisible = filters.isVisible === 'true';
    }
    if (filters?.minRating) {
      where.rating = { ...where.rating, gte: parseInt(filters.minRating) };
    }
    if (filters?.maxRating) {
      where.rating = { ...where.rating, lte: parseInt(filters.maxRating) };
    }

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
          company: { select: { id: true, businessName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      data: reviews,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async toggleReviewVisibility(reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('리뷰를 찾을 수 없습니다.');
    }

    return this.prisma.review.update({
      where: { id: reviewId },
      data: { isVisible: !review.isVisible },
    });
  }

  // ─── 견적요청 모니터링 ──────────────────────────────────

  async getEstimateRequests(page: number, limit: number, filters?: any) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.cleaningType) {
      where.cleaningType = filters.cleaningType;
    }

    const [estimateRequests, total] = await Promise.all([
      this.prisma.estimateRequest.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
          _count: { select: { estimates: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.estimateRequest.count({ where }),
    ]);

    return {
      data: estimateRequests,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── 매칭 모니터링 ─────────────────────────────────────

  async getMatchings(page: number, limit: number, filters?: any) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters?.status) {
      where.status = filters.status;
    }

    const [matchings, total] = await Promise.all([
      this.prisma.matching.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
          company: { select: { id: true, businessName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.matching.count({ where }),
    ]);

    return {
      data: matchings,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── 구독 관리 ───────────────────────────────────────────

  async getSubscriptions(page: number, limit: number, filters: any) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.tier) {
      where.plan = { tier: filters.tier };
    }
    if (filters?.search) {
      where.company = {
        OR: [
          { businessName: { contains: filters.search } },
          { user: { name: { contains: filters.search } } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.companySubscription.findMany({
        where,
        skip,
        take: limit,
        include: {
          plan: true,
          company: {
            select: {
              id: true,
              businessName: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.companySubscription.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getSubscriptionStats() {
    const [
      totalActive,
      totalExpired,
      totalPaused,
      totalQueued,
      basicCount,
      proCount,
      premiumCount,
      trialCount,
      expiringIn7Days,
    ] = await Promise.all([
      this.prisma.companySubscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.companySubscription.count({ where: { status: 'EXPIRED' } }),
      this.prisma.companySubscription.count({ where: { status: 'PAUSED' } }),
      this.prisma.companySubscription.count({ where: { status: 'QUEUED' } }),
      this.prisma.companySubscription.count({
        where: { status: 'ACTIVE', plan: { tier: 'BASIC' } },
      }),
      this.prisma.companySubscription.count({
        where: { status: 'ACTIVE', plan: { tier: 'PRO' } },
      }),
      this.prisma.companySubscription.count({
        where: { status: 'ACTIVE', plan: { tier: 'PREMIUM' } },
      }),
      this.prisma.companySubscription.count({
        where: { status: 'ACTIVE', isTrial: true },
      }),
      this.prisma.companySubscription.count({
        where: {
          status: 'ACTIVE',
          currentPeriodEnd: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return {
      total: totalActive + totalExpired + totalPaused + totalQueued,
      active: totalActive,
      expired: totalExpired,
      paused: totalPaused,
      queued: totalQueued,
      trial: trialCount,
      byTier: { BASIC: basicCount, PRO: proCount, PREMIUM: premiumCount },
      expiringIn7Days,
    };
  }

  async changeCompanySubscription(
    companyId: string,
    planId: string,
    isTrial?: boolean,
  ) {
    return this.subscriptionService.createSubscription(companyId, planId);
  }

  async extendCompanySubscription(companyId: string, months: number) {
    const active = await this.prisma.companySubscription.findFirst({
      where: { companyId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    if (!active) {
      throw new NotFoundException('활성 구독이 없습니다.');
    }
    return this.subscriptionService.extendSubscription(active.id, months);
  }

  async grantFreeTrial(companyId: string) {
    return this.subscriptionService.createFreeTrial(companyId);
  }

  async getSubscriptionPlans() {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
    });
  }

  async updateSubscriptionPlan(
    planId: string,
    data: { price?: number; dailyEstimateLimit?: number; isActive?: boolean },
  ) {
    return this.prisma.subscriptionPlan.update({
      where: { id: planId },
      data,
    });
  }

  // ─── 설정 ──────────────────────────────────────────────

  async getSettings() {
    return this.settings.getAll();
  }

  async updateSettings(data: Record<string, any>) {
    for (const [key, value] of Object.entries(data)) {
      await this.settings.set(key, value);
    }
    return this.settings.getAll();
  }
}
