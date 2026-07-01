import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GuestReviewsController } from './guest-reviews.controller';
import { StoreReviewsController } from './store-reviews.controller';
import { GuestReviewService } from './services/guest-review.service';
import { StoreReviewService } from './services/store-review.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [GuestReviewsController, StoreReviewsController],
  providers: [GuestReviewService, StoreReviewService],
})
export class ReviewsModule {}
