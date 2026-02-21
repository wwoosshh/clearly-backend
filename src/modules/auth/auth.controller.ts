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
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
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
  async logout(@CurrentUser('id') userId: string) {
    return this.authService.logout(userId);
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '토큰 갱신' })
  @ApiResponse({ status: 200, description: '토큰 갱신 성공' })
  @ApiResponse({ status: 401, description: '유효하지 않은 리프레시 토큰' })
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
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
      const params = new URLSearchParams({
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      });
      if (result.isNewUser) {
        params.set('isNewUser', 'true');
      }
      return res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
    } catch (err: any) {
      // 사용자 친화적 메시지만 전달 (내부 에러 메시지 노출 방지)
      let userMessage = '소셜 로그인에 실패했습니다.';
      if (err?.status === 409) {
        userMessage = err.message || '이미 가입된 계정이 있습니다.';
      }
      return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(userMessage)}`);
    }
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
