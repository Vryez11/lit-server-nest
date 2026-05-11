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
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AdminFeedbackDto,
  AdminFeedbackListQueryDto,
  AdminFeedbackListResponseDto,
  UpdateFeedbackDto,
} from './dto/feedback.dto';
import { AdminFeedbackTokenGuard } from './guards/admin-feedback-token.guard';
import { FeedbacksService } from './services/feedbacks.service';

@ApiTags('Admin Feedbacks')
@ApiHeader({ name: 'X-Admin-Token', required: true })
@UseGuards(AdminFeedbackTokenGuard)
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
