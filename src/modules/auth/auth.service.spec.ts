import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { HttpService } from '@nestjs/axios';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { MailService } from '../mail/mail.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: any;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'test@test.com',
    name: '테스트유저',
    phone: '01012345678',
    passwordHash: '$2b$12$hashed',
    role: 'USER',
    isActive: true,
    deactivatedAt: null,
    oauthProvider: 'LOCAL',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            company: {
              findFirst: jest.fn(),
            },
            refreshToken: {
              findUnique: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('mock-token'),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-secret'),
          },
        },
        {
          provide: GeocodingService,
          useValue: {
            geocodeAddress: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
            get: jest.fn(),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService);
    jwtService = module.get(JwtService);
  });

  describe('register', () => {
    it('신규 유저 가입 성공', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.register({
        email: 'test@test.com',
        password: 'Test@1234',
        name: '테스트유저',
        phone: '01012345678',
      });

      expect(result.user.email).toBe('test@test.com');
      expect(result.user.role).toBe('USER');
      expect(result.tokens).toBeDefined();
    });

    it('이메일 중복 시 ConflictException', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'test@test.com',
          password: 'Test@1234',
          name: '테스트유저',
          phone: '01012345678',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('올바른 자격 증명으로 로그인 성공', async () => {
      const hashedPassword = await bcrypt.hash('Test@1234', 12);
      const userWithHash = { ...mockUser, passwordHash: hashedPassword };
      prisma.user.findUnique.mockResolvedValue(userWithHash);
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login({
        email: 'test@test.com',
        password: 'Test@1234',
      });

      expect(result.user.email).toBe('test@test.com');
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('존재하지 않는 이메일로 UnauthorizedException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'wrong@test.com', password: 'Test@1234' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('잘못된 비밀번호로 UnauthorizedException', async () => {
      const hashedPassword = await bcrypt.hash('CorrectPass@1', 12);
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: hashedPassword,
      });

      await expect(
        service.login({ email: 'test@test.com', password: 'WrongPass@1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('비활성 계정으로 ForbiddenException', async () => {
      const hashedPassword = await bcrypt.hash('Test@1234', 12);
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: hashedPassword,
        isActive: false,
        deactivatedAt: null,
      });

      await expect(
        service.login({ email: 'test@test.com', password: 'Test@1234' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('탈퇴 처리 중 계정으로 ForbiddenException', async () => {
      const hashedPassword = await bcrypt.hash('Test@1234', 12);
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: hashedPassword,
        isActive: false,
        deactivatedAt: new Date(),
      });

      await expect(
        service.login({ email: 'test@test.com', password: 'Test@1234' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('refreshToken', () => {
    it('유효한 리프레시 토큰으로 새 토큰 발급', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: mockUser.id });
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'token-id',
        token: 'valid-refresh-token',
        expiresAt: new Date(Date.now() + 86400000),
      });
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.refreshToken.delete.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refreshToken('valid-refresh-token');

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(prisma.refreshToken.delete).toHaveBeenCalled();
    });

    it('만료된 리프레시 토큰으로 UnauthorizedException', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: mockUser.id });
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'token-id',
        token: 'expired-token',
        expiresAt: new Date(Date.now() - 86400000),
      });

      await expect(service.refreshToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('모든 리프레시 토큰 삭제', async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.logout(mockUser.id);

      expect(result.message).toBe('로그아웃 되었습니다.');
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
      });
    });
  });

  describe('getProfile', () => {
    it('유효한 userId로 프로필 조회', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        phone: mockUser.phone,
        profileImage: null,
        role: mockUser.role,
        createdAt: new Date(),
      });

      const result = await service.getProfile(mockUser.id);
      expect(result.email).toBe(mockUser.email);
    });

    it('존재하지 않는 userId로 UnauthorizedException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent-id')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
