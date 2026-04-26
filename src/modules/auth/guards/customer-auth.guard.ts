import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../../common/database/prisma.service';
import { TokenService } from '../services/token.service';
import { CustomerAccessTokenPayload } from '../types/customer-token-payload.type';

export type AuthenticatedCustomer = CustomerAccessTokenPayload;

export type AuthenticatedCustomerRequest = Request & {
  customer?: AuthenticatedCustomer;
  customerId?: string;
};

@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedCustomerRequest>();
    const token = this.extractBearerToken(request);
    const payload = this.tokenService.verifyCustomerAccessToken(token);
    const customer = await this.prisma.customers.findUnique({
      where: { id: payload.customerId },
      select: { id: true },
    });

    if (!customer) {
      throw new UnauthorizedException({
        code: 'CUSTOMER_NOT_FOUND',
        message: '고객 정보를 찾을 수 없습니다.',
      });
    }

    request.customer = payload;
    request.customerId = payload.customerId;

    return true;
  }

  private extractBearerToken(request: Request): string {
    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: '토큰이 필요합니다.',
      });
    }

    const [type, token] = authorization.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Authorization 헤더는 "Bearer {token}" 형식이어야 합니다.',
      });
    }

    return token;
  }
}
