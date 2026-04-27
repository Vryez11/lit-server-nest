import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CurrentCustomer,
  CurrentCustomerId,
} from '../auth/decorators/current-customer.decorator';
import { AuthThrottlerGuard } from '../auth/guards/auth-throttler.guard';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import type { AuthenticatedCustomer } from '../auth/guards/customer-auth.guard';
import { CustomerAuthService } from './customer-auth.service';
import {
  CustomerAuthResponseDto,
  CustomerLogoutDto,
  CustomerMeResponseDto,
  CustomerMessageResponseDto,
  CustomerNotificationSettingsResponseDto,
  CustomerRefreshTokenDto,
  CustomerRefreshTokenResponseDto,
  CustomerSignupDto,
  CustomerSocialLoginDto,
  UpdateCustomerMeDto,
  UpdateCustomerNotificationSettingsDto,
} from './dto/customer-auth.dto';

@ApiTags('Customer Auth')
@Controller('api/customer/auth')
export class CustomerAuthController {
  constructor(private readonly customerAuthService: CustomerAuthService) {}

  @Post('social-login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: '고객 소셜 로그인 또는 최초 계정 생성을 처리합니다.',
  })
  @ApiOkResponse({ type: CustomerAuthResponseDto })
  socialLogin(@Body() dto: CustomerSocialLoginDto) {
    return this.customerAuthService.socialLogin(dto);
  }

  @Post('signup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthThrottlerGuard, CustomerAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: '고객 추가 가입 정보를 저장합니다.' })
  @ApiOkResponse({ type: CustomerAuthResponseDto })
  signup(
    @CurrentCustomerId() customerId: string,
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: CustomerSignupDto,
  ) {
    return this.customerAuthService.signupCustomer(
      customerId,
      customer.provider,
      dto,
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: '고객 access/refresh token을 재발급합니다.' })
  @ApiOkResponse({ type: CustomerRefreshTokenResponseDto })
  refresh(@Body() dto: CustomerRefreshTokenDto) {
    return this.customerAuthService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '고객 refresh token을 폐기합니다.' })
  @ApiOkResponse({ type: CustomerMessageResponseDto })
  logout(@Body() dto: CustomerLogoutDto) {
    return this.customerAuthService.logout(dto);
  }

  @Delete('withdraw')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '고객 계정을 탈퇴 처리합니다.' })
  @ApiOkResponse({ type: CustomerMessageResponseDto })
  withdraw(@CurrentCustomerId() customerId: string) {
    return this.customerAuthService.withdraw(customerId);
  }

  @Get('me')
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '고객 내 정보를 조회합니다.' })
  @ApiOkResponse({ type: CustomerMeResponseDto })
  getMe(@CurrentCustomerId() customerId: string) {
    return this.customerAuthService.getMe(customerId);
  }

  @Patch('me')
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '고객 내 정보를 수정합니다.' })
  @ApiOkResponse({ type: CustomerMeResponseDto })
  updateMe(
    @CurrentCustomerId() customerId: string,
    @Body() dto: UpdateCustomerMeDto,
  ) {
    return this.customerAuthService.updateMe(customerId, dto);
  }

  @Get('notification-settings')
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '고객 알림 설정을 조회합니다.' })
  @ApiOkResponse({ type: CustomerNotificationSettingsResponseDto })
  getNotificationSettings(@CurrentCustomerId() customerId: string) {
    return this.customerAuthService.getNotificationSettings(customerId);
  }

  @Put('notification-settings')
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '고객 알림 설정을 수정합니다.' })
  @ApiOkResponse({ type: CustomerNotificationSettingsResponseDto })
  updateNotificationSettings(
    @CurrentCustomerId() customerId: string,
    @Body() dto: UpdateCustomerNotificationSettingsDto,
  ) {
    return this.customerAuthService.updateNotificationSettings(customerId, dto);
  }
}
