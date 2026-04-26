import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCustomerId } from '../auth/decorators/current-customer.decorator';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import {
  CreateCustomerReservationDto,
  ListCustomerReservationsQueryDto,
  ReservationListResponseDto,
  ReservationResponseDto,
  ReservationStatusResponseDto,
} from './dto/reservation.dto';
import { ReservationCommandService } from './services/reservation-command.service';
import { ReservationQueryService } from './services/reservation-query.service';

@ApiTags('Customer Reservations')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('api/customer/reservations')
export class CustomerReservationsController {
  constructor(
    private readonly reservationQueryService: ReservationQueryService,
    private readonly reservationCommandService: ReservationCommandService,
  ) {}

  @Put(':id/checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '로그인 고객의 예약을 체크아웃 완료 처리합니다.' })
  @ApiOkResponse({ type: ReservationStatusResponseDto })
  checkoutReservation(
    @CurrentCustomerId() customerId: string,
    @Param('id') id: string,
  ) {
    return this.reservationCommandService.customerCheckout(customerId, id);
  }

  @Get()
  @ApiOperation({ summary: '로그인 고객의 예약 목록을 조회합니다.' })
  @ApiOkResponse({ type: ReservationListResponseDto })
  getReservations(
    @CurrentCustomerId() customerId: string,
    @Query() query: ListCustomerReservationsQueryDto,
  ) {
    return this.reservationQueryService.listCustomerReservations(
      customerId,
      query,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '로그인 고객의 예약 상세를 조회합니다.' })
  @ApiOkResponse({ type: ReservationResponseDto })
  getReservation(
    @CurrentCustomerId() customerId: string,
    @Param('id') id: string,
  ) {
    return this.reservationQueryService.getCustomerReservation(customerId, id);
  }

  @Post()
  @ApiOperation({ summary: '로그인 고객 예약을 생성합니다.' })
  @ApiCreatedResponse({ type: ReservationResponseDto })
  createReservation(
    @CurrentCustomerId() customerId: string,
    @Body() dto: CreateCustomerReservationDto,
  ) {
    return this.reservationCommandService.createCustomerReservation(
      customerId,
      dto,
    );
  }
}
