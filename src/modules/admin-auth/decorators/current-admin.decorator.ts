import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  AuthenticatedAdmin,
  AuthenticatedAdminRequest,
} from '../guards/admin-auth.guard';

export const CurrentAdmin = createParamDecorator(
  (
    _data: unknown,
    context: ExecutionContext,
  ): AuthenticatedAdmin | undefined => {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedAdminRequest>();

    return request.admin;
  },
);

export const CurrentAdminId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedAdminRequest>();

    return request.adminId;
  },
);
