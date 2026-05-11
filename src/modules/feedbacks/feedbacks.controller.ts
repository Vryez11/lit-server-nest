import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import {
  CreateFeedbackDto,
  CreateFeedbackResponseDto,
} from './dto/feedback.dto';
import { FeedbackThrottlerGuard } from './guards/feedback-throttler.guard';
import { FeedbacksService } from './services/feedbacks.service';

@ApiTags('Customer Feedbacks')
@Controller('api/customer/feedbacks')
export class FeedbacksController {
  constructor(private readonly feedbacksService: FeedbacksService) {}

  @Post()
  @UseGuards(FeedbackThrottlerGuard)
  @Throttle({ default: { limit: 1, ttl: 30_000 } })
  @ApiOperation({ summary: '사용자 의견을 생성합니다.' })
  @ApiCreatedResponse({ type: CreateFeedbackResponseDto })
  createFeedback(@Body() dto: CreateFeedbackDto, @Req() request: Request) {
    return this.feedbacksService.createFeedback(dto, getClientIp(request));
  }
}

const getClientIp = (request: Request): string => {
  const forwardedFor = request.header('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  return request.ip || request.socket.remoteAddress || 'unknown';
};
