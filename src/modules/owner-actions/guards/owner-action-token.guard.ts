import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { verifyOwnerActionToken } from '../owner-action-token.util';

/**
 * 점주 액션 링크 가드. :id 경로 파라미터와 ?t= 쿼리 토큰의 HMAC 일치를 검증한다.
 * OWNER_ACTION_SECRET 미설정 시 전부 거부(잠금 기본값).
 */
@Injectable()
export class OwnerActionTokenGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const reservationId = String(request.params?.id ?? '');
    const token = String((request.query?.t as string) ?? '');
    const secret = this.configService.get<string>('OWNER_ACTION_SECRET');

    if (
      !secret ||
      !reservationId ||
      !verifyOwnerActionToken(reservationId, token, secret)
    ) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      });
    }

    return true;
  }
}
