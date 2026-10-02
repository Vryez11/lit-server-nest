import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AuthThrottlerGuard } from '../auth/guards/auth-throttler.guard';
import {
  AdminFeedbackDto,
  AdminFeedbackListQueryDto,
  AdminFeedbackListResponseDto,
  UpdateFeedbackDto,
} from './dto/feedback.dto';
import { FeedbacksService } from './services/feedbacks.service';

@ApiTags('Admin Feedbacks')
@ApiBearerAuth()
@UseGuards(AuthThrottlerGuard, AdminAuthGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('api/admin/feedbacks')
export class AdminFeedbacksController {
  constructor(private readonly feedbacksService: FeedbacksService) {}

  @Get()
  @ApiOperation({ summary: '운영자 피드백 목록을 조회합니다.' })
  @ApiOkResponse({ type: AdminFeedbackListResponseDto })
  listFeedbacks(@Query() query: AdminFeedbackListQueryDto) {
    return this.feedbacksService.listAdmin(query);
  }

  @Patch(':id')
  @ApiOperation({ summary: '운영자 피드백 상태와 응답을 수정합니다.' })
  @ApiOkResponse({ type: AdminFeedbackDto })
  updateFeedback(@Param('id') id: string, @Body() dto: UpdateFeedbackDto) {
    return this.feedbacksService.updateAdmin(id, dto);
  }
}
