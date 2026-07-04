import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CouponPolicyResponseDto } from './dto/coupon.dto';
import { CouponPolicyService } from './services/coupon-policy.service';

/**
 * (공개) 고객/랜딩용 매장 쿠폰 정책 조회.
 *
 * 인증 없이 매장이 현재 발급 중인(enabled) 매장 혜택 정책만 노출한다.
 * landing 매장 상세의 "이 매장이 발급하는 쿠폰" 섹션이 프록시
 * (GET /api/stores/:id/coupon-policies)를 통해 호출한다.
 * 이 엔드포인트 배포 전에는 landing이 정적 매핑(store-coupon-overrides)으로
 * fallback 해왔다 — 배포 후 정적 매핑은 제거 예정.
 */
@ApiTags('Public Coupon Policies')
@Controller('api/customer/stores/:storeId/coupon-policies')
export class PublicCouponPoliciesController {
  constructor(private readonly couponPolicyService: CouponPolicyService) {}

  @Get()
  @ApiOperation({
    summary: '(공개) 매장이 발급 중인 쿠폰 정책 목록',
    description:
      '해당 매장이 활성화한 매장 혜택 쿠폰 정책을 인증 없이 조회합니다. ' +
      '결제 할인 정책은 노출하지 않습니다.',
  })
  @ApiOkResponse({ type: [CouponPolicyResponseDto] })
  listPublicPolicies(@Param('storeId') storeId: string) {
    return this.couponPolicyService.listPublicPolicies(storeId);
  }
}
