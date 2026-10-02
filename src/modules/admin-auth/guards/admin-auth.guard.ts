import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../../common/database/prisma.service';
import { TokenService } from '../../auth/services/token.service';
import { AdminAccessTokenPayload } from '../../auth/types/admin-token-payload.type';

export type AuthenticatedAdmin = AdminAccessTokenPayload;

export type AuthenticatedAdminRequest = Request & {
  admin?: AuthenticatedAdmin;
  adminId?: string;
};

/**
 * 관리자 Bearer 토큰 가드. 고객 가드와 같이 매 요청 DB를 조회해
 * 비활성화(is_active=false)를 토큰 만료 전이라도 즉시 반영한다.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedAdminRequest>();
    const token = this.extractBearerToken(request);
    const payload = this.tokenService.verifyAdminAccessToken(token);
    const admin = await this.prisma.admins.findUnique({
      where: { id: payload.adminId },
      select: { id: true, is_active: true },
    });

    if (!admin) {
      throw new UnauthorizedException({
        code: 'ADMIN_NOT_FOUND',
        message: '관리자를 찾을 수 없습니다.',
      });
    }

    if (!admin.is_active) {
      throw new UnauthorizedException({
        code: 'ADMIN_INACTIVE',
        message: '비활성화된 관리자입니다.',
      });
    }

    request.admin = payload;
    request.adminId = payload.adminId;

    return true;
  }

  private extractBearerToken(request: Request): string {
    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: '관리자 인증이 필요합니다.',
      });
    }

    const [type, token] = authorization.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authorization 헤더는 "Bearer {token}" 형식이어야 합니다.',
      });
    }

    return token;
  }
}
