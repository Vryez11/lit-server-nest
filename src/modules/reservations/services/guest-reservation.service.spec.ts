/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  payments_status,
  reservations_payment_status,
  reservations_requested_storage_type,
  reservations_status,
  storages_status,
} from '@prisma/client';
import { ReservationStorageService } from './reservation-storage.service';
import { GuestReservationService } from './guest-reservation.service';
import { ReservationPricingService } from '../pricing/reservation-pricing.service';

const createGuestReservationService = () => {
  const tx = {
    store_settings: {
      findUnique: jest.fn(),
    },
    reservations: {
      aggregate: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    payments: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    storages: {
      update: jest.fn(),
    },
  };
  const prisma = {
    stores: {
      findFirst: jest.fn(),
    },
    store_settings: {
      findUnique: jest.fn(),
    },
    reservations: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const reservationStorageService = new ReservationStorageService(
    prisma as never,
  );

  const reservationPricingService = new ReservationPricingService();
  const mailService = {
    sendReservationCreatedEmail: jest.fn().mockResolvedValue(undefined),
  };

  return {
    service: new GuestReservationService(
      prisma as never,
      reservationStorageService,
      reservationPricingService,
      mailService as never,
    ),
    prisma,
    tx,
    mailService,
  };
};

describe('GuestReservationService', () => {
  it('creates a guest reservation with normalized phone and payment link', async () => {
    const { service, prisma, tx, mailService } =
      createGuestReservationService();

    prisma.stores.findFirst.mockResolvedValue({
      id: 'store_1',
      business_name: '테스트 매장',
    });
    prisma.store_settings.findUnique.mockResolvedValue({
      m_max_capacity: 5,
    });
    prisma.reservations.aggregate.mockResolvedValue({
      _sum: { bag_count: 1 },
    });
    tx.store_settings.findUnique.mockResolvedValue({
      m_max_capacity: 5,
    });
    tx.reservations.aggregate.mockResolvedValue({
      _sum: { bag_count: 1 },
    });
    tx.payments.findFirst.mockResolvedValue({
      id: 1n,
      status: payments_status.SUCCESS,
      reservation_id: null,
    });
    tx.payments.updateMany.mockResolvedValue({ count: 1 });
    prisma.reservations.findFirst.mockResolvedValue({
      id: 'res_1',
      store_id: 'store_1',
      customer_name: '홍길동',
      customer_phone: '01012345678',
      customer_email: 'guest@example.com',
      locale: 'en',
      status: reservations_status.pending,
      start_time: new Date('2026-04-27T01:00:00.000Z'),
      end_time: new Date('2026-04-27T05:00:00.000Z'),
      duration: 4,
      bag_count: 2,
      total_amount: 9000,
      message: null,
      requested_storage_type: reservations_requested_storage_type.s,
      payment_status: reservations_payment_status.paid,
      qr_code: 'token',
      created_at: new Date('2026-04-27T00:00:00.000Z'),
      stores: {
        business_name: '테스트 매장',
        address: '서울',
        phone_number: '02-0000-0000',
        latitude: null,
        longitude: null,
      },
    });

    const result = await service.createReservation({
      storeId: 'store_1',
      customerName: '홍길동',
      phoneNumber: '010-1234-5678',
      customerEmail: 'guest@example.com',
      locale: 'en',
      startTime: '2026-04-27T10:00:00+09:00',
      duration: 4,
      bagCount: 2,
      requestedStorageType: reservations_requested_storage_type.s,
      paymentKey: 'payment_key',
      orderId: 'order_id',
    });

    expect(tx.reservations.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        store_id: 'store_1',
        customer_phone: '01012345678',
        customer_email: 'guest@example.com',
        locale: 'en',
        total_amount: 9000,
        payment_status: reservations_payment_status.paid,
        payment_id: 1n,
      }),
    });
    expect(tx.payments.updateMany).toHaveBeenCalledWith({
      where: { id: 1n, reservation_id: null },
      data: expect.objectContaining({
        reservation_id: expect.stringMatching(/^res_/),
      }),
    });
    expect(mailService.sendReservationCreatedEmail).toHaveBeenCalledWith(
      'guest@example.com',
      expect.objectContaining({
        reservationId: 'res_1',
        customerName: '홍길동',
        storeName: '테스트 매장',
        accessToken: 'token',
      }),
    );
    expect(result.storeName).toBe('테스트 매장');
    expect(result.reservation.accessToken).toBe('token');
    expect(result.reservation.locale).toBe('en');
  });

  it('creates a guest reservation when phoneNumber is an email address', async () => {
    const { service, prisma, tx } = createGuestReservationService();

    prisma.stores.findFirst.mockResolvedValue({
      id: 'store_1',
      business_name: '테스트 매장',
    });
    prisma.store_settings.findUnique.mockResolvedValue({
      m_max_capacity: 5,
    });
    prisma.reservations.aggregate.mockResolvedValue({
      _sum: { bag_count: 0 },
    });
    tx.store_settings.findUnique.mockResolvedValue({
      m_max_capacity: 5,
    });
    tx.reservations.aggregate.mockResolvedValue({
      _sum: { bag_count: 0 },
    });
    prisma.reservations.findFirst.mockResolvedValue({
      id: 'res_email',
      store_id: 'store_1',
      customer_name: 'Jane',
      customer_phone: 'guest@example.com',
      customer_email: 'guest@example.com',
      locale: 'ko',
      status: reservations_status.pending,
      start_time: new Date('2026-04-27T01:00:00.000Z'),
      end_time: new Date('2026-04-27T05:00:00.000Z'),
      duration: 4,
      bag_count: 1,
      total_amount: 4500,
      message: null,
      requested_storage_type: reservations_requested_storage_type.s,
      payment_status: reservations_payment_status.pending,
      qr_code: 'token',
      created_at: new Date('2026-04-27T00:00:00.000Z'),
      stores: {
        business_name: '테스트 매장',
        address: 'Seoul',
        phone_number: '02-0000-0000',
        latitude: null,
        longitude: null,
      },
    });

    await service.createReservation({
      storeId: 'store_1',
      customerName: 'Jane',
      phoneNumber: 'guest@example.com',
      email: 'guest@example.com',
      startTime: '2026-04-27T10:00:00+09:00',
      duration: 4,
      bagCount: 1,
      requestedStorageType: reservations_requested_storage_type.s,
    });

    expect(tx.reservations.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customer_phone: 'guest@example.com',
        customer_email: 'guest@example.com',
        locale: 'ko',
      }),
    });
  });

  it('lists guest reservations by email', async () => {
    const { service, prisma } = createGuestReservationService();

    prisma.reservations.findMany.mockResolvedValue([
      {
        id: 'res_email',
        store_id: 'store_1',
        customer_name: 'Jane',
        customer_phone: 'guest@example.com',
        customer_email: 'guest@example.com',
        locale: 'ko',
        status: reservations_status.confirmed,
        start_time: new Date('2026-04-27T01:00:00.000Z'),
        end_time: new Date('2026-04-27T05:00:00.000Z'),
        duration: 4,
        bag_count: 1,
        total_amount: 4500,
        message: null,
        requested_storage_type: reservations_requested_storage_type.s,
        payment_status: reservations_payment_status.pending,
        qr_code: 'token',
        created_at: new Date('2026-04-27T00:00:00.000Z'),
        stores: {
          business_name: '테스트 매장',
          address: 'Seoul',
          phone_number: '02-0000-0000',
          latitude: null,
          longitude: null,
        },
      },
    ]);

    const result = await service.listReservations({
      email: 'Guest@Example.com',
    });

    expect(prisma.reservations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { customer_email: 'guest@example.com' },
            { customer_phone: 'guest@example.com' },
          ],
        },
      }),
    );
    expect(result.total).toBe(1);
  });

  it('cancels a guest reservation after email verification', async () => {
    const { service, tx } = createGuestReservationService();
    const future = new Date(Date.now() + 60 * 60 * 1000);

    tx.reservations.findFirst.mockResolvedValue({
      id: 'res_email',
      customer_phone: 'guest@example.com',
      customer_email: 'guest@example.com',
      status: reservations_status.confirmed,
      start_time: future,
      storage_id: null,
    });

    const result = await service.cancelReservation('res_email', {
      email: 'guest@example.com',
    });

    expect(tx.reservations.update).toHaveBeenCalledWith({
      where: { id: 'res_email' },
      data: expect.objectContaining({
        status: reservations_status.cancelled,
      }),
    });
    expect(result).toEqual({
      id: 'res_email',
      status: reservations_status.cancelled,
    });
  });

  it('cancels a guest reservation only after phone verification and releases storage', async () => {
    const { service, prisma, tx } = createGuestReservationService();
    const future = new Date(Date.now() + 60 * 60 * 1000);

    tx.reservations.findFirst.mockResolvedValue({
      id: 'res_1',
      customer_phone: '01012345678',
      status: reservations_status.confirmed,
      start_time: future,
      storage_id: 'storage_1',
    });

    const result = await service.cancelReservation('res_1', {
      phoneNumber: '010-1234-5678',
    });

    expect(tx.reservations.update).toHaveBeenCalledWith({
      where: { id: 'res_1' },
      data: expect.objectContaining({
        status: reservations_status.cancelled,
      }),
    });
    expect(tx.storages.update).toHaveBeenCalledWith({
      where: { id: 'storage_1' },
      data: expect.objectContaining({
        status: storages_status.available,
      }),
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(result).toEqual({
      id: 'res_1',
      status: reservations_status.cancelled,
    });
  });

  describe('calculateTotalAmount (progressive pricing)', () => {
    const pricingService = new ReservationPricingService();

    it('charges 1-day 소형 rate when pickup is on the same KST date', () => {
      const start = new Date('2026-05-01T01:00:00.000Z');
      const end = new Date('2026-05-01T05:00:00.000Z');
      expect(
        pricingService.calculateTotalAmount({
          storageType: reservations_requested_storage_type.s,
          bagCount: 1,
          startTime: start,
          endTime: end,
        }),
      ).toBe(4500);
      expect(
        pricingService.calculateTotalAmount({
          storageType: reservations_requested_storage_type.s,
          bagCount: 3,
          startTime: start,
          endTime: end,
        }),
      ).toBe(13500);
    });

    it('charges 2-day rate when pickup is on the next KST date', () => {
      const start = new Date('2026-05-01T01:00:00.000Z');
      const end = new Date('2026-05-02T01:00:00.000Z');
      expect(
        pricingService.calculateTotalAmount({
          storageType: reservations_requested_storage_type.s,
          bagCount: 1,
          startTime: start,
          endTime: end,
        }),
      ).toBe(9000);
      expect(
        pricingService.calculateTotalAmount({
          storageType: reservations_requested_storage_type.m,
          bagCount: 1,
          startTime: start,
          endTime: end,
        }),
      ).toBe(12000);
    });

    it('charges (N+1)-day rate when pickup is N KST days later', () => {
      const start = new Date('2026-05-01T01:00:00.000Z');
      const end = new Date('2026-05-04T01:00:00.000Z');
      expect(
        pricingService.calculateTotalAmount({
          storageType: reservations_requested_storage_type.l,
          bagCount: 1,
          startTime: start,
          endTime: end,
        }),
      ).toBe(32000);
    });

    it('treats close-to-midnight pickup within same KST day as 1-day rate', () => {
      const start = new Date('2026-05-01T01:00:00.000Z');
      const end = new Date('2026-05-01T14:59:00.000Z');
      expect(
        pricingService.calculateTotalAmount({
          storageType: reservations_requested_storage_type.s,
          bagCount: 1,
          startTime: start,
          endTime: end,
        }),
      ).toBe(4500);
    });
  });
});
