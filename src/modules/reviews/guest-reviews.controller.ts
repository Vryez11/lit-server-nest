import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthThrottlerGuard } from '../auth/guards/auth-throttler.guard';
import {
  CreateGuestReviewDto,
  GuestReviewResponseDto,
} from './dto/guest-review.dto';
import { GuestReviewService } from './services/guest-review.service';

@ApiTags('Guest Reviews')
@UseGuards(AuthThrottlerGuard)
@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Controller('api/guest/reviews')
export class GuestReviewsController {
  constructor(private readonly guestReviewService: GuestReviewService) {}

  @Post()
  @ApiOperation({
    summary: '비회원 리뷰 작성 (체크아웃 확인된 예약 + 토큰 필요)',
  })
  @ApiCreatedResponse({ type: GuestReviewResponseDto })
  createReview(@Body() dto: CreateGuestReviewDto) {
    return this.guestReviewService.createReview(dto);
  }
}
