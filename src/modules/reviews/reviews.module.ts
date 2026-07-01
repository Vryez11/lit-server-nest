import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GuestReviewsController } from './guest-reviews.controller';
import { GuestReviewService } from './services/guest-review.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [GuestReviewsController],
  providers: [GuestReviewService],
})
export class ReviewsModule {}
