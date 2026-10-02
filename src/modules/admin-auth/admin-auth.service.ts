import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { RefreshAccessTokenResponseDto } from '../auth/dto/auth-response.dto';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import { RefreshTokenDto } from '../auth/dto/refresh-token.dto';
import { PasswordService } from '../auth/services/password.service';
import { TokenService } from '../auth/services/token.service';
import {
  AdminAuthTokenResponseDto,
  AdminInfoDto,
  AdminLoginDto,
  AdminMessageResponseDto,
} from './dto/admin-auth.dto';
import { toAdminInfo, toAdminSummary } from './mappers/admin.mapper';

// 점주 로그인(AuthService)과 같은 잠금 정책: 연속 실패 5회 → 10분 잠금.
const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MINUTES = 10;

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async login(dto: AdminLoginDto): Promise<AdminAuthTokenResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const admin = await this.prisma.admins.findUnique({ where: { email } });

    if (!admin) {
      throw this.authenticationFailed();
    }

    if (admin.login_locked_until && admin.login_locked_until > new Date()) {
      throw this.accountLocked(admin.login_locked_until);
    }

    // 비밀번호 검사보다 먼저 거부해 비활성 계정에 대한 비밀번호 추측을 막는다.
    if (!admin.is_active) {
      throw this.adminInactive();
    }

    const passwordMatched = await this.passwordService.compare(
      dto.password,
      admin.password_hash,
    );

    if (!passwordMatched) {
      const nextFailedCount = admin.login_count + 1;
      const shouldLock = nextFailedCount >= MAX_LOGIN_FAILURES;
      const lockedUntil = shouldLock
        ? this.addMinutes(new Date(), LOGIN_LOCK_MINUTES)
        : null;

      await this.prisma.admins.update({
        where: { id: admin.id },
        data: {
          login_count: nextFailedCount,
          login_locked_until: lockedUntil,
          updated_at: new Date(),
        },
      });

      if (shouldLock) {
        throw this.accountLocked(lockedUntil);
      }

      throw this.authenticationFailed(
        Math.max(MAX_LOGIN_FAILURES - nextFailedCount, 0),
      );
    }

    const token = this.tokenService.generateAdminAccessToken(
      admin.id,
      admin.email,
    );
    const refreshToken = this.tokenService.generateAdminRefreshToken(
      admin.id,
      admin.email,
    );

    await this.prisma.admin_refresh_tokens.create({
      data: {
        admin_id: admin.id,
        token: refreshToken,
        expires_at: this.tokenService.getRefreshTokenExpiresAt(),
      },
    });

    await this.prisma.admins.update({
      where: { id: admin.id },
      data: {
        last_login_at: new Date(),
        login_count: 0,
        login_locked_until: null,
        updated_at: new Date(),
      },
    });

    return {
      token,
      refreshToken,
      expiresIn: this.tokenService.getAccessTokenExpiresInSeconds(),
      // 응답의 lastLoginAt은 "이번 로그인 이전" 값이다(조회 시점의 행 기준).
      admin: toAdminSummary(admin),
    };
  }

  async refresh(dto: RefreshTokenDto): Promise<RefreshAccessTokenResponseDto> {
    const payload = this.tokenService.verifyAdminRefreshToken(dto.refreshToken);
    const tokenRecord = await this.prisma.admin_refresh_tokens.findFirst({
      where: { token: dto.refreshToken },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException({
        code: 'TOKEN_NOT_FOUND',
        message: 'Refresh Token을 찾을 수 없습니다.',
      });
    }

    if (tokenRecord.expires_at <= new Date()) {
      await this.prisma.admin_refresh_tokens.deleteMany({
        where: { token: dto.refreshToken },
      });

      throw new UnauthorizedException({
        code: 'TOKEN_EXPIRED',
        message: 'Refresh Token이 만료되었습니다.',
      });
    }

    const admin = await this.prisma.admins.findUnique({
      where: { id: tokenRecord.admin_id },
      select: { id: true, email: true, is_active: true },
    });

    if (!admin || admin.id !== payload.adminId) {
      throw this.adminNotFound();
    }

    if (!admin.is_active) {
      throw this.adminInactive();
    }

    return {
      token: this.tokenService.generateAdminAccessToken(admin.id, admin.email),
      expiresIn: this.tokenService.getAccessTokenExpiresInSeconds(),
    };
  }

  async logout(dto: RefreshTokenDto): Promise<AdminMessageResponseDto> {
    const result = await this.prisma.admin_refresh_tokens.deleteMany({
      where: { token: dto.refreshToken },
    });

    if (result.count === 0) {
      throw new NotFoundException({
        code: 'TOKEN_NOT_FOUND',
        message: '유효하지 않은 Refresh Token입니다.',
      });
    }

    return { message: '로그아웃이 완료되었습니다.' };
  }

  async getMe(adminId: string): Promise<AdminInfoDto> {
    const admin = await this.prisma.admins.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw this.adminNotFound();
    }

    return toAdminInfo(admin);
  }

  async changePassword(
    adminId: string,
    dto: ChangePasswordDto,
  ): Promise<AdminMessageResponseDto> {
    const admin = await this.prisma.admins.findUnique({
      where: { id: adminId },
      select: { id: true, password_hash: true },
    });

    if (!admin) {
      throw this.adminNotFound();
    }

    const passwordMatched = await this.passwordService.compare(
      dto.currentPassword,
      admin.password_hash,
    );

    if (!passwordMatched) {
      throw this.authenticationFailed();
    }

    const newPasswordHash = await this.passwordService.hash(dto.newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.admins.update({
        where: { id: admin.id },
        data: {
          password_hash: newPasswordHash,
          updated_at: new Date(),
        },
      });

      // 비밀번호 변경 시 기존 세션(refresh 토큰)을 모두 무효화한다(점주와 동일).
      await tx.admin_refresh_tokens.deleteMany({
        where: { admin_id: admin.id },
      });
    });

    return { message: '비밀번호가 변경되었습니다.' };
  }

  private authenticationFailed(
    remainingAttempts?: number,
  ): UnauthorizedException {
    return new UnauthorizedException({
      code: 'AUTHENTICATION_FAILED',
      message: '이메일 또는 비밀번호가 일치하지 않습니다.',
      ...(remainingAttempts !== undefined
        ? { details: { remainingAttempts } }
        : {}),
    });
  }

  private accountLocked(lockedUntil: Date | null): UnauthorizedException {
    return new UnauthorizedException({
      code: 'ACCOUNT_LOCKED',
      message: '로그인이 잠겼습니다. 잠시 후 다시 시도해주세요.',
      details: { lockedUntil },
    });
  }

  private adminInactive(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'ADMIN_INACTIVE',
      message: '비활성화된 관리자입니다.',
    });
  }

  private adminNotFound(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'ADMIN_NOT_FOUND',
      message: '관리자를 찾을 수 없습니다.',
    });
  }

  private addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60_000);
  }
}
