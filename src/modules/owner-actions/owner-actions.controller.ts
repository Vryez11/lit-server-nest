import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthThrottlerGuard } from '../auth/guards/auth-throttler.guard';
import {
  OwnerActionResultDto,
  OwnerReservationSummaryDto,
} from './dto/owner-action.dto';
import { OwnerActionTokenGuard } from './guards/owner-action-token.guard';
import { OwnerActionsService } from './owner-actions.service';

@ApiTags('Owner Actions')
@UseGuards(AuthThrottlerGuard, OwnerActionTokenGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('api/owner-actions/reservations')
export class OwnerActionsController {
  constructor(private readonly ownerActionsService: OwnerActionsService) {}

  @Get(':id')
  @ApiOperation({ summary: '점주 액션 페이지용 예약 요약 (HMAC 토큰 필요)' })
  @ApiOkResponse({ type: OwnerReservationSummaryDto })
  getSummary(@Param('id') id: string) {
    return this.ownerActionsService.getSummary(id);
  }

  @Post(':id/check-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '체크인 — confirmed → in_progress' })
  @ApiOkResponse({ type: OwnerActionResultDto })
  checkIn(@Param('id') id: string) {
    return this.ownerActionsService.checkIn(id);
  }

  @Post(':id/check-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '체크아웃 — completed + 리뷰 요청 발송' })
  @ApiOkResponse({ type: OwnerActionResultDto })
  checkOut(@Param('id') id: string) {
    return this.ownerActionsService.checkOut(id);
  }

  @Post(':id/no-show')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '노쇼 처리 — start_time 경과 후에만' })
  @ApiOkResponse({ type: OwnerActionResultDto })
  noShow(@Param('id') id: string) {
    return this.ownerActionsService.noShow(id);
  }
}
