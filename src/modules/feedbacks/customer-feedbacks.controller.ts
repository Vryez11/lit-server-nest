import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  FeedbackWallQueryDto,
  FeedbackWallResponseDto,
} from './dto/feedback.dto';
import { FeedbacksService } from './services/feedbacks.service';

@ApiTags('Customer Feedbacks')
@Controller('api/customer/feedbacks')
export class CustomerFeedbacksController {
  constructor(private readonly feedbacksService: FeedbacksService) {}

  @Get('wall')
  @ApiOperation({ summary: '공개 승인된 피드백 목록을 조회합니다.' })
  @ApiOkResponse({ type: FeedbackWallResponseDto })
  listWall(@Query() query: FeedbackWallQueryDto) {
    return this.feedbacksService.listWall(query);
  }
}
