/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { BadRequestException } from '@nestjs/common';
import {
  coupon_policies_type,
  coupon_policies_auto_issue_on,
  coupons_status,
  coupons_type,
} from '@prisma/client';
import { CustomerCouponService } from './customer-coupon.service';

const createPolicy = () => ({
  id: 'coup_pol_1',
  store_id: 'store_1',
  name: '음료 혜택',
  type: coupon_policies_type.store_benefit,
  discount_amount: null,
  discount_rate: null,
  min_spend: null,
  max_discount: null,
  benefit_item: '아메리카노',
  benefit_value: '1잔 무료',
  auto_issue_on: coupon_policies_auto_issue_on.manual_claim,
  validity_days: 7,
  enabled: 1,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
});

const createCoupon = () => ({
  id: 'coup_1',
  customer_id: 'customer_1',
  store_id: 'store_1',
  type: coupons_type.store_benefit,
  title: '음료 혜택',
  description: null,
  discount_amount: null,
  discount_rate: null,
  min_spend: null,
  max_discount: null,
  benefit_item: '아메리카노',
  benefit_value: '1잔 무료',
  status: coupons_status.active,
  issued_at: new Date('2026-01-01T00:00:00.000Z'),
  expires_at: new Date(Date.now() + 60_000),
  used_at: null,
  reservation_id: null,
  phone_snapshot: null,
  payment_id: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
});

const createService = () => {
  const prisma = {
    coupon_policies: {
      findFirst: jest.fn(),
    },
    coupons: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      groupBy: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const storePinService = {
    verifyPinForStore: jest.fn(),
  };

  return {
    service: new CustomerCouponService(
      prisma as never,
      storePinService as never,
    ),
    prisma,
    storePinService,
  };
};

describe('CustomerCouponService', () => {
  it('claims a coupon from an enabled manual policy only', async () => {
    const { service, prisma } = createService();
    const policy = createPolicy();
    const coupon = createCoupon();

    prisma.coupon_policies.findFirst.mockResolvedValue(policy);
    prisma.coupons.findFirst.mockResolvedValue(null);
    prisma.coupons.create.mockResolvedValue(coupon);

    const result = await service.claimCoupon('customer_1', {
      policyId: 'coup_pol_1',
    });

    expect(prisma.coupon_policies.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'coup_pol_1',
        enabled: 1,
        auto_issue_on: coupon_policies_auto_issue_on.manual_claim,
      },
    });
    expect(prisma.coupons.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customer_id: 'customer_1',
        store_id: 'store_1',
        type: coupons_type.store_benefit,
        title: '음료 혜택',
      }),
    });
    expect(result.id).toBe('coup_1');
  });

  it('rejects duplicate manual claim for the same policy-shaped coupon', async () => {
    const { service, prisma } = createService();

    prisma.coupon_policies.findFirst.mockResolvedValue(createPolicy());
    prisma.coupons.findFirst.mockResolvedValue({ id: 'coup_existing' });

    await expect(
      service.claimCoupon('customer_1', { policyId: 'coup_pol_1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('redeems a store benefit coupon only after store PIN verification', async () => {
    const { service, prisma, storePinService } = createService();
    const coupon = createCoupon();
    const usedCoupon = {
      ...coupon,
      status: coupons_status.used,
      used_at: new Date('2026-01-02T00:00:00.000Z'),
    };

    prisma.coupons.findUnique.mockResolvedValue(coupon);
    storePinService.verifyPinForStore.mockResolvedValue(undefined);
    prisma.coupons.updateMany.mockResolvedValue({ count: 1 });
    prisma.coupons.findUniqueOrThrow.mockResolvedValue(usedCoupon);

    const result = await service.redeemStoreBenefitCoupon(
      'customer_1',
      'coup_1',
      {
        storePin: '1234',
      },
    );

    expect(storePinService.verifyPinForStore).toHaveBeenCalledWith(
      'store_1',
      '1234',
    );
    expect(prisma.coupons.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'coup_1',
        customer_id: 'customer_1',
        status: coupons_status.active,
      },
      data: expect.objectContaining({
        status: coupons_status.used,
      }),
    });
    expect(result.status).toBe(coupons_status.used);
  });

  it('does not redeem payment discount coupons before payment module is ready', async () => {
    const { service, prisma } = createService();

    prisma.coupons.findUnique.mockResolvedValue({
      ...createCoupon(),
      type: coupons_type.payment_discount,
    });

    await expect(
      service.redeemStoreBenefitCoupon('customer_1', 'coup_1', {
        storePin: '1234',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
