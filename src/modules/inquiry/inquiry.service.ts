import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { AnswerInquiryDto } from './dto/answer-inquiry.dto';

@Injectable()
export class InquiryService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── 공개 ─────────────────────────────────────────────

  async createInquiry(dto: CreateInquiryDto) {
    return this.prisma.inquiry.create({
      data: {
        userId: dto.userId || null,
        name: dto.name,
        email: dto.email,
        category: dto.category,
        title: dto.title,
        content: dto.content,
      },
    });
  }

  // ─── 유저 ─────────────────────────────────────────────

  async getMyInquiries(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [inquiries, total] = await Promise.all([
      this.prisma.inquiry.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          category: true,
          title: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.inquiry.count({ where: { userId } }),
    ]);

    return {
      data: inquiries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMyInquiryDetail(userId: string, inquiryId: string) {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id: inquiryId },
    });

    if (!inquiry) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }

    if (inquiry.userId !== userId) {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }

    return inquiry;
  }

  // ─── 관리자 ───────────────────────────────────────────

  async getAdminInquiries(page: number, limit: number, status?: string) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [inquiries, total] = await Promise.all([
      this.prisma.inquiry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.inquiry.count({ where }),
    ]);

    return {
      data: inquiries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAdminInquiryDetail(inquiryId: string) {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id: inquiryId },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
    });

    if (!inquiry) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }

    return inquiry;
  }

  async answerInquiry(inquiryId: string, dto: AnswerInquiryDto) {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id: inquiryId },
    });

    if (!inquiry) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }

    return this.prisma.inquiry.update({
      where: { id: inquiryId },
      data: {
        adminAnswer: dto.adminAnswer,
        status: 'ANSWERED',
        answeredAt: new Date(),
      },
    });
  }

  async closeInquiry(inquiryId: string) {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id: inquiryId },
    });

    if (!inquiry) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }

    return this.prisma.inquiry.update({
      where: { id: inquiryId },
      data: { status: 'CLOSED' },
    });
  }
}
