import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats() {
    const [totalUsers, totalCompanies, pendingCompanies, totalMatchings] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.company.count(),
        this.prisma.company.count({
          where: { verificationStatus: 'PENDING' },
        }),
        this.prisma.matching.count(),
      ]);

    return {
      totalUsers,
      totalCompanies,
      pendingCompanies,
      totalMatchings,
    };
  }

  async getUsers(page: number, limit: number, filters: any) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters?.role) {
      where.role = filters.role;
    }
    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive === 'true';
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

  async approveCompany(companyId: string) {
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
          approvedAt: new Date(),
        },
      });

      await tx.user.update({
        where: { id: company.userId },
        data: { isActive: true },
      });

      return updatedCompany;
    });
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

  async getReports(page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
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
      this.prisma.report.count(),
    ]);

    return {
      data: reports,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getSettings() {
    // TODO: 시스템 설정 테이블 추가 후 구현
    return {
      message: '시스템 설정 기능은 추후 구현 예정입니다.',
    };
  }

  async updateSettings(data: any) {
    // TODO: 시스템 설정 테이블 추가 후 구현
    return {
      message: '시스템 설정 기능은 추후 구현 예정입니다.',
    };
  }
}
