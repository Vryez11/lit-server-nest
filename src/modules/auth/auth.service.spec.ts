/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { stores } from '@prisma/client';
import { AuthService } from './auth.service';

const createStore = (): stores => ({
  id: 'store_1',
  email: 'store@example.com',
  password_hash: 'hashed-password',
  store_pin_hash: null,
  store_pin_updated_at: null,
  store_pin_failed_count: 0,
  store_pin_locked_until: null,
  phone_number: '01012345678',
  store_phone_number: '050700000000',
  notification_phone: null,
  wants_sms_notification: true,
  business_type: 'RESTAURANT',
  profile_image_url: null,
  has_completed_setup: false,
  business_number: '1234567890',
  business_name: '루라운지 혼술바',
  slug: 'store-test',
  representative_name: '홍길동',
  address: '서울 용산구 한강대로44길 5',
  detail_address: '지하 1층',
  latitude: null,
  longitude: null,
  description: '매장 소개',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
  last_login_at: null,
  login_count: 0,
});

const createAuthService = () => {
  const tx = {
    stores: {
      update: jest.fn(),
    },
    refresh_tokens: {
      deleteMany: jest.fn(),
    },
  };
  const prisma = {
    stores: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refresh_tokens: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const emailVerificationService = {
    generateCode: jest.fn(),
    saveCode: jest.fn(),
    verifyCode: jest.fn(),
    assertEmailVerified: jest.fn(),
    toSaveError: jest.fn(),
  };
  const mailService = {
    sendVerificationEmail: jest.fn(),
  };
  const passwordService = {
    hash: jest.fn(),
    compare: jest.fn(),
  };
  const tokenService = {
    generateAccessToken: jest.fn().mockReturnValue('access-token'),
    generateRefreshToken: jest.fn().mockReturnValue('refresh-token'),
    getRefreshTokenExpiresAt: jest
      .fn()
      .mockReturnValue(new Date('2026-02-01T00:00:00.000Z')),
    getAccessTokenExpiresInSeconds: jest.fn().mockReturnValue(3600),
    verifyRefreshToken: jest.fn(),
  };

  const service = new AuthService(
    prisma as never,
    emailVerificationService as never,
    mailService as never,
    passwordService,
    tokenService as never,
  );

  return {
    service,
    prisma,
    tx,
    passwordService,
    tokenService,
  };
};

describe('AuthService', () => {
  it('logs in a store and stores a refresh token', async () => {
    const { service, prisma, passwordService, tokenService } =
      createAuthService();
    const store = createStore();

    prisma.stores.findUnique.mockResolvedValue(store);
    passwordService.compare.mockResolvedValue(true);
    prisma.refresh_tokens.create.mockResolvedValue({});

    const result = await service.login({
      email: 'STORE@example.com',
      password: 'password123',
    });

    expect(prisma.stores.findUnique).toHaveBeenCalledWith({
      where: { email: 'store@example.com' },
    });
    expect(passwordService.compare).toHaveBeenCalledWith(
      'password123',
      'hashed-password',
    );
    expect(prisma.refresh_tokens.create).toHaveBeenCalledWith({
      data: {
        store_id: 'store_1',
        token: 'refresh-token',
        expires_at: new Date('2026-02-01T00:00:00.000Z'),
      },
    });
    expect(tokenService.generateAccessToken).toHaveBeenCalledWith(
      'store_1',
      'store@example.com',
    );
    expect(prisma.stores.update).toHaveBeenCalledWith({
      where: { id: 'store_1' },
      data: expect.objectContaining({ login_count: { increment: 1 } }),
    });
    expect(result).toMatchObject({
      token: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      user_info: {
        id: 'store_1',
        storeId: 'store_1',
        email: 'store@example.com',
        businessName: '루라운지 혼술바',
      },
    });
  });

  it('rejects login when the password does not match', async () => {
    const { service, prisma, passwordService } = createAuthService();

    prisma.stores.findUnique.mockResolvedValue(createStore());
    passwordService.compare.mockResolvedValue(false);

    await expect(
      service.login({
        email: 'store@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.stores.update).not.toHaveBeenCalled();
  });

  it('changes the password and revokes existing refresh tokens', async () => {
    const { service, prisma, tx, passwordService } = createAuthService();

    prisma.stores.findUnique.mockResolvedValue({
      id: 'store_1',
      password_hash: 'old-hash',
    });
    passwordService.compare.mockResolvedValue(true);
    passwordService.hash.mockResolvedValue('new-hash');

    const result = await service.changePassword('store_1', {
      currentPassword: 'currentPassword123',
      newPassword: 'newPassword123',
    });

    expect(passwordService.compare).toHaveBeenCalledWith(
      'currentPassword123',
      'old-hash',
    );
    expect(tx.stores.update).toHaveBeenCalledWith({
      where: { id: 'store_1' },
      data: expect.objectContaining({ password_hash: 'new-hash' }),
    });
    expect(tx.refresh_tokens.deleteMany).toHaveBeenCalledWith({
      where: { store_id: 'store_1' },
    });
    expect(result).toEqual({ message: '비밀번호가 변경되었습니다.' });
  });

  it('rejects password change when the current password does not match', async () => {
    const { service, prisma, tx, passwordService } = createAuthService();

    prisma.stores.findUnique.mockResolvedValue({
      id: 'store_1',
      password_hash: 'old-hash',
    });
    passwordService.compare.mockResolvedValue(false);

    await expect(
      service.changePassword('store_1', {
        currentPassword: 'wrong-password',
        newPassword: 'newPassword123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tx.stores.update).not.toHaveBeenCalled();
  });

  it('rejects password change when the store does not exist', async () => {
    const { service, prisma } = createAuthService();

    prisma.stores.findUnique.mockResolvedValue(null);

    await expect(
      service.changePassword('store_unknown', {
        currentPassword: 'currentPassword123',
        newPassword: 'newPassword123',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refreshes an access token when the refresh token is valid', async () => {
    const { service, prisma, tokenService } = createAuthService();
    const expiresAt = new Date(Date.now() + 60_000);

    tokenService.verifyRefreshToken.mockReturnValue({
      storeId: 'store_1',
      email: 'store@example.com',
      type: 'refresh',
    });
    prisma.refresh_tokens.findFirst.mockResolvedValue({
      store_id: 'store_1',
      expires_at: expiresAt,
    });
    prisma.stores.findUnique.mockResolvedValue({
      id: 'store_1',
      email: 'store@example.com',
    });

    const result = await service.refresh({ refreshToken: 'refresh-token' });

    expect(result).toEqual({
      token: 'access-token',
      expiresIn: 3600,
    });
  });
});
