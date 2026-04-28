import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  coupon_policies_auto_issue_on,
  coupons,
  coupons_status,
  coupons_type,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../common/database/prisma.service';
import { StorePinService } from '../../stores/services/store-pin.service';
import {
  ClaimCouponDto,
  CouponListResponseDto,
  CouponResponseDto,
  CouponStatsResponseDto,
  ListCouponsQueryDto,
  RedeemStoreBenefitCouponDto,
} from '../dto/coupon.dto';
import { toCouponResponse } from '../mappers/coupon.mapper';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class CustomerCouponService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storePinService: StorePinService,
  ) {}

  async claimCoupon(
    customerId: string,
    dto: ClaimCouponDto,
  ): Promise<CouponResponseDto> {
    const policy = await this.prisma.coupon_policies.findFirst({
      where: {
        id: dto.policyId,
        enabled: 1,
        auto_issue_on: coupon_policies_auto_issue_on.manual_claim,
      },
    });

    if (!policy) {
      throw new NotFoundException({
        code: 'POLICY_NOT_FOUND',
        message: '발급 가능한 쿠폰 정책을 찾을 수 없습니다.',
      });
    }

    const duplicate = await this.prisma.coupons.findFirst({
      where: {
        customer_id: customerId,
        store_id: policy.store_id,
        type: policy.type,
        title: policy.name,
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new BadRequestException({
        code: 'COUPON_ALREADY_CLAIMED',
        message: '이미 발급받은 쿠폰입니다.',
      });
    }

    const coupon = await this.prisma.coupons.create({
      data: {
        id: `coup_${randomUUID()}`,
        customer_id: customerId,
        store_id: policy.store_id,
        type: policy.type,
        title: policy.name || this.getDefaultTitle(policy.type),
        description: null,
        discount_amount: policy.discount_amount,
        discount_rate: policy.discount_rate,
        min_spend: policy.min_spend,
        max_discount: policy.max_discount,
        benefit_item: policy.benefit_item,
        benefit_value: policy.benefit_value,
        status: coupons_status.active,
        issued_at: new Date(),
        expires_at: this.addDays(policy.validity_days || 7),
        used_at: null,
        reservation_id: null,
        payment_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    return toCouponResponse(coupon);
  }

  async listCoupons(
    customerId: string,
    query: ListCouponsQueryDto,
  ): Promise<CouponListResponseDto> {
    await this.expireCustomerCoupons(customerId);

    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const where = {
      customer_id: customerId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.storeId ? { store_id: query.storeId } : {}),
    };

    const [total, coupons] = await Promise.all([
      this.prisma.coupons.count({ where }),
      this.prisma.coupons.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: coupons.map(toCouponResponse),
      page,
      limit,
      total,
    };
  }

  async getCoupon(
    customerId: string,
    couponId: string,
  ): Promise<CouponResponseDto> {
    const coupon = await this.findCustomerCoupon(customerId, couponId);
    const normalized = await this.expireCouponIfNeeded(coupon);

    return toCouponResponse(normalized);
  }

  async getStats(customerId: string): Promise<CouponStatsResponseDto> {
    await this.expireCustomerCoupons(customerId);

    const rows = await this.prisma.coupons.groupBy({
      by: ['status'],
      where: { customer_id: customerId },
      _count: { _all: true },
    });
    const stats = {
      activeCount: 0,
      usedCount: 0,
      expiredCount: 0,
    };

    for (const row of rows) {
      if (row.status === coupons_status.active) {
        stats.activeCount = row._count._all;
      }
      if (row.status === coupons_status.used) {
        stats.usedCount = row._count._all;
      }
      if (row.status === coupons_status.expired) {
        stats.expiredCount = row._count._all;
      }
    }

    return stats;
  }

  async redeemStoreBenefitCoupon(
    customerId: string,
    couponId: string,
    dto: RedeemStoreBenefitCouponDto,
  ): Promise<CouponResponseDto> {
    const coupon = await this.findCustomerCoupon(customerId, couponId);

    this.assertRedeemableStoreBenefitCoupon(coupon);

    if (coupon.expires_at <= new Date()) {
      const expired = await this.markExpired(coupon.id);
      throw new BadRequestException({
        code: 'EXPIRED',
        message: '만료된 쿠폰입니다.',
        details: { coupon: toCouponResponse(expired) },
      });
    }

    await this.storePinService.verifyPinForStore(
      coupon.store_id!,
      dto.storePin,
    );

    const now = new Date();
    const updateResult = await this.prisma.coupons.updateMany({
      where: {
        id: coupon.id,
        customer_id: customerId,
        status: coupons_status.active,
      },
      data: {
        status: coupons_status.used,
        used_at: now,
        updated_at: now,
      },
    });

    if (updateResult.count === 0) {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: '이미 사용되었거나 만료된 쿠폰입니다.',
      });
    }

    const updated = await this.prisma.coupons.findUniqueOrThrow({
      where: { id: coupon.id },
    });

    return toCouponResponse(updated);
  }

  private async findCustomerCoupon(
    customerId: string,
    couponId: string,
  ): Promise<coupons> {
    const coupon = await this.prisma.coupons.findUnique({
      where: { id: couponId },
    });

    if (!coupon) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '쿠폰을 찾을 수 없습니다.',
      });
    }

    if (coupon.customer_id !== customerId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '본인 쿠폰이 아닙니다.',
      });
    }

    return coupon;
  }

  private assertRedeemableStoreBenefitCoupon(coupon: coupons): void {
    if (coupon.type === coupons_type.payment_discount) {
      throw new BadRequestException({
        code: 'PAYMENT_COUPON_USE_NOT_SUPPORTED',
        message: '결제 할인 쿠폰은 결제 모듈에서만 사용할 수 있습니다.',
      });
    }

    if (coupon.type !== coupons_type.store_benefit) {
      throw new BadRequestException({
        code: 'INVALID_COUPON_TYPE',
        message: '매장 혜택 쿠폰만 사용할 수 있습니다.',
      });
    }

    if (!coupon.store_id) {
      throw new BadRequestException({
        code: 'STORE_REQUIRED',
        message: '매장 혜택 쿠폰에는 storeId가 필요합니다.',
      });
    }

    if (coupon.status !== coupons_status.active) {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: '이미 사용되었거나 만료된 쿠폰입니다.',
      });
    }
  }

  private async expireCustomerCoupons(customerId: string): Promise<void> {
    await this.prisma.coupons.updateMany({
      where: {
        customer_id: customerId,
        status: coupons_status.active,
        expires_at: { lt: new Date() },
      },
      data: {
        status: coupons_status.expired,
        updated_at: new Date(),
      },
    });
  }

  private async expireCouponIfNeeded(coupon: coupons): Promise<coupons> {
    if (
      coupon.status === coupons_status.active &&
      coupon.expires_at <= new Date()
    ) {
      return this.markExpired(coupon.id);
    }

    return coupon;
  }

  private async markExpired(couponId: string): Promise<coupons> {
    return this.prisma.coupons.update({
      where: { id: couponId },
      data: {
        status: coupons_status.expired,
        updated_at: new Date(),
      },
    });
  }

  private addDays(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  private getDefaultTitle(type: string): string {
    return type === coupons_type.payment_discount
      ? '할인 쿠폰'
      : '매장 혜택 쿠폰';
  }
}
