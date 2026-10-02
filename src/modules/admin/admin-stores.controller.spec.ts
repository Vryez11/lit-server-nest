import { PATH_METADATA } from '@nestjs/common/constants';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AuthThrottlerGuard } from '../auth/guards/auth-throttler.guard';
import { AdminStoresController } from './admin-stores.controller';

describe('AdminStoresController', () => {
  it('is protected by the throttler and admin JWT guard, in that order', () => {
    const guards = (Reflect.getMetadata('__guards__', AdminStoresController) ??
      []) as unknown[];

    expect(guards).toEqual([AuthThrottlerGuard, AdminAuthGuard]);
  });

  it('declares the static platform timeseries route before any :storeId route', () => {
    const handlerNames = Object.getOwnPropertyNames(
      AdminStoresController.prototype,
    ).filter((name) => name !== 'constructor');
    const paths = handlerNames.map(
      (name) =>
        Reflect.getMetadata(
          PATH_METADATA,
          AdminStoresController.prototype[name as keyof AdminStoresController],
        ) as string,
    );
    const staticIndex = paths.indexOf('timeseries');
    const firstParamIndex = paths.findIndex((path) => path.startsWith(':'));

    expect(staticIndex).toBeGreaterThanOrEqual(0);
    expect(firstParamIndex).toBeGreaterThan(staticIndex);
    expect(paths).toEqual([
      '/',
      'timeseries',
      ':storeId/summary',
      ':storeId/timeseries',
      ':storeId/reservations',
    ]);
  });
});
