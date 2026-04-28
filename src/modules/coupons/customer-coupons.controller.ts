import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCustomerId } from '../auth/decorators/current-customer.decorator';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import {
  ClaimCouponDto,
  CouponListResponseDto,
  CouponResponseDto,
  CouponStatsResponseDto,
  ListCouponsQueryDto,
  RedeemStoreBenefitCouponDto,
} from './dto/coupon.dto';
import { CustomerCouponService } from './services/customer-coupon.service';

@ApiTags('Customer Coupons')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('api/customer/coupons')
export class CustomerCouponsController {
  constructor(private readonly customerCouponService: CustomerCouponService) {}

  @Post('claim')
  @ApiOperation({
    summary: '고객이 manual_claim 쿠폰 정책으로 쿠폰을 발급받습니다.',
  })
  @ApiCreatedResponse({ type: CouponResponseDto })
  claimCoupon(
    @CurrentCustomerId() customerId: string,
    @Body() dto: ClaimCouponDto,
  ) {
    return this.customerCouponService.claimCoupon(customerId, dto);
  }

  @Get()
  @ApiOperation({ summary: '고객의 쿠폰 목록을 조회합니다.' })
  @ApiOkResponse({ type: CouponListResponseDto })
  listCoupons(
    @CurrentCustomerId() customerId: string,
    @Query() query: ListCouponsQueryDto,
  ) {
    return this.customerCouponService.listCoupons(customerId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: '고객의 쿠폰 상태별 통계를 조회합니다.' })
  @ApiOkResponse({ type: CouponStatsResponseDto })
  getStats(@CurrentCustomerId() customerId: string) {
    return this.customerCouponService.getStats(customerId);
  }

  @Get(':id')
  @ApiOperation({ summary: '고객의 쿠폰 상세를 조회합니다.' })
  @ApiOkResponse({ type: CouponResponseDto })
  getCoupon(
    @CurrentCustomerId() customerId: string,
    @Param('id') couponId: string,
  ) {
    return this.customerCouponService.getCoupon(customerId, couponId);
  }

  @Post(':id/redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '매장 PIN으로 매장 혜택 쿠폰을 사용 처리합니다.' })
  @ApiOkResponse({ type: CouponResponseDto })
  redeemCoupon(
    @CurrentCustomerId() customerId: string,
    @Param('id') couponId: string,
    @Body() dto: RedeemStoreBenefitCouponDto,
  ) {
    return this.customerCouponService.redeemStoreBenefitCoupon(
      customerId,
      couponId,
      dto,
    );
  }

  @Post(':id/use')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '기존 Express 호환 사용 처리 API입니다. storePin이 필수입니다.',
  })
  @ApiOkResponse({ type: CouponResponseDto })
  useCoupon(
    @CurrentCustomerId() customerId: string,
    @Param('id') couponId: string,
    @Body() dto: RedeemStoreBenefitCouponDto,
  ) {
    return this.customerCouponService.redeemStoreBenefitCoupon(
      customerId,
      couponId,
      dto,
    );
  }
}
