import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class AdminFeedbackTokenGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.header('x-admin-token');
    const expected = this.configService.get<string>('ADMIN_FEEDBACK_TOKEN');

    if (!expected || token !== expected) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      });
    }

    return true;
  }
}
