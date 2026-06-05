import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  payments_status,
  Prisma,
  reservations_payment_status,
  reservations_requested_storage_type,
  reservations_status,
} from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../auth/services/mail.service';
import {
  CancelGuestReservationDto,
  CleanupExpiredGuestReservationsResponseDto,
  CreateGuestReservationDto,
  CreateGuestReservationResponseDto,
  GetGuestReservationQueryDto,
  GuestAvailabilityQueryDto,
  GuestAvailabilityResponseDto,
  GuestReservationCancelResponseDto,
  GuestReservationListResponseDto,
  GuestReservationResponseDto,
  ListGuestReservationsQueryDto,
} from '../dto/guest-reservation.dto';
import {
  toGuestReservationResponse,
  toGuestStoreName,
} from '../mappers/guest-reservation.mapper';
import {
  normalizeStorageAssignmentType,
} from '../pricing/reservation-pricing.constants';
import { ReservationPricingService } from '../pricing/reservation-pricing.service';
import { ReservationStorageService } from './reservation-storage.service';

const ALLOWED_STORAGE_TYPES = Object.values(
  reservations_requested_storage_type,
);
const RESERVATION_TTL_MINUTES = 30;
const GUEST_CANCEL_STATUSES: reservations_status[] = [
  reservations_status.pending,
  reservations_status.pending_approval,
  reservations_status.confirmed,
];
const CAPACITY_COUNT_STATUSES: reservations_status[] = [
  reservations_status.pending,
  reservations_status.pending_approval,
  reservations_status.confirmed,
  reservations_status.in_progress,
];

type CapacityResult = {
  available: boolean;
  maxCapacity: number;
  currentCount: number;
};

@Injectable()
export class GuestReservationService {
  private readonly logger = new Logger(GuestReservationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reservationStorageService: ReservationStorageService,
    private readonly reservationPricingService: ReservationPricingService,
    private readonly mailService: MailService,
  ) {}

