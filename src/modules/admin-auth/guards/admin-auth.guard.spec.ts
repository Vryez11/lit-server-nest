/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard';

const createGuard = () => {
  const tokenService = {
    verifyAdminAccessToken: jest.fn().mockReturnValue({
      adminId: 'adm_1',
      email: 'ops@example.com',
      role: 'admin',
      type: 'access',
    }),
  };
  const prisma = {
    admins: {
      findUnique: jest.fn().mockResolvedValue({ id: 'adm_1', is_active: true }),
    },
  };

  return {
    guard: new AdminAuthGuard(tokenService as never, prisma as never),
    tokenService,
    prisma,
  };
};

const createContext = (authorization?: string) => {
  const request: Record<string, unknown> = {
    headers: authorization ? { authorization } : {},
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;

  return { context, request };
};

const expectCode = async (promise: Promise<unknown>, code: string) => {
  await expect(promise).rejects.toThrow(UnauthorizedException);
  await expect(promise).rejects.toMatchObject({
    response: expect.objectContaining({ code }),
  });
};

describe('AdminAuthGuard', () => {
  it('attaches the verified admin payload to the request', async () => {
    const { guard, tokenService, prisma } = createGuard();
    const { context, request } = createContext('Bearer admin-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(tokenService.verifyAdminAccessToken).toHaveBeenCalledWith(
      'admin-token',
    );
    expect(prisma.admins.findUnique).toHaveBeenCalledWith({
      where: { id: 'adm_1' },
      select: { id: true, is_active: true },
    });
    expect(request).toMatchObject({
      admin: { adminId: 'adm_1', role: 'admin' },
      adminId: 'adm_1',
    });
  });

  it('rejects requests without an authorization header', async () => {
    const { guard } = createGuard();

    await expectCode(
      guard.canActivate(createContext().context),
      'AUTHENTICATION_REQUIRED',
    );
  });

  it('rejects malformed authorization headers', async () => {
    const { guard } = createGuard();

    await expectCode(
      guard.canActivate(createContext('Token admin-token').context),
      'AUTHENTICATION_REQUIRED',
    );
  });

  it('propagates token verification failures', async () => {
    const { guard, tokenService } = createGuard();
    tokenService.verifyAdminAccessToken.mockImplementation(() => {
      throw new UnauthorizedException({ code: 'TOKEN_INVALID' });
    });

    await expectCode(
      guard.canActivate(createContext('Bearer bad').context),
      'TOKEN_INVALID',
    );
  });

  it('rejects tokens whose admin no longer exists', async () => {
    const { guard, prisma } = createGuard();
    prisma.admins.findUnique.mockResolvedValue(null);

    await expectCode(
      guard.canActivate(createContext('Bearer admin-token').context),
      'ADMIN_NOT_FOUND',
    );
  });

  it('rejects deactivated admins even with a valid token', async () => {
    const { guard, prisma } = createGuard();
    prisma.admins.findUnique.mockResolvedValue({
      id: 'adm_1',
      is_active: false,
    });

    await expectCode(
      guard.canActivate(createContext('Bearer admin-token').context),
      'ADMIN_INACTIVE',
    );
  });
});
