import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AuthThrottlerGuard } from '../auth/guards/auth-throttler.guard';
import { AdminFeedbacksController } from './admin-feedbacks.controller';

describe('AdminFeedbacksController', () => {
  it('is protected by the admin JWT guard (static X-Admin-Token removed)', () => {
    const guards = (Reflect.getMetadata(
      '__guards__',
      AdminFeedbacksController,
    ) ?? []) as unknown[];

    expect(guards).toEqual([AuthThrottlerGuard, AdminAuthGuard]);
  });
});
