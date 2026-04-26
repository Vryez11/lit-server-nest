import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomerReservationsController } from './customer-reservations.controller';
import { ReservationsController } from './reservations.controller';
import { ReservationCommandService } from './services/reservation-command.service';
import { ReservationQueryService } from './services/reservation-query.service';
import { ReservationStatusService } from './services/reservation-status.service';
import { ReservationStorageService } from './services/reservation-storage.service';

@Module({
  imports: [AuthModule],
  controllers: [ReservationsController, CustomerReservationsController],
  providers: [
    ReservationQueryService,
    ReservationCommandService,
    ReservationStatusService,
    ReservationStorageService,
  ],
})
export class ReservationsModule {}
