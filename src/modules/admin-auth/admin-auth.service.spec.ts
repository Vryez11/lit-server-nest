/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { admins } from '@prisma/client';
import { AdminAuthService } from './admin-auth.service';

const createAdmin = (overrides: Partial<admins> = {}): admins => ({
  id: 'adm_1',
  email: 'ops@example.com',
  password_hash: 'hashed-password',
  name: '운영팀',
  is_active: true,
  login_count: 0,
  login_locked_until: null,
  last_login_at: new Date('2026-09-30T00:00:00.000Z'),
  created_at: new Date('2026-09-01T00:00:00.000Z'),
  updated_at: new Date('2026-09-01T00:00:00.000Z'),
  ...overrides,
});

const createService = () => {
  const tx = {
    admins: { update: jest.fn() },
    admin_refresh_tokens: { deleteMany: jest.fn() },
  };
  const prisma = {
    admins: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    admin_refresh_tokens: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const passwordService = {
    hash: jest.fn(),
    compare: jest.fn(),
  };
  const tokenService = {
    generateAdminAccessToken: jest.fn().mockReturnValue('access-token'),
    generateAdminRefreshToken: jest.fn().mockReturnValue('refresh-token'),
    getRefreshTokenExpiresAt: jest
      .fn()
      .mockReturnValue(new Date('2026-11-01T00:00:00.000Z')),
    getAccessTokenExpiresInSeconds: jest.fn().mockReturnValue(3600),
    verifyAdminRefreshToken: jest.fn(),
  };
  const service = new AdminAuthService(
    prisma as never,
    passwordService,
    tokenService as never,
  );

  return { service, prisma, tx, passwordService, tokenService };
};

const expectCode = async (
  promise: Promise<unknown>,
  code: string,
  type: new (...args: never[]) => Error = UnauthorizedException,
) => {
  await expect(promise).rejects.toThrow(type);
  await expect(promise).rejects.toMatchObject({
    response: expect.objectContaining({ code }),
  });
};

describe('AdminAuthService', () => {
  describe('login', () => {
    it('issues tokens, stores the refresh token and resets the lock state', async () => {
      const { service, prisma, passwordService, tokenService } =
        createService();
      prisma.admins.findUnique.mockResolvedValue(createAdmin());
      passwordService.compare.mockResolvedValue(true);

      const result = await service.login({
        email: ' OPS@example.com ',
        password: 'password123',
      });

      expect(prisma.admins.findUnique).toHaveBeenCalledWith({
        where: { email: 'ops@example.com' },
      });
      expect(passwordService.compare).toHaveBeenCalledWith(
        'password123',
        'hashed-password',
      );
      expect(tokenService.generateAdminAccessToken).toHaveBeenCalledWith(
        'adm_1',
        'ops@example.com',
      );
      expect(prisma.admin_refresh_tokens.create).toHaveBeenCalledWith({
        data: {
          admin_id: 'adm_1',
          token: 'refresh-token',
          expires_at: new Date('2026-11-01T00:00:00.000Z'),
        },
      });
      expect(prisma.admins.update).toHaveBeenCalledWith({
        where: { id: 'adm_1' },
        data: expect.objectContaining({
          login_count: 0,
          login_locked_until: null,
          last_login_at: expect.any(Date),
        }),
      });
      expect(result).toEqual({
        token: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        admin: {
          id: 'adm_1',
          email: 'ops@example.com',
          name: '운영팀',
          lastLoginAt: new Date('2026-09-30T00:00:00.000Z'),
        },
      });
    });

    it('rejects unknown emails without revealing existence', async () => {
      const { service, prisma, passwordService } = createService();
      prisma.admins.findUnique.mockResolvedValue(null);

      await expectCode(
        service.login({ email: 'nobody@example.com', password: 'x' }),
        'AUTHENTICATION_FAILED',
      );
      expect(passwordService.compare).not.toHaveBeenCalled();
    });

    it('counts a failed attempt and reports remaining attempts', async () => {
      const { service, prisma, passwordService } = createService();
      prisma.admins.findUnique.mockResolvedValue(
        createAdmin({ login_count: 1 }),
      );
      passwordService.compare.mockResolvedValue(false);

      const promise = service.login({
        email: 'ops@example.com',
        password: 'wrong',
      });

      await expect(promise).rejects.toMatchObject({
        response: {
          code: 'AUTHENTICATION_FAILED',
          details: { remainingAttempts: 3 },
        },
      });
      expect(prisma.admins.update).toHaveBeenCalledWith({
        where: { id: 'adm_1' },
        data: expect.objectContaining({
          login_count: 2,
          login_locked_until: null,
        }),
      });
    });

    it('locks the account for 10 minutes on the fifth consecutive failure', async () => {
      const { service, prisma, passwordService } = createService();
      prisma.admins.findUnique.mockResolvedValue(
        createAdmin({ login_count: 4 }),
      );
      passwordService.compare.mockResolvedValue(false);

      const before = Date.now();
      const promise = service.login({
        email: 'ops@example.com',
        password: 'wrong',
      });

      await expectCode(promise, 'ACCOUNT_LOCKED');
      const lockedUntil = prisma.admins.update.mock.calls[0][0].data
        .login_locked_until as Date;
      expect(lockedUntil.getTime() - before).toBeGreaterThanOrEqual(
        10 * 60_000 - 1000,
      );
      expect(prisma.admins.update.mock.calls[0][0].data.login_count).toBe(5);
    });

    it('rejects logins while the account is locked, even with the right password', async () => {
      const { service, prisma, passwordService } = createService();
      prisma.admins.findUnique.mockResolvedValue(
        createAdmin({
          login_count: 5,
          login_locked_until: new Date(Date.now() + 60_000),
        }),
      );

      await expectCode(
        service.login({ email: 'ops@example.com', password: 'password123' }),
        'ACCOUNT_LOCKED',
      );
      expect(passwordService.compare).not.toHaveBeenCalled();
    });

    it('rejects deactivated admins before checking the password', async () => {
      const { service, prisma, passwordService } = createService();
      prisma.admins.findUnique.mockResolvedValue(
        createAdmin({ is_active: false }),
      );

      await expectCode(
        service.login({ email: 'ops@example.com', password: 'password123' }),
        'ADMIN_INACTIVE',
      );
      expect(passwordService.compare).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    const setupValidRefresh = (
      s: ReturnType<typeof createService>,
      adminOverrides: Partial<admins> = {},
    ) => {
      s.tokenService.verifyAdminRefreshToken.mockReturnValue({
        adminId: 'adm_1',
        email: 'ops@example.com',
        role: 'admin',
        type: 'refresh',
      });
      s.prisma.admin_refresh_tokens.findFirst.mockResolvedValue({
        id: 1,
        admin_id: 'adm_1',
        token: 'refresh-token',
        expires_at: new Date(Date.now() + 60_000),
      });
      s.prisma.admins.findUnique.mockResolvedValue({
        id: 'adm_1',
        email: 'ops@example.com',
        is_active: true,
        ...adminOverrides,
      });
    };

    it('reissues an access token for a stored, unexpired refresh token', async () => {
      const s = createService();
      setupValidRefresh(s);

      await expect(
        s.service.refresh({ refreshToken: 'refresh-token' }),
      ).resolves.toEqual({ token: 'access-token', expiresIn: 3600 });
      expect(s.prisma.admins.findUnique).toHaveBeenCalledWith({
        where: { id: 'adm_1' },
        select: { id: true, email: true, is_active: true },
      });
    });

    it('rejects refresh tokens that are not stored', async () => {
      const s = createService();
      setupValidRefresh(s);
      s.prisma.admin_refresh_tokens.findFirst.mockResolvedValue(null);

      await expectCode(
        s.service.refresh({ refreshToken: 'refresh-token' }),
        'TOKEN_NOT_FOUND',
      );
    });

    it('deletes and rejects expired refresh tokens', async () => {
      const s = createService();
      setupValidRefresh(s);
      s.prisma.admin_refresh_tokens.findFirst.mockResolvedValue({
        id: 1,
        admin_id: 'adm_1',
        token: 'refresh-token',
        expires_at: new Date(Date.now() - 1000),
      });

      await expectCode(
        s.service.refresh({ refreshToken: 'refresh-token' }),
        'TOKEN_EXPIRED',
      );
      expect(s.prisma.admin_refresh_tokens.deleteMany).toHaveBeenCalledWith({
        where: { token: 'refresh-token' },
      });
    });

    it('rejects refresh for a deactivated admin', async () => {
      const s = createService();
      setupValidRefresh(s, { is_active: false });

      await expectCode(
        s.service.refresh({ refreshToken: 'refresh-token' }),
        'ADMIN_INACTIVE',
      );
    });

    it('rejects when the stored token belongs to a different admin than the payload', async () => {
      const s = createService();
      setupValidRefresh(s, { id: 'adm_other' });

      await expectCode(
        s.service.refresh({ refreshToken: 'refresh-token' }),
        'ADMIN_NOT_FOUND',
      );
    });
  });

  describe('logout', () => {
    it('deletes the refresh token', async () => {
      const { service, prisma } = createService();
      prisma.admin_refresh_tokens.deleteMany.mockResolvedValue({ count: 1 });

      await expect(
        service.logout({ refreshToken: 'refresh-token' }),
      ).resolves.toEqual({ message: '로그아웃이 완료되었습니다.' });
    });

    it('returns 404 when nothing was deleted', async () => {
      const { service, prisma } = createService();
      prisma.admin_refresh_tokens.deleteMany.mockResolvedValue({ count: 0 });

      await expectCode(
        service.logout({ refreshToken: 'missing' }),
        'TOKEN_NOT_FOUND',
        NotFoundException,
      );
    });
  });

  describe('getMe', () => {
    it('maps the admin row', async () => {
      const { service, prisma } = createService();
      prisma.admins.findUnique.mockResolvedValue(createAdmin());

      await expect(service.getMe('adm_1')).resolves.toEqual({
        id: 'adm_1',
        email: 'ops@example.com',
        name: '운영팀',
        isActive: true,
        lastLoginAt: new Date('2026-09-30T00:00:00.000Z'),
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      });
    });
  });

  describe('changePassword', () => {
    it('rejects a wrong current password', async () => {
      const { service, prisma, passwordService } = createService();
      prisma.admins.findUnique.mockResolvedValue({
        id: 'adm_1',
        password_hash: 'hashed-password',
      });
      passwordService.compare.mockResolvedValue(false);

      await expectCode(
        service.changePassword('adm_1', {
          currentPassword: 'wrong',
          newPassword: 'newPassword123',
        }),
        'AUTHENTICATION_FAILED',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('updates the hash and invalidates every refresh token of the admin', async () => {
      const { service, prisma, tx, passwordService } = createService();
      prisma.admins.findUnique.mockResolvedValue({
        id: 'adm_1',
        password_hash: 'hashed-password',
      });
      passwordService.compare.mockResolvedValue(true);
      passwordService.hash.mockResolvedValue('new-hash');

      await expect(
        service.changePassword('adm_1', {
          currentPassword: 'password123',
          newPassword: 'newPassword123',
        }),
      ).resolves.toEqual({ message: '비밀번호가 변경되었습니다.' });

      expect(tx.admins.update).toHaveBeenCalledWith({
        where: { id: 'adm_1' },
        data: expect.objectContaining({ password_hash: 'new-hash' }),
      });
      expect(tx.admin_refresh_tokens.deleteMany).toHaveBeenCalledWith({
        where: { admin_id: 'adm_1' },
      });
    });
  });
});
