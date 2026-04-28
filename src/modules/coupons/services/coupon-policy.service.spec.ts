import { BadRequestException } from '@nestjs/common';
import { coupon_policies_type } from '@prisma/client';
import { CouponPolicyService } from './coupon-policy.service';

const createService = () => {
  const prisma = {
    coupon_policies: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  return {
    service: new CouponPolicyService(prisma as never),
    prisma,
  };
};

describe('CouponPolicyService', () => {
  it('requires discount value for payment discount policies', async () => {
    const { service } = createService();

    await expect(
      service.createPolicy('store_1', {
        name: '할인 쿠폰',
        type: coupon_policies_type.payment_discount,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires benefit value for store benefit policies', async () => {
    const { service } = createService();

    await expect(
      service.createPolicy('store_1', {
        name: '매장 혜택',
        type: coupon_policies_type.store_benefit,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
