import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { LoginDto } from './dto/login.dto';
import { KakaoLoginDto } from './dto/kakao-login.dto';
import { NaverLoginDto } from './dto/naver-login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('인증')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setAuthCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ): void {
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 15 * 60 * 1000, // 15분
      path: '/',
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
      path: '/',
    });

    // tokenExp: JS에서 만료 시간 파악용 (토큰 값 아님)
    try {
      const payload = JSON.parse(
        Buffer.from(tokens.accessToken.split('.')[1], 'base64').toString(),
      );
      res.cookie('tokenExp', String(payload.exp), {
        httpOnly: false,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        maxAge: 15 * 60 * 1000,
        path: '/',
      });
    } catch {}
  }

  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: '일반 회원가입' })
  @ApiResponse({ status: 201, description: '회원가입 성공' })
  @ApiResponse({ status: 409, description: '이미 등록된 이메일' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('register/company')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: '업체 회원가입' })
  @ApiResponse({ status: 201, description: '업체 가입 성공 (승인 대기)' })
  @ApiResponse({
    status: 409,
    description: '이미 등록된 이메일 또는 사업자등록번호',
  })
  async registerCompany(@Body() registerCompanyDto: RegisterCompanyDto) {
    return this.authService.registerCompany(registerCompanyDto);
  }

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '로그인' })
  @ApiResponse({ status: 200, description: '로그인 성공' })
  @ApiResponse({ status: 401, description: '인증 실패' })
  @ApiResponse({ status: 403, description: '비활성화된 계정' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto);
    this.setAuthCookies(res, result.tokens);
    return { user: result.user };
  }

  @Post('kakao')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '카카오 소셜 로그인' })
  @ApiResponse({ status: 200, description: '카카오 로그인 성공' })
  @ApiResponse({ status: 401, description: '카카오 인증 실패' })
  @ApiResponse({ status: 409, description: '이미 일반 계정으로 가입된 이메일' })
  async kakaoLogin(@Body() kakaoLoginDto: KakaoLoginDto) {
    return this.authService.kakaoLogin(kakaoLoginDto);
  }

  @Post('naver')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '네이버 소셜 로그인' })
  @ApiResponse({ status: 200, description: '네이버 로그인 성공' })
  @ApiResponse({ status: 401, description: '네이버 인증 실패' })
  @ApiResponse({ status: 409, description: '이미 다른 방법으로 가입된 이메일' })
  async naverLogin(@Body() naverLoginDto: NaverLoginDto) {
    return this.authService.naverLogin(naverLoginDto);
  }

  @Post('google')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '구글 소셜 로그인' })
  @ApiResponse({ status: 200, description: '구글 로그인 성공' })
  @ApiResponse({ status: 401, description: '구글 인증 실패' })
  @ApiResponse({ status: 409, description: '이미 다른 방법으로 가입된 이메일' })
  async googleLogin(@Body() googleLoginDto: GoogleLoginDto) {
    return this.authService.googleLogin(googleLoginDto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '로그아웃' })
  @ApiResponse({ status: 200, description: '로그아웃 성공' })
  async logout(
    @CurrentUser('id') userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = (req as any).cookies?.['refreshToken'];
    await this.authService.logout(userId, refreshToken);
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
    res.clearCookie('tokenExp', { path: '/' });
    return { message: '로그아웃되었습니다.' };
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '토큰 갱신' })
  @ApiResponse({ status: 200, description: '토큰 갱신 성공' })
  @ApiResponse({ status: 401, description: '유효하지 않은 리프레시 토큰' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // 쿠키 우선, body 폴백 (과도기 호환)
    const refreshToken =
      (req as any).cookies?.['refreshToken'] ||
      (req as any).body?.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('리프레시 토큰이 없습니다.');
    }
    const tokens = await this.authService.refreshToken(refreshToken);
    this.setAuthCookies(res, tokens);
    return { message: '토큰이 갱신되었습니다.' };
  }

  @Post('forgot-password')
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '비밀번호 찾기 (재설정 이메일 발송)' })
  @ApiResponse({
    status: 200,
    description: '이메일 발송 완료 (항상 동일 응답)',
  })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '비밀번호 재설정' })
  @ApiResponse({ status: 200, description: '비밀번호 변경 성공' })
  @ApiResponse({ status: 400, description: '유효하지 않거나 만료된 토큰' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Get('verify-email')
  @ApiOperation({ summary: '이메일 인증' })
  @ApiResponse({ status: 200, description: '이메일 인증 성공' })
  @ApiResponse({ status: 400, description: '유효하지 않거나 만료된 토큰' })
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('resend-verification')
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '인증 이메일 재발송' })
  @ApiResponse({ status: 200, description: '이메일 재발송 완료' })
  async resendVerification(@CurrentUser('id') userId: string) {
    return this.authService.resendVerificationEmail(userId);
  }

  @Get('oauth/:provider')
  @ApiOperation({ summary: 'OAuth 소셜 로그인 시작 (리다이렉트)' })
  @ApiResponse({ status: 302, description: 'OAuth 제공자 로그인 페이지로 리다이렉트' })
  async oauthRedirect(
    @Param('provider') provider: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const callbackUrl = `${req.protocol}://${req.get('host')}/api/auth/oauth/${provider}/callback`;
    const url = await this.authService.getOAuthUrl(provider, callbackUrl);
    return res.redirect(url);
  }

  @Get('oauth/:provider/callback')
  @ApiOperation({ summary: 'OAuth 콜백 처리' })
  @ApiResponse({ status: 302, description: '프론트엔드로 리다이렉트 (토큰 포함)' })
  async oauthCallback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const frontendUrl = this.authService.getFrontendUrl();

    if (error || !code) {
      return res.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent('소셜 로그인이 취소되었습니다.')}`,
      );
    }

    try {
      const callbackUrl = `${req.protocol}://${req.get('host')}/api/auth/oauth/${provider}/callback`;
      const result = await this.authService.handleOAuthCallback(
        provider,
        code,
        callbackUrl,
        state,
      );
      const tempCode = await this.authService.createOAuthTempCode(
        result.tokens,
        result.isNewUser ?? false,
      );
      return res.redirect(`${frontendUrl}/auth/callback?code=${tempCode}`);
    } catch (err: unknown) {
      // 사용자 친화적 메시지만 전달 (내부 에러 메시지 노출 방지)
      let userMessage = '소셜 로그인에 실패했습니다.';
      const httpErr = err as { status?: number; message?: string };
      if (httpErr?.status === 409) {
        userMessage = httpErr.message || '이미 가입된 계정이 있습니다.';
      }
      return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(userMessage)}`);
    }
  }

  @Post('oauth/exchange')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'OAuth 임시 코드를 토큰으로 교환' })
  async exchangeOAuthCode(
    @Body('code') code: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.authService.exchangeOAuthCode(code);
    this.setAuthCookies(res, data.tokens);
    return { isNewUser: data.isNewUser };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 정보 조회' })
  @ApiResponse({ status: 200, description: '조회 성공' })
  async getProfile(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }
}