  async createReservation(
    dto: CreateGuestReservationDto,
  ): Promise<CreateGuestReservationResponseDto> {
    const storageType = normalizeStorageAssignmentType(
      dto.storageType ??
        dto.requestedStorageType ??
        reservations_requested_storage_type.s,
    );
    const contact = this.resolveCreateContact(dto);
    const { phoneNumber, email } = contact;

    const store = await this.resolveStore(dto.storeId);
    const startTime = new Date(dto.startTime);
    const endTime = dto.endTime
      ? new Date(dto.endTime)
      : this.addHours(startTime, dto.duration);

    this.assertValidTimeRange(startTime, endTime);

    const capacity = await this.checkCapacity({
      storeId: store.id,
      storageType,
      startTime,
      endTime,
      bagCount: dto.bagCount,
    });

    if (!capacity.available) {
      throw new ConflictException({
        code: 'CAPACITY_EXCEEDED',
        message: '해당 시간대에 수용 가능한 공간이 부족합니다.',
        details: {
          maxCapacity: capacity.maxCapacity,
          currentCount: capacity.currentCount,
          requested: dto.bagCount,
        },
      });
    }

    const reservationId = `res_${randomUUID()}`;
    const customerId = `guest_${phoneNumber}_${Date.now()}`;
    const accessToken = this.generateAccessToken();
    const paymentKey = dto.paymentKey ?? dto.payment_key;
    const orderId = dto.orderId ?? dto.order_id;
    const totalAmount = this.reservationPricingService.calculateTotalAmount({
      storageType,
      bagCount: dto.bagCount,
      startTime,
      endTime,
    });

    await this.prisma.$transaction(async (tx) => {
      const latestCapacity = await this.checkCapacity(
        {
          storeId: store.id,
          storageType,
          startTime,
          endTime,
          bagCount: dto.bagCount,
        },
        tx,
      );

      if (!latestCapacity.available) {
        throw new ConflictException({
          code: 'CAPACITY_EXCEEDED',
          message: '해당 시간대에 수용 가능한 공간이 부족합니다.',
          details: {
            maxCapacity: latestCapacity.maxCapacity,
            currentCount: latestCapacity.currentCount,
            requested: dto.bagCount,
          },
        });
      }

      const payment = await this.findVerifiedPaymentIfProvided(
        tx,
        paymentKey,
        orderId,
      );

      await tx.reservations.create({
        data: {
          id: reservationId,
          store_id: store.id,
          customer_id: customerId,
          customer_name: dto.customerName,
          customer_phone: phoneNumber,
          customer_email: email,
          requested_storage_type: storageType,
          status: reservations_status.pending,
          start_time: startTime,
          end_time: endTime,
          request_time: new Date(),
          duration: dto.duration,
          bag_count: dto.bagCount,
          total_amount: totalAmount,
          message: dto.message ?? null,
          special_requests: null,
          luggage_image_urls: Prisma.JsonNull,
          payment_status: payment
            ? reservations_payment_status.paid
            : reservations_payment_status.pending,
          payment_method: 'card',
          payment_id: payment?.id ?? null,
          qr_code: accessToken,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      if (payment) {
        const result = await tx.payments.updateMany({
          where: {
            id: payment.id,
            reservation_id: null,
          },
          data: {
            reservation_id: reservationId,
            updated_at: new Date(),
          },
        });

        if (result.count !== 1) {
          throw new ConflictException({
            code: 'PAYMENT_ALREADY_USED',
            message: '이 결제는 이미 다른 예약에 사용되었습니다.',
          });
        }
      }
    });

    const reservation = await this.getGuestReservationByIdOrThrow(
      reservationId,
      true,
    );

    await this.sendReservationCreatedEmailSafely(reservation);

    return {
      reservation,
      storeName: toGuestStoreName(store),
    };
  }

  async listReservations(
    query: ListGuestReservationsQueryDto,
  ): Promise<GuestReservationListResponseDto> {
    const contact = this.resolveListContact(query);

    const reservations = await this.prisma.reservations.findMany({
      where: contact.email
        ? {
            OR: [
              { customer_email: contact.email },
              { customer_phone: contact.email },
            ],
          }
        : { customer_phone: contact.phoneNumber },
      orderBy: { created_at: 'desc' },
      include: this.guestStoreInclude(),
    });

    const items = reservations.map((reservation) =>
      toGuestReservationResponse(reservation),
    );

    return {
      items,
      total: items.length,
    };
  }

  async getReservation(
    reservationId: string,
    query: GetGuestReservationQueryDto,
  ): Promise<GuestReservationResponseDto> {
    if (!query.token) {
      throw new UnauthorizedException({
        code: 'TOKEN_REQUIRED',
        message: '예약 조회에는 토큰이 필요합니다.',
      });
    }

    const reservation = await this.prisma.reservations.findFirst({
      where: {
        id: reservationId,
        qr_code: query.token,
      },
      include: this.guestStoreInclude(),
    });

    if (!reservation) {
      throw this.reservationNotFound();
    }

    return toGuestReservationResponse(reservation);
  }

  async cleanupExpiredReservations(): Promise<CleanupExpiredGuestReservationsResponseDto> {
    const cutoff = new Date(Date.now() - RESERVATION_TTL_MINUTES * 60 * 1000);
    const result = await this.prisma.reservations.updateMany({
      where: {
        status: reservations_status.pending,
        payment_status: reservations_payment_status.pending,
        customer_id: { startsWith: 'guest_' },
        created_at: { lt: cutoff },
      },
      data: {
        status: reservations_status.cancelled,
        updated_at: new Date(),
      },
    });

    return {
      cancelledCount: result.count,
      ttlMinutes: RESERVATION_TTL_MINUTES,
    };
  }

  async cancelReservation(
    reservationId: string,
    dto: CancelGuestReservationDto,
  ): Promise<GuestReservationCancelResponseDto> {
    const contact = this.resolveCancelContact(dto);

    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.reservations.findFirst({
        where: { id: reservationId },
      });

      if (!reservation) {
        throw this.reservationNotFound();
      }

      if (!this.matchesGuestContact(reservation, contact)) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: '본인 예약만 취소할 수 있습니다.',
        });
      }

      if (
        !reservation.status ||
        !GUEST_CANCEL_STATUSES.includes(reservation.status)
      ) {
        throw new ConflictException({
          code: 'NOT_CANCELLABLE',
          message: '현재 상태에서는 취소할 수 없습니다.',
          details: { currentStatus: reservation.status },
        });
      }

      if (reservation.start_time.getTime() <= Date.now()) {
        throw new ConflictException({
          code: 'TOO_LATE_TO_CANCEL',
          message: '이미 시작된 예약은 취소할 수 없습니다.',
          details: { startTime: reservation.start_time },
        });
      }

      await tx.reservations.update({
        where: { id: reservation.id },
        data: {
          status: reservations_status.cancelled,
          updated_at: new Date(),
        },
      });

      await this.reservationStorageService.releaseStorageIfAny(
        tx,
        reservation.storage_id,
      );

      return {
        id: reservation.id,
        status: reservations_status.cancelled,
      };
    });
  }

  async getAvailability(
    query: GuestAvailabilityQueryDto,
  ): Promise<GuestAvailabilityResponseDto> {
    const store = await this.resolveStore(query.storeId);
    const startTime = new Date(query.startTime);
    const endTime = this.addHours(startTime, query.duration);

    this.assertValidTimeRange(startTime, endTime);

    // 설정은 한 번만 조회하고, 예약 수량은 storage type 기준으로 한 번에 집계합니다.
    const [settings, aggregated] = await Promise.all([
      this.prisma.store_settings.findUnique({
        where: { store_id: store.id },
      }),
      this.prisma.reservations.groupBy({
        by: ['requested_storage_type'],
        where: {
          store_id: store.id,
          requested_storage_type: { in: ALLOWED_STORAGE_TYPES },
          status: { in: CAPACITY_COUNT_STATUSES },
          payment_status: { not: reservations_payment_status.refunded },
          start_time: { lt: endTime },
          end_time: { gt: startTime },
        },
        _sum: { bag_count: true },
      }),
    ]);
    const countByType = new Map<reservations_requested_storage_type, number>();

    for (const row of aggregated) {
      if (row.requested_storage_type) {
        countByType.set(row.requested_storage_type, row._sum.bag_count ?? 0);
      }
    }

    const items: GuestAvailabilityResponseDto['items'] = {};

    for (const storageType of ALLOWED_STORAGE_TYPES) {
      const maxCapacity = this.getMaxCapacity(settings, storageType);
      const currentCount = countByType.get(storageType) ?? 0;

      items[storageType] = {
        maxCapacity,
        currentCount,
        remaining: Math.max(0, maxCapacity - currentCount),
      };
    }

    return {
      storeId: query.storeId,
      startTime: query.startTime,
      endTime: endTime.toISOString(),
      duration: query.duration,
      items,
    };
  }

  normalizePhone(phone?: string | null): string {
    return String(phone ?? '').replace(/[-\s]/g, '');
  }

  private normalizeEmail(email?: string | null): string {
    return String(email ?? '').trim().toLowerCase();
  }

  private isEmailAddress(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  private resolveCreateContact(dto: CreateGuestReservationDto): {
    phoneNumber: string;
    email: string | null;
  } {
    const rawPhone = String(dto.phoneNumber ?? '').trim();
    const explicitEmail = this.normalizeEmail(
      dto.email ?? dto.customerEmail ?? null,
    );

    if (this.isEmailAddress(rawPhone)) {
      const email = explicitEmail || this.normalizeEmail(rawPhone);
      this.assertValidEmail(email);
      return { phoneNumber: email, email };
    }

    const phoneNumber = this.normalizePhone(rawPhone);
    this.assertValidPhone(phoneNumber);
    return { phoneNumber, email: explicitEmail || null };
  }

  private resolveListContact(query: ListGuestReservationsQueryDto): {
    phoneNumber?: string;
    email?: string;
  } {
    const email = this.normalizeEmail(query.email);
    if (email) {
      this.assertValidEmail(email);
      return { email };
    }

    const phoneNumber = this.normalizePhone(
      query.phoneNumber ?? query.customer_phone,
    );
    if (!phoneNumber) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '전화번호 또는 이메일이 필요합니다.',
        details: { required: ['phoneNumber', 'email'] },
      });
    }

    if (this.isEmailAddress(phoneNumber)) {
      this.assertValidEmail(phoneNumber);
      return { email: this.normalizeEmail(phoneNumber) };
    }

    this.assertValidPhone(phoneNumber);
    return { phoneNumber };
  }

  private resolveCancelContact(dto: CancelGuestReservationDto): {
    phoneNumber?: string;
    email?: string;
  } {
    const email = this.normalizeEmail(dto.email);
    if (email) {
      this.assertValidEmail(email);
      return { email };
    }

    const rawPhone = String(dto.phoneNumber ?? '').trim();
    if (!rawPhone) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '전화번호 또는 이메일이 필요합니다.',
        details: { required: ['phoneNumber', 'email'] },
      });
    }

    if (this.isEmailAddress(rawPhone)) {
      this.assertValidEmail(rawPhone);
      return { email: this.normalizeEmail(rawPhone) };
    }

    const phoneNumber = this.normalizePhone(rawPhone);
    this.assertValidPhone(phoneNumber);
    return { phoneNumber };
  }

  private matchesGuestContact(
    reservation: {
      customer_phone: string | null;
      customer_email: string | null;
    },
    contact: { phoneNumber?: string; email?: string },
  ): boolean {
    if (contact.email) {
      const normalized = contact.email;
      const reservationEmail = this.normalizeEmail(reservation.customer_email);
      const reservationPhone = String(reservation.customer_phone ?? '').trim();
      return (
        reservationEmail === normalized ||
        reservationPhone.toLowerCase() === normalized
      );
    }

    return (
      this.normalizePhone(reservation.customer_phone) === contact.phoneNumber
    );
  }

  private assertValidEmail(email: string): void {
    if (!this.isEmailAddress(email)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '올바른 이메일을 입력해주세요.',
      });
    }
  }

  private async resolveStore(idOrSlug: string) {
    const store = await this.prisma.stores.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      select: {
        id: true,
        business_name: true,
      },
    });

    if (!store) {
      throw new NotFoundException({
        code: 'STORE_NOT_FOUND',
        message: '매장을 찾을 수 없습니다.',
      });
    }

    return store;
  }

  private async checkCapacity(
    params: {
      storeId: string;
      storageType: reservations_requested_storage_type;
      startTime: Date;
      endTime: Date;
      bagCount: number;
    },
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<CapacityResult> {
    const [settings, result] = await Promise.all([
      client.store_settings.findUnique({
        where: { store_id: params.storeId },
      }),
      client.reservations.aggregate({
        where: {
          store_id: params.storeId,
          requested_storage_type: params.storageType,
          status: { in: CAPACITY_COUNT_STATUSES },
          payment_status: { not: reservations_payment_status.refunded },
          start_time: { lt: params.endTime },
          end_time: { gt: params.startTime },
        },
        _sum: { bag_count: true },
      }),
    ]);
    const maxCapacity = this.getMaxCapacity(settings, params.storageType);
    const currentCount = result._sum.bag_count ?? 0;

    return {
      available: currentCount + params.bagCount <= maxCapacity,
      maxCapacity,
      currentCount,
    };
  }

  private getMaxCapacity(
    settings: Awaited<
      ReturnType<PrismaService['store_settings']['findUnique']>
    >,
    storageType: reservations_requested_storage_type,
  ): number {
    if (!settings) {
      return 5;
    }

    const billingType = normalizeStorageAssignmentType(storageType);
    const capacityMap: Record<
      reservations_requested_storage_type,
      number | null | undefined
    > = {
      [reservations_requested_storage_type.s]: settings.m_max_capacity,
      [reservations_requested_storage_type.m]: settings.l_max_capacity,
      [reservations_requested_storage_type.l]: settings.xl_max_capacity,
      [reservations_requested_storage_type.xl]: settings.xl_max_capacity,
      [reservations_requested_storage_type.special]: settings.xl_max_capacity,
      [reservations_requested_storage_type.refrigeration]:
        settings.refrigeration_max_capacity,
    };

    return capacityMap[billingType] ?? 5;
  }

  private async findVerifiedPaymentIfProvided(
    tx: Prisma.TransactionClient,
    paymentKey?: string,
    orderId?: string,
  ) {
    if (!paymentKey && !orderId) {
      return null;
    }

    if (!paymentKey || !orderId) {
      throw new BadRequestException({
        code: 'PAYMENT_INFO_INCOMPLETE',
        message: 'paymentKey와 orderId를 함께 전달해야 합니다.',
      });
    }

    const payment = await tx.payments.findFirst({
      where: {
        pg_payment_key: paymentKey,
        pg_order_id: orderId,
      },
      select: {
        id: true,
        status: true,
        reservation_id: true,
      },
    });

    if (!payment || payment.status !== payments_status.SUCCESS) {
      throw new BadRequestException({
        code: 'PAYMENT_NOT_VERIFIED',
        message: '결제가 확인되지 않았습니다. 결제 완료 후 다시 시도해주세요.',
      });
    }

    if (payment.reservation_id) {
      throw new ConflictException({
        code: 'PAYMENT_ALREADY_USED',
        message: '이 결제는 이미 다른 예약에 사용되었습니다.',
      });
    }

    return payment;
  }

  private async getGuestReservationByIdOrThrow(
    reservationId: string,
    includeAccessToken: boolean,
  ): Promise<GuestReservationResponseDto> {
    const reservation = await this.prisma.reservations.findFirst({
      where: { id: reservationId },
      include: this.guestStoreInclude(),
    });

    if (!reservation) {
      throw this.reservationNotFound();
    }

    return toGuestReservationResponse(reservation, { includeAccessToken });
  }

  private guestStoreInclude() {
    return {
      stores: {
        select: {
          business_name: true,
          address: true,
          phone_number: true,
          latitude: true,
          longitude: true,
        },
      },
    };
  }

  private generateAccessToken(): string {
    return randomBytes(16).toString('base64url');
  }

  private async sendReservationCreatedEmailSafely(
    reservation: GuestReservationResponseDto,
  ): Promise<void> {
    if (!reservation.email) {
      return;
    }

    await this.mailService
      .sendReservationCreatedEmail(reservation.email, {
        reservationId: reservation.id,
        customerName: reservation.customerName,
        storeName: reservation.storeName,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        bagCount: reservation.bagCount,
        totalAmount: reservation.totalAmount,
        accessToken: reservation.accessToken,
      })
      .catch((error: unknown) => {
        this.logger.warn({
          event: 'guest_reservation.email_failed',
          err: error,
          reservationId: reservation.id,
          storeId: reservation.storeId,
          email: reservation.email,
        });
      });
  }

  private addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
  }

  private assertValidTimeRange(startTime: Date, endTime: Date): void {
    if (
      Number.isNaN(startTime.getTime()) ||
      Number.isNaN(endTime.getTime()) ||
      endTime <= startTime
    ) {
      throw new BadRequestException({
        code: 'INVALID_RESERVATION_TIME',
        message: '예약 시간이 올바르지 않습니다.',
      });
    }
  }

  private assertValidPhone(phoneNumber: string): void {
    if (phoneNumber.length < 10 || phoneNumber.length > 15) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '올바른 전화번호를 입력해주세요.',
      });
    }
  }

  private reservationNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'RESERVATION_NOT_FOUND',
      message: '예약을 찾을 수 없습니다.',
    });
  }
}
