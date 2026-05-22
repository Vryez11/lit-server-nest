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

  return {
    service: new GuestReservationService(
      prisma as never,
      reservationStorageService,
    ),
    prisma,
    tx,
  };
};

describe('GuestReservationService', () => {
  it('creates a guest reservation with normalized phone and payment link', async () => {
    const { service, prisma, tx } = createGuestReservationService();

    prisma.stores.findFirst.mockResolvedValue({
      id: 'store_1',
      business_name: '테스트 매장',
    });
    prisma.store_settings.findUnique.mockResolvedValue({
      s_max_capacity: 5,
    });
    prisma.reservations.aggregate.mockResolvedValue({
      _sum: { bag_count: 1 },
    });
    tx.store_settings.findUnique.mockResolvedValue({
      s_max_capacity: 5,
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
      status: reservations_status.pending,
      start_time: new Date('2026-04-27T01:00:00.000Z'),
      end_time: new Date('2026-04-27T05:00:00.000Z'),
      duration: 4,
      bag_count: 2,
      total_amount: 12000,
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
        total_amount: 12000,
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
    expect(result.storeName).toBe('테스트 매장');
    expect(result.reservation.accessToken).toBe('token');
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
    // 누진 모델: 6,000원 × bagCount × (KST 일수 차이 + 1).
    // 같은 KST 날짜 = 1일치 / 다음날 = 2일치 / N일 후 = (N+1)일치.

    it('charges 1-day rate when pickup is on the same KST date', () => {
      const { service } = createGuestReservationService();
      // KST 2026-05-01 10:00 → 14:00 (같은 영업일, 같은 KST 날짜).
      const start = new Date('2026-05-01T01:00:00.000Z');
      const end = new Date('2026-05-01T05:00:00.000Z');
      expect(service.calculateTotalAmount(start, end, 1)).toBe(6000);
      expect(service.calculateTotalAmount(start, end, 3)).toBe(18000);
    });

    it('charges 2-day rate when pickup is on the next KST date', () => {
      const { service } = createGuestReservationService();
      // KST 2026-05-01 10:00 → 2026-05-02 10:00 (다음날).
      const start = new Date('2026-05-01T01:00:00.000Z');
      const end = new Date('2026-05-02T01:00:00.000Z');
      expect(service.calculateTotalAmount(start, end, 1)).toBe(12000);
      expect(service.calculateTotalAmount(start, end, 2)).toBe(24000);
    });

    it('charges (N+1)-day rate when pickup is N KST days later', () => {
      const { service } = createGuestReservationService();
      // KST 2026-05-01 → 2026-05-04 (3일 후) → (3+1)일치.
      const start = new Date('2026-05-01T01:00:00.000Z');
      const end = new Date('2026-05-04T01:00:00.000Z');
      expect(service.calculateTotalAmount(start, end, 1)).toBe(24000);
      expect(service.calculateTotalAmount(start, end, 2)).toBe(48000);
    });

    it('treats close-to-midnight pickup within same KST day as 1-day rate', () => {
      const { service } = createGuestReservationService();
      // 24시 마감 매장 케이스 — KST 23:59 픽업도 같은 날 → 6,000원.
      const start = new Date('2026-05-01T01:00:00.000Z'); // KST 10:00
      const end = new Date('2026-05-01T14:59:00.000Z'); // KST 23:59
      expect(service.calculateTotalAmount(start, end, 1)).toBe(6000);
    });
  });
});
