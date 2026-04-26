import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardQueryService } from './services/dashboard-query.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardQueryService],
})
export class DashboardModule {}
