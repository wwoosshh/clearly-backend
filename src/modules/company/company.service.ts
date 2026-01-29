import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(private readonly prisma: PrismaService) {}

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
}
