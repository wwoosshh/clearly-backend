import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { LoginDto } from './dto/login.dto';
import { KakaoLoginDto } from './dto/kakao-login.dto';
import { NaverLoginDto } from './dto/naver-login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RedisService } from '../../common/cache/redis.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly geocodingService: GeocodingService,
    private readonly mailService: MailService,
    private readonly redis: RedisService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, name, phone } = registerDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('이미 등록된 이메일 주소입니다.');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        name,
        phone,
        role: 'USER',
        isActive: true,
      },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role, {
      name: user.name,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tokens,
    };
  }

  async registerCompany(registerCompanyDto: RegisterCompanyDto) {
    const {
      email,
      password,
      name,
      phone,
      businessName,
      businessNumber,
      representative,
      address,
      detailAddress,
      specialties,
      serviceAreas,
      description,
      minPrice,
      maxPrice,
    } = registerCompanyDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('이미 등록된 이메일 주소입니다.');
    }

    const existingCompany = await this.prisma.company.findFirst({
      where: { businessNumber },
    });

    if (existingCompany) {
      throw new ConflictException('이미 등록된 사업자등록번호입니다.');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // 주소 → 좌표 변환 (실패해도 가입은 진행)
    let latitude: number | undefined;
    let longitude: number | undefined;

    if (address) {
      const coords = await this.geocodingService.geocodeAddress(address);
      if (coords) {
        latitude = coords.latitude;
        longitude = coords.longitude;
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash: hashedPassword,
          name,
          phone,
          role: 'COMPANY',
          isActive: false,
        },
      });

      const company = await tx.company.create({
        data: {
          userId: user.id,
          businessName,
          businessNumber,
          representative,
          address,
          detailAddress,
          latitude,
          longitude,
          specialties: specialties || [],
          serviceAreas: serviceAreas || [],
          description,
          minPrice,
          maxPrice,
          verificationStatus: 'PENDING',
        },
      });

      return { user, company };
    });

    return {
      message: '업체 가입이 완료되었습니다. 관리자 승인 후 이용 가능합니다.',
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
      },
      company: {
        id: result.company.id,
        businessName: result.company.businessName,
        verificationStatus: result.company.verificationStatus,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const user = await this.validateUser(email, password);

    if (!user.isActive) {
      if (user.deactivatedAt) {
        this.logger.warn(
          `로그인 시도 - 탈퇴 처리 중 계정: userId=${user.id}, email=${email}`,
        );
        throw new ForbiddenException(
          '탈퇴 처리 중인 계정입니다. 복구를 원하시면 고객센터에 문의하세요.',
        );
      }
      this.logger.warn(
        `로그인 시도 - 비활성 계정: userId=${user.id}, email=${email}`,
      );
      throw new ForbiddenException(
        '비활성화된 계정입니다. 업체 계정인 경우 관리자 승인을 기다려주세요.',
      );
    }

    // 기존 만료된 토큰 정리
    await this.prisma.refreshToken.deleteMany({
      where: {
        userId: user.id,
        expiresAt: { lt: new Date() },
      },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role, {
      name: user.name,
      companyId: (user as any).company?.id,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tokens,
    };
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });

    return { message: '로그아웃 되었습니다.' };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
      });

      // DB에서 토큰 + 유저를 단일 쿼리로 조회
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: {
          user: {
            include: { company: { select: { id: true } } },
          },
        },
      });

      if (!storedToken || storedToken.expiresAt < new Date()) {
        throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다.');
      }

      const user = storedToken.user;

      if (!user || !user.isActive) {
        throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
      }

      // 토큰 로테이션: 이전 토큰 삭제 → 새 토큰 생성
      await this.prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });

      return this.generateTokens(user.id, user.email, user.role, {
        name: user.name,
        companyId: user.company?.id,
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다.');
    }
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { company: { select: { id: true } } },
    });

    if (!user || !user.passwordHash) {
      this.logger.warn(`로그인 실패 - 존재하지 않는 이메일: ${email}`);
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      this.logger.warn(
        `로그인 실패 - 비밀번호 불일치: userId=${user.id}, email=${email}`,
      );
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    return user;
  }

  async getProfile(userId: string) {
    // Redis 캐시 확인 (TTL 5분)
    const cacheKey = `user:profile:${userId}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        profileImage: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    await this.redis.set(cacheKey, user, 300); // 5분 캐시
    return user;
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const { email } = dto;

    // 보안: 이메일 존재 여부와 무관하게 동일 응답 (열거 공격 방지)
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (user && user.oauthProvider === 'LOCAL') {
      const token = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1시간

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: hashedToken,
          passwordResetExpiry: expiry,
        },
      });

      try {
        await this.mailService.sendPasswordResetEmail(email, token);
      } catch (error) {
        this.logger.error('비밀번호 재설정 이메일 발송 실패', error);
      }
    }

    return {
      message:
        '해당 이메일로 비밀번호 재설정 링크를 발송했습니다. 이메일을 확인해주세요.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const { token, password } = dto;

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException(
        '유효하지 않거나 만료된 토큰입니다. 비밀번호 재설정을 다시 요청해주세요.',
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashedPassword,
          passwordResetToken: null,
          passwordResetExpiry: null,
        },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { userId: user.id },
      }),
    ]);

    return { message: '비밀번호가 성공적으로 변경되었습니다.' };
  }

  async kakaoLogin(dto: KakaoLoginDto) {
    const { code, redirectUri } = dto;

    // 1. 인가코드로 카카오 액세스 토큰 발급
    const kakaoTokenUrl = 'https://kauth.kakao.com/oauth/token';
    const kakaoRestApiKey = this.configService.get('KAKAO_REST_API_KEY');

    let kakaoAccessToken: string;
    try {
      const tokenResponse = await firstValueFrom(
        this.httpService.post(
          kakaoTokenUrl,
          new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: kakaoRestApiKey,
            redirect_uri: redirectUri,
            code,
          }).toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        ),
      );
      kakaoAccessToken = tokenResponse.data.access_token;
    } catch {
      throw new UnauthorizedException('카카오 인증에 실패했습니다.');
    }

    // 2. 카카오 사용자 정보 조회
    let kakaoUser: { id: string; email?: string; nickname?: string };
    try {
      const userResponse = await firstValueFrom(
        this.httpService.get('https://kapi.kakao.com/v2/user/me', {
          headers: { Authorization: `Bearer ${kakaoAccessToken}` },
        }),
      );
      const data = userResponse.data;
      kakaoUser = {
        id: String(data.id),
        email: data.kakao_account?.email,
        nickname: data.kakao_account?.profile?.nickname,
      };
    } catch {
      throw new UnauthorizedException('카카오 사용자 정보 조회에 실패했습니다.');
    }

    if (!kakaoUser.email) {
      throw new BadRequestException(
        '카카오 계정에 이메일이 없습니다. 이메일 제공에 동의해주세요.',
      );
    }

    return this.handleOAuthLogin('KAKAO', kakaoUser.id, kakaoUser.email, kakaoUser.nickname);
  }

  async naverLogin(dto: NaverLoginDto) {
    const { code, state } = dto;

    // 1. 인가코드로 네이버 액세스 토큰 발급
    const naverClientId = this.configService.get('NAVER_CLIENT_ID');
    const naverClientSecret = this.configService.get('NAVER_CLIENT_SECRET');

    let naverAccessToken: string;
    try {
      const tokenResponse = await firstValueFrom(
        this.httpService.post(
          'https://nid.naver.com/oauth2.0/token',
          new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: naverClientId,
            client_secret: naverClientSecret,
            code,
            state,
          }).toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        ),
      );
      naverAccessToken = tokenResponse.data.access_token;
    } catch {
      throw new UnauthorizedException('네이버 인증에 실패했습니다.');
    }

    // 2. 네이버 사용자 정보 조회
    let naverUser: { id: string; email?: string; name?: string };
    try {
      const userResponse = await firstValueFrom(
        this.httpService.get('https://openapi.naver.com/v1/nid/me', {
          headers: { Authorization: `Bearer ${naverAccessToken}` },
        }),
      );
      const profile = userResponse.data.response;
      naverUser = {
        id: profile.id,
        email: profile.email,
        name: profile.name || profile.nickname,
      };
    } catch {
      throw new UnauthorizedException(
        '네이버 사용자 정보 조회에 실패했습니다.',
      );
    }

    if (!naverUser.email) {
      throw new BadRequestException(
        '네이버 계정에 이메일이 없습니다. 이메일 제공에 동의해주세요.',
      );
    }

    return this.handleOAuthLogin('NAVER', naverUser.id, naverUser.email, naverUser.name);
  }

  async googleLogin(dto: GoogleLoginDto) {
    const { code, redirectUri } = dto;

    // 1. 인가코드로 구글 액세스 토큰 발급
    const googleClientId = this.configService.get('GOOGLE_CLIENT_ID');
    const googleClientSecret = this.configService.get('GOOGLE_CLIENT_SECRET');

    let googleAccessToken: string;
    try {
      const tokenResponse = await firstValueFrom(
        this.httpService.post(
          'https://oauth2.googleapis.com/token',
          new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: googleClientId,
            client_secret: googleClientSecret,
            redirect_uri: redirectUri,
            code,
          }).toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        ),
      );
      googleAccessToken = tokenResponse.data.access_token;
    } catch {
      throw new UnauthorizedException('구글 인증에 실패했습니다.');
    }

    // 2. 구글 사용자 정보 조회
    let googleUser: { id: string; email?: string; name?: string };
    try {
      const userResponse = await firstValueFrom(
        this.httpService.get(
          'https://www.googleapis.com/oauth2/v2/userinfo',
          {
            headers: { Authorization: `Bearer ${googleAccessToken}` },
          },
        ),
      );
      const data = userResponse.data;
      googleUser = {
        id: data.id,
        email: data.email,
        name: data.name,
      };
    } catch {
      throw new UnauthorizedException(
        '구글 사용자 정보 조회에 실패했습니다.',
      );
    }

    if (!googleUser.email) {
      throw new BadRequestException(
        '구글 계정에 이메일이 없습니다. 이메일 제공에 동의해주세요.',
      );
    }

    return this.handleOAuthLogin('GOOGLE', googleUser.id, googleUser.email, googleUser.name);
  }

  /** 공통 OAuth 로그인/가입 처리 */
  private async handleOAuthLogin(
    provider: 'KAKAO' | 'NAVER' | 'GOOGLE',
    oauthId: string,
    email: string,
    name?: string,
  ) {
    // 기존 OAuth 사용자 확인
    let user = await this.prisma.user.findFirst({
      where: { oauthProvider: provider, oauthId },
    });

    if (!user) {
      // 동일 이메일로 다른 계정이 있는지 확인
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        const providerNames = { KAKAO: '카카오', NAVER: '네이버', GOOGLE: '구글', LOCAL: '이메일' };
        const existingProvider = providerNames[existingUser.oauthProvider as keyof typeof providerNames] || existingUser.oauthProvider;
        throw new ConflictException(
          `이미 ${existingProvider} 계정으로 가입된 이메일입니다.`,
        );
      }

      // 신규 사용자 생성
      const providerLabels = { KAKAO: '카카오', NAVER: '네이버', GOOGLE: '구글' };
      user = await this.prisma.user.create({
        data: {
          email,
          name: name || `${providerLabels[provider]} 사용자`,
          oauthProvider: provider,
          oauthId,
          role: 'USER',
          isActive: true,
        },
      });

      this.logger.log(
        `${provider} 신규 가입: userId=${user.id}, email=${email}`,
      );
    }

    if (!user.isActive) {
      throw new ForbiddenException('비활성화된 계정입니다.');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role, {
      name: user.name,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tokens,
      isNewUser: !user.phone,
    };
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    extra?: { name?: string; companyId?: string | null },
  ) {
    const payload: Record<string, unknown> = { sub: userId, email, role };
    if (extra?.name) payload.name = extra.name;
    if (extra?.companyId) payload.companyId = extra.companyId;

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: 900, // 15 minutes
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: 604800, // 7 days
      }),
    ]);

    // RefreshToken을 DB에 저장
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  /** OAuth 인가 URL 생성 */
  getOAuthUrl(provider: string, callbackUrl: string): string {
    switch (provider) {
      case 'kakao': {
        const clientId = this.configService.get('KAKAO_REST_API_KEY');
        return `https://kauth.kakao.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code`;
      }
      case 'naver': {
        const clientId = this.configService.get('NAVER_CLIENT_ID');
        const state = crypto.randomBytes(16).toString('hex');
        return `https://nid.naver.com/oauth2.0/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&state=${state}`;
      }
      case 'google': {
        const clientId = this.configService.get('GOOGLE_CLIENT_ID');
        return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=email%20profile`;
      }
      default:
        throw new BadRequestException(
          `지원하지 않는 소셜 로그인입니다: ${provider}`,
        );
    }
  }

  /** OAuth 콜백 처리 (인가코드 → 토큰 교환 → 로그인/가입) */
  async handleOAuthCallback(
    provider: string,
    code: string,
    callbackUrl: string,
    state?: string,
  ) {
    switch (provider) {
      case 'kakao':
        return this.kakaoLogin({ code, redirectUri: callbackUrl });
      case 'naver':
        return this.naverLogin({ code, state: state || '' });
      case 'google':
        return this.googleLogin({ code, redirectUri: callbackUrl });
      default:
        throw new BadRequestException(
          `지원하지 않는 소셜 로그인입니다: ${provider}`,
        );
    }
  }

  /** 프론트엔드 URL */
  getFrontendUrl(): string {
    return this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
  }
}
