import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { coupon_policies_type, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../common/database/prisma.service';
import {
  CouponPolicyResponseDto,
  CreateCouponPolicyDto,
  ListCouponPoliciesQueryDto,
  UpdateCouponPolicyDto,
} from '../dto/coupon.dto';
import { toCouponPolicyResponse } from '../mappers/coupon.mapper';

@Injectable()
export class CouponPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async createPolicy(
    storeId: string,
    dto: CreateCouponPolicyDto,
  ): Promise<CouponPolicyResponseDto> {
    this.assertPolicyContent(dto.type, dto);

    const policy = await this.prisma.coupon_policies.create({
      data: {
        id: `coup_pol_${randomUUID()}`,
        store_id: storeId,
        name: dto.name.trim(),
        type: dto.type,
        discount_amount: dto.discountAmount ?? null,
        discount_rate: dto.discountRate ?? null,
        min_spend: dto.minSpend ?? null,
        max_discount: dto.maxDiscount ?? null,
        benefit_item: dto.benefitItem ?? null,
        benefit_value: dto.benefitValue ?? null,
        auto_issue_on: dto.autoIssueOn ?? 'manual_claim',
        validity_days: dto.validityDays ?? 7,
        enabled: dto.enabled === false ? 0 : 1,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    return toCouponPolicyResponse(policy);
  }

  async listPolicies(
    storeId: string,
    query: ListCouponPoliciesQueryDto,
  ): Promise<CouponPolicyResponseDto[]> {
    const policies = await this.prisma.coupon_policies.findMany({
      where: {
        store_id: storeId,
        ...(query.enabled !== undefined
          ? { enabled: this.parseEnabled(query.enabled) }
          : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.autoIssueOn ? { auto_issue_on: query.autoIssueOn } : {}),
      },
      orderBy: { created_at: 'desc' },
    });

    return policies.map(toCouponPolicyResponse);
  }

  async getPolicy(
    storeId: string,
    policyId: string,
  ): Promise<CouponPolicyResponseDto> {
    const policy = await this.findOwnedPolicy(storeId, policyId);

    return toCouponPolicyResponse(policy);
  }

  async updatePolicy(
    storeId: string,
    policyId: string,
    dto: UpdateCouponPolicyDto,
  ): Promise<CouponPolicyResponseDto> {
    const existing = await this.findOwnedPolicy(storeId, policyId);
    const nextType = dto.type ?? existing.type;

    this.assertPolicyContent(nextType, {
      ...existing,
      ...dto,
      discountAmount: dto.discountAmount ?? existing.discount_amount,
      discountRate: dto.discountRate ?? existing.discount_rate,
      benefitItem: dto.benefitItem ?? existing.benefit_item,
      benefitValue: dto.benefitValue ?? existing.benefit_value,
    });

    const data: Prisma.coupon_policiesUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.discountAmount !== undefined
        ? { discount_amount: dto.discountAmount }
        : {}),
      ...(dto.discountRate !== undefined
        ? { discount_rate: dto.discountRate }
        : {}),
      ...(dto.minSpend !== undefined ? { min_spend: dto.minSpend } : {}),
      ...(dto.maxDiscount !== undefined
        ? { max_discount: dto.maxDiscount }
        : {}),
      ...(dto.benefitItem !== undefined
        ? { benefit_item: dto.benefitItem }
        : {}),
      ...(dto.benefitValue !== undefined
        ? { benefit_value: dto.benefitValue }
        : {}),
      ...(dto.autoIssueOn !== undefined
        ? { auto_issue_on: dto.autoIssueOn }
        : {}),
      ...(dto.validityDays !== undefined
        ? { validity_days: dto.validityDays }
        : {}),
      ...(dto.enabled !== undefined ? { enabled: dto.enabled ? 1 : 0 } : {}),
      updated_at: new Date(),
    };

    const updated = await this.prisma.coupon_policies.update({
      where: { id: policyId },
      data,
    });

    return toCouponPolicyResponse(updated);
  }

  async deletePolicy(storeId: string, policyId: string): Promise<null> {
    await this.findOwnedPolicy(storeId, policyId);
    await this.prisma.coupon_policies.delete({
      where: { id: policyId },
    });

    return null;
  }

  private async findOwnedPolicy(storeId: string, policyId: string) {
    const policy = await this.prisma.coupon_policies.findFirst({
      where: {
        id: policyId,
        store_id: storeId,
      },
    });

    if (!policy) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '정책을 찾을 수 없습니다',
      });
    }

    return policy;
  }

  private parseEnabled(value: string): number {
    return value === 'true' || value === '1' ? 1 : 0;
  }

  private assertPolicyContent(
    type: coupon_policies_type,
    dto: {
      discountAmount?: number | null;
      discountRate?: number | null;
      benefitItem?: string | null;
      benefitValue?: string | null;
    },
  ): void {
    if (
      type === coupon_policies_type.payment_discount &&
      !dto.discountAmount &&
      !dto.discountRate
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message:
          '결제 할인 쿠폰은 discountAmount 또는 discountRate가 필요합니다.',
      });
    }

    if (
      type === coupon_policies_type.store_benefit &&
      !dto.benefitItem &&
      !dto.benefitValue
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '매장 혜택 쿠폰은 benefitItem 또는 benefitValue가 필요합니다.',
      });
    }
  }
}
