import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RefreshAccessTokenResponseDto } from '../auth/dto/auth-response.dto';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import { RefreshTokenDto } from '../auth/dto/refresh-token.dto';
import { AuthThrottlerGuard } from '../auth/guards/auth-throttler.guard';
import { AdminAuthService } from './admin-auth.service';
import { CurrentAdminId } from './decorators/current-admin.decorator';
import {
  AdminAuthTokenResponseDto,
  AdminInfoDto,
  AdminLoginDto,
  AdminMessageResponseDto,
} from './dto/admin-auth.dto';
import { AdminAuthGuard } from './guards/admin-auth.guard';

@ApiTags('Admin Auth')
@UseGuards(AuthThrottlerGuard)
@Controller('api/admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '관리자 계정으로 로그인합니다.' })
  @ApiOkResponse({ type: AdminAuthTokenResponseDto })
  login(@Body() dto: AdminLoginDto) {
    return this.adminAuthService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '관리자 Access Token을 재발급합니다.' })
  @ApiOkResponse({ type: RefreshAccessTokenResponseDto })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.adminAuthService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '관리자 Refresh Token을 폐기합니다.' })
  @ApiOkResponse({ type: AdminMessageResponseDto })
  logout(@Body() dto: RefreshTokenDto) {
    return this.adminAuthService.logout(dto);
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '로그인한 관리자 정보를 조회합니다.' })
  @ApiOkResponse({ type: AdminInfoDto })
  getMe(@CurrentAdminId() adminId: string) {
    return this.adminAuthService.getMe(adminId);
  }

  @Patch('password')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '관리자 비밀번호를 변경합니다. 기존 세션은 모두 무효화됩니다.',
  })
  @ApiOkResponse({ type: AdminMessageResponseDto })
  changePassword(
    @CurrentAdminId() adminId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.adminAuthService.changePassword(adminId, dto);
  }
}
