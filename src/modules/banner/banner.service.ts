import { Injectable, NotFoundException } from '@nestjs/common';
import { Banner } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/cache/redis.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';

@Injectable()
export class BannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ─── 공개 ─────────────────────────────────────────────

  async getPublicBanners() {
    const cacheKey = 'banner:public';
    const cached = await this.redis.get<Banner[]>(cacheKey);
    if (cached) return cached;

    const banners = await this.prisma.banner.findMany({
      where: { isVisible: true },
      orderBy: { sortOrder: 'asc' },
    });

    await this.redis.set(cacheKey, banners, 3600); // 1시간 캐시
    return banners;
  }

  // ─── 관리자 ───────────────────────────────────────────

  async getAdminBanners(page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [banners, total] = await Promise.all([
      this.prisma.banner.findMany({
        skip,
        take: limit,
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.banner.count(),
    ]);

    return {
      data: banners,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async invalidateBannerCache() {
    await this.redis.delPattern('banner:public*');
  }

  async createBanner(dto: CreateBannerDto) {
    const banner = await this.prisma.banner.create({
      data: {
        title: dto.title,
        subtitle: dto.subtitle,
        imageUrl: dto.imageUrl,
        bgColor: dto.bgColor ?? '#2d6a4f',
        linkUrl: dto.linkUrl,
        linkText: dto.linkText,
        sortOrder: dto.sortOrder ?? 0,
        isVisible: dto.isVisible ?? true,
      },
    });
    await this.invalidateBannerCache();
    return banner;
  }

  async updateBanner(id: string, dto: UpdateBannerDto) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner) {
      throw new NotFoundException('배너를 찾을 수 없습니다.');
    }

    const updated = await this.prisma.banner.update({
      where: { id },
      data: dto,
    });
    await this.invalidateBannerCache();
    return updated;
  }

  async deleteBanner(id: string) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner) {
      throw new NotFoundException('배너를 찾을 수 없습니다.');
    }

    const deleted = await this.prisma.banner.delete({ where: { id } });
    await this.invalidateBannerCache();
    return deleted;
  }

  async reorderBanners(items: { id: string; sortOrder: number }[]) {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.banner.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
    await this.invalidateBannerCache();
    return { message: '정렬 순서가 변경되었습니다.' };
  }
}
