import { coupon_policies, coupons } from '@prisma/client';
import { CouponPolicyResponseDto, CouponResponseDto } from '../dto/coupon.dto';

export const toCouponResponse = (coupon: coupons): CouponResponseDto => ({
  id: coupon.id,
  customerId: coupon.customer_id,
  storeId: coupon.store_id,
  type: coupon.type,
  title: coupon.title,
  description: coupon.description,
  discountAmount: coupon.discount_amount,
  discountRate: coupon.discount_rate,
  minSpend: coupon.min_spend,
  maxDiscount: coupon.max_discount,
  benefitItem: coupon.benefit_item,
  benefitValue: coupon.benefit_value,
  status: coupon.status,
  issuedAt: coupon.issued_at,
  expiresAt: coupon.expires_at,
  usedAt: coupon.used_at,
  reservationId: coupon.reservation_id,
  paymentId: coupon.payment_id,
  createdAt: coupon.created_at,
  updatedAt: coupon.updated_at,
});

export const toCouponPolicyResponse = (
  policy: coupon_policies,
): CouponPolicyResponseDto => ({
  id: policy.id,
  storeId: policy.store_id,
  name: policy.name,
  type: policy.type,
  discountAmount: policy.discount_amount,
  discountRate: policy.discount_rate,
  minSpend: policy.min_spend,
  maxDiscount: policy.max_discount,
  benefitItem: policy.benefit_item,
  benefitValue: policy.benefit_value,
  autoIssueOn: policy.auto_issue_on,
  validityDays: policy.validity_days,
  enabled: policy.enabled === 1,
  createdAt: policy.created_at,
  updatedAt: policy.updated_at,
});
