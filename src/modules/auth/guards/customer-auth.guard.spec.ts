import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { TokenService } from '../services/token.service';
import { CustomerAuthGuard } from './customer-auth.guard';

const createContext = (authorization?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authorization ? { authorization } : {},
      }),
    }),
  }) as ExecutionContext;

describe('CustomerAuthGuard', () => {
  it('attaches the verified customer payload to the request', async () => {
    const verifyCustomerAccessToken = jest.fn().mockReturnValue({
      customerId: 'cust_1',
      role: 'customer',
      provider: 'kakao',
      type: 'access',
    });
    const prisma = {
      customers: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cust_1' }),
      },
    };
    const request = {
      headers: {
        authorization: 'Bearer access-token',
      },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
    const guard = new CustomerAuthGuard(
      { verifyCustomerAccessToken } as unknown as TokenService,
      prisma as never,
    );

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(verifyCustomerAccessToken).toHaveBeenCalledWith('access-token');
    expect(prisma.customers.findUnique).toHaveBeenCalledWith({
      where: { id: 'cust_1' },
      select: { id: true },
    });
    expect(request).toMatchObject({
      customerId: 'cust_1',
      customer: {
        customerId: 'cust_1',
        role: 'customer',
        provider: 'kakao',
        type: 'access',
      },
    });
  });

  it('rejects requests without an authorization header', async () => {
    const guard = new CustomerAuthGuard({} as TokenService, {} as never);

    await expect(guard.canActivate(createContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
