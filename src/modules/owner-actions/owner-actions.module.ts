import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { OwnerActionsController } from './owner-actions.controller';
import { OwnerActionsService } from './owner-actions.service';

@Module({
  imports: [AuthModule, NotificationsModule, ReservationsModule],
  controllers: [OwnerActionsController],
  providers: [OwnerActionsService],
})
export class OwnerActionsModule {}
