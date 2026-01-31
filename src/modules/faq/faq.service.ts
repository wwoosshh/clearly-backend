import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';

@Injectable()
export class FaqService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── 공개 ─────────────────────────────────────────────

  async getPublicFaqs(search?: string) {
    const where: any = { isVisible: true };

    if (search) {
      where.OR = [
        { question: { contains: search, mode: 'insensitive' } },
        { answer: { contains: search, mode: 'insensitive' } },
      ];
    }

    const faqs = await this.prisma.faq.findMany({
      where,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });

    // 카테고리별 그룹핑
    const grouped: Record<string, typeof faqs> = {};
    for (const faq of faqs) {
      if (!grouped[faq.category]) {
        grouped[faq.category] = [];
      }
      grouped[faq.category].push(faq);
    }

    return grouped;
  }

  // ─── 관리자 ───────────────────────────────────────────

  async getAdminFaqs(page: number, limit: number, category?: string) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (category) {
      where.category = category;
    }

    const [faqs, total] = await Promise.all([
      this.prisma.faq.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      }),
      this.prisma.faq.count({ where }),
    ]);

    return {
      data: faqs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createFaq(dto: CreateFaqDto) {
    return this.prisma.faq.create({
      data: {
        category: dto.category,
        question: dto.question,
        answer: dto.answer,
        sortOrder: dto.sortOrder ?? 0,
        isVisible: dto.isVisible ?? true,
      },
    });
  }

  async updateFaq(id: string, dto: UpdateFaqDto) {
    const faq = await this.prisma.faq.findUnique({ where: { id } });
    if (!faq) {
      throw new NotFoundException('FAQ를 찾을 수 없습니다.');
    }

    return this.prisma.faq.update({
      where: { id },
      data: dto,
    });
  }

  async deleteFaq(id: string) {
    const faq = await this.prisma.faq.findUnique({ where: { id } });
    if (!faq) {
      throw new NotFoundException('FAQ를 찾을 수 없습니다.');
    }

    return this.prisma.faq.delete({ where: { id } });
  }

  async reorderFaqs(items: { id: string; sortOrder: number }[]) {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.faq.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
    return { message: '정렬 순서가 변경되었습니다.' };
  }
}
