import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/database/prisma.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { AdminStoresController } from './admin-stores.controller';
import { AdminStoreMetricsService } from './services/admin-store-metrics.service';
import { AdminStoreReservationsService } from './services/admin-store-reservations.service';
import { AdminStoreService } from './services/admin-store.service';
import { AdminStoreTimeseriesService } from './services/admin-store-timeseries.service';

/**
 * F-018 관리자 매장 운영 현황. AdminAuthGuard는 AdminAuthModule에서,
 * AuthThrottlerGuard는 AuthModule에서 가져온다.
 */
@Module({
  imports: [PrismaModule, AuthModule, AdminAuthModule],
  controllers: [AdminStoresController],
  providers: [
    AdminStoreService,
    AdminStoreMetricsService,
    AdminStoreTimeseriesService,
    AdminStoreReservationsService,
  ],
})
export class AdminModule {}
