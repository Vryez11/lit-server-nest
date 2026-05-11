import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

@Injectable()
export class FeedbackThrottlerGuard extends ThrottlerGuard {
  protected throwThrottlingException(
    _context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new HttpException(
      {
        code: 'RATE_LIMITED',
        message: '잠시 후 다시 시도해주세요.',
        details: {
          retryAfter: Math.ceil(throttlerLimitDetail.ttl / 1000),
          limit: throttlerLimitDetail.limit,
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
