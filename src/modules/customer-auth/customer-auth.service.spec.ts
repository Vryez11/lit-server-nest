import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { customers } from '@prisma/client';
import { CustomerAuthService } from './customer-auth.service';

const createCustomer = (overrides: Partial<customers> = {}): customers => ({
  id: 'customer_1',
  email: 'customer@example.com',
  name: '홍길동',
  phone_number: '01012345678',
  birth_date: null,
  carrier: null,
  gender: null,
  profile_image_url: null,
  provider_type: 'kakao',
  provider_id: 'kakao_1',
  terms_agreed: 1,
  privacy_agreed: 1,
  location_agreed: 1,
  marketing_agreed: 0,
  last_login_at: new Date('2026-01-01T00:00:00.000Z'),
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

const createService = () => {
  const prisma = {
    $transaction: jest.fn(),
    customers: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    customer_refresh_tokens: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const tokenService = {
    generateCustomerAccessToken: jest.fn().mockReturnValue('access-token'),
    generateCustomerRefreshToken: jest.fn().mockReturnValue('refresh-token'),
    verifyCustomerRefreshToken: jest.fn(),
    getRefreshTokenExpiresAt: jest
      .fn()
      .mockReturnValue(new Date('2026-02-01T00:00:00.000Z')),
  };
  const socialProviderService = {
    verifyAccessToken: jest.fn(),
  };
  const service = new CustomerAuthService(
    prisma as never,
    tokenService as never,
    socialProviderService as never,
  );

  return {
    service,
    prisma,
    tokenService,
    socialProviderService,
  };
};

describe('CustomerAuthService', () => {
  it('rotates a valid customer refresh token', async () => {
    const { service, prisma, tokenService } = createService();

    tokenService.verifyCustomerRefreshToken.mockReturnValue({
      customerId: 'customer_1',
      role: 'customer',
      provider: 'kakao',
      type: 'refresh',
    });
    prisma.customer_refresh_tokens.findFirst.mockResolvedValue({
      id: 10,
      customer_id: 'customer_1',
      token: 'old-refresh-token',
      expires_at: new Date(Date.now() + 60_000),
    });
    prisma.customers.findUnique.mockResolvedValue({
      id: 'customer_1',
      provider_type: 'kakao',
    });

    const result = await service.refresh({
      refreshToken: 'old-refresh-token',
    });

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(prisma.customer_refresh_tokens.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: {
        token: 'refresh-token',
        expires_at: new Date('2026-02-01T00:00:00.000Z'),
      },
    });
  });

  it('rejects missing customer refresh token records', async () => {
    const { service, prisma, tokenService } = createService();

    tokenService.verifyCustomerRefreshToken.mockReturnValue({
      customerId: 'customer_1',
      role: 'customer',
      provider: 'kakao',
      type: 'refresh',
    });
    prisma.customer_refresh_tokens.findFirst.mockResolvedValue(null);

    await expect(
      service.refresh({ refreshToken: 'missing-refresh-token' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('anonymizes customer data on withdraw', async () => {
    const { service, prisma } = createService();
    const tx = {
      customer_refresh_tokens: { deleteMany: jest.fn() },
      customer_auth_providers: { deleteMany: jest.fn() },
      customers: { update: jest.fn() },
    };

    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
    );

    const result = await service.withdraw('customer_1');

    expect(tx.customer_refresh_tokens.deleteMany).toHaveBeenCalledWith({
      where: { customer_id: 'customer_1' },
    });
    expect(tx.customer_auth_providers.deleteMany).toHaveBeenCalledWith({
      where: { customer_id: 'customer_1' },
    });
    expect(tx.customers.update).toHaveBeenCalledWith({
      where: { id: 'customer_1' },
      data: {
        email: null,
        name: '탈퇴회원',
        phone_number: null,
        birth_date: null,
        carrier: null,
        gender: null,
        profile_image_url: null,
        provider_id: 'withdrawn_customer_1',
        updated_at: expect.any(Date) as Date,
      },
    });
    expect(result).toEqual({
      message: '회원탈퇴가 완료되었습니다',
    });
  });

  it('returns Express-compatible defaults for notification settings', async () => {
    const { service, prisma } = createService();

    prisma.customers.findUnique.mockResolvedValue({ id: 'customer_1' });

    await expect(
      service.getNotificationSettings('customer_1'),
    ).resolves.toEqual({
      pushEnabled: true,
      emailEnabled: true,
      smsEnabled: false,
      marketingEnabled: false,
    });
  });

  it('keeps notification update blocked until the schema exists', async () => {
    const { service, prisma } = createService();

    prisma.customers.findUnique.mockResolvedValue({ id: 'customer_1' });

    await expect(
      service.updateNotificationSettings('customer_1', {
        pushEnabled: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a social customer and returns Express-compatible auth fields', async () => {
    const { service, prisma, socialProviderService } = createService();
    const customer = createCustomer();
    const tx = {
      customers: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(customer),
      },
      customer_auth_providers: {
        upsert: jest.fn(),
      },
    };

    socialProviderService.verifyAccessToken.mockResolvedValue({
      providerId: 'kakao_1',
      email: 'customer@example.com',
      name: '홍길동',
      profileImage: null,
      rawProfile: { id: 1 },
    });
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
    );
    prisma.customer_refresh_tokens.create.mockResolvedValue({});

    const result = await service.socialLogin({
      provider: 'kakao',
      accessToken: 'provider-access-token',
      termsAgreed: true,
      privacyAgreed: true,
      locationAgreed: true,
    });

    expect(result).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      userId: 'customer_1',
      customerId: 'customer_1',
      provider: 'kakao',
    });
    expect(tx.customer_auth_providers.upsert).toHaveBeenCalled();
  });
});
