import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../common/cache/redis.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  name?: string;
  companyId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }

    // Redis 캐시로 DB 부하 최소화 (TTL: 60초)
    const cacheKey = `jwt:user:${payload.sub}`;
    const cached = await this.redis.get<{ id: string; role: string; isActive: boolean }>(cacheKey);

    if (cached) {
      if (!cached.isActive) {
        throw new UnauthorizedException('비활성화된 계정입니다.');
      }
      return { id: cached.id, email: payload.email, role: cached.role };
    }

    // 캐시 미스 시 DB 조회
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('유효하지 않은 사용자입니다.');
    }

    // 60초 캐싱
    await this.redis.set(cacheKey, { id: user.id, role: user.role, isActive: user.isActive }, 60);

    return { id: user.id, email: payload.email, role: user.role };
  }
}
