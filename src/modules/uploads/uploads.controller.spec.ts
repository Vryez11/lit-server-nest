/* eslint-disable @typescript-eslint/unbound-method */

import { AuthThrottlerGuard } from '../auth/guards/auth-throttler.guard';
import { UploadsController } from './uploads.controller';

describe('UploadsController', () => {
  it('rate-limits the unauthenticated guest presign endpoint', () => {
    const guards = (Reflect.getMetadata(
      '__guards__',
      UploadsController.prototype.presignForGuest,
    ) ?? []) as unknown[];

    expect(guards).toContain(AuthThrottlerGuard);
  });
});
