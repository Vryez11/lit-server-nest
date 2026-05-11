import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../../common/database/prisma.module';
import { AdminFeedbacksController } from './admin-feedbacks.controller';
import { CustomerFeedbacksController } from './customer-feedbacks.controller';
import { FeedbacksController } from './feedbacks.controller';
import { AdminFeedbackTokenGuard } from './guards/admin-feedback-token.guard';
import { FeedbackThrottlerGuard } from './guards/feedback-throttler.guard';
import { FeedbacksService } from './services/feedbacks.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ThrottlerModule.forRoot([
      {
        ttl: 30_000,
        limit: 1,
        getTracker: (request: Record<string, unknown>) => {
          const headers = request.headers as
            | Record<string, string | string[] | undefined>
            | undefined;
          const forwardedFor = headers?.['x-forwarded-for'];

          if (Array.isArray(forwardedFor)) {
            return forwardedFor[0]?.split(',')[0]?.trim() || 'unknown';
          }

          if (typeof forwardedFor === 'string') {
            return forwardedFor.split(',')[0]?.trim() || 'unknown';
          }

          return typeof request.ip === 'string' ? request.ip : 'unknown';
        },
      },
    ]),
  ],
  controllers: [
    FeedbacksController,
    CustomerFeedbacksController,
    AdminFeedbacksController,
  ],
  providers: [
    FeedbacksService,
    FeedbackThrottlerGuard,
    AdminFeedbackTokenGuard,
  ],
})
export class FeedbacksModule {}
