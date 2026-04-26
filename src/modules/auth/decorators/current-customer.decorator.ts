import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  AuthenticatedCustomer,
  AuthenticatedCustomerRequest,
} from '../guards/customer-auth.guard';

export const CurrentCustomer = createParamDecorator(
  (
    _data: unknown,
    context: ExecutionContext,
  ): AuthenticatedCustomer | undefined => {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedCustomerRequest>();

    return request.customer;
  },
);

export const CurrentCustomerId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedCustomerRequest>();

    return request.customerId;
  },
);
