/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

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
      groupBy: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    payments: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    storages: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
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
      groupBy: jest.fn().mockResolvedValue([]),
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

const guestStoreRow = {
  business_name: '테스트 매장',
  address: '서울',
  phone_number: '02-0000-0000',
  latitude: null,
  longitude: null,
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
    prisma.reservations.groupBy.mockResolvedValue([
      {
        requested_storage_type: reservations_requested_storage_type.s,
        _sum: { bag_count: 1 },
      },
    ]);
    tx.store_settings.findUnique.mockResolvedValue({
      m_max_capacity: 5,
    });
    tx.reservations.groupBy.mockResolvedValue([
      {
        requested_storage_type: reservations_requested_storage_type.s,
        _sum: { bag_count: 1 },
      },
    ]);
    tx.payments.findFirst.mockResolvedValue({
      id: 1n,
      status: payments_status.SUCCESS,
      reservation_id: null,
    });
    tx.payments.updateMany.mockResolvedValue({ count: 1 });
    prisma.reservations.findMany.mockResolvedValue([
      {
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
        reservation_group_id: 'res_1',
        created_at: new Date('2026-04-27T00:00:00.000Z'),
        stores: guestStoreRow,
      },
    ]);

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

    expect(tx.reservations.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          store_id: 'store_1',
          customer_phone: '01012345678',
          customer_email: 'guest@example.com',
          locale: 'en',
          total_amount: 9000,
          payment_status: reservations_payment_status.paid,
          payment_id: 1n,
          reservation_group_id: expect.stringMatching(/^res_/),
        }),
      ],
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
    expect(result.reservation.groupId).toBe('res_1');
    expect(result.reservation.items).toEqual([
      {
        storageType: reservations_requested_storage_type.s,
        bagCount: 2,
        amount: 9000,
      },
    ]);
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
    tx.store_settings.findUnique.mockResolvedValue({
      m_max_capacity: 5,
    });
    prisma.reservations.findMany.mockResolvedValue([
      {
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
        reservation_group_id: 'res_email',
        created_at: new Date('2026-04-27T00:00:00.000Z'),
        stores: guestStoreRow,
      },
    ]);

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

    expect(tx.reservations.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          customer_phone: 'guest@example.com',
          customer_email: 'guest@example.com',
          locale: 'ko',
        }),
      ],
    });
  });

  it('creates one reservation row per storage type for multi-type requests', async () => {
    const { service, prisma, tx, mailService } =
      createGuestReservationService();

    prisma.stores.findFirst.mockResolvedValue({
      id: 'store_1',
      business_name: '테스트 매장',
    });
    prisma.store_settings.findUnique.mockResolvedValue({
      m_max_capacity: 5,
      xl_max_capacity: 5,
    });
    tx.store_settings.findUnique.mockResolvedValue({
      m_max_capacity: 5,
      xl_max_capacity: 5,
    });
    tx.payments.findFirst.mockResolvedValue({
      id: 1n,
      status: payments_status.SUCCESS,
      reservation_id: null,
    });
    tx.payments.updateMany.mockResolvedValue({ count: 1 });
    prisma.reservations.findMany.mockResolvedValue([
      {
        id: 'res_a',
        store_id: 'store_1',
        customer_name: '홍길동',
        customer_phone: '01012345678',
        customer_email: 'guest@example.com',
        locale: 'ko',
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
        reservation_group_id: 'res_a',
        created_at: new Date('2026-04-27T00:00:00.000Z'),
        stores: guestStoreRow,
      },
      {
        id: 'res_b',
        store_id: 'store_1',
        customer_name: '홍길동',
        customer_phone: '01012345678',
        customer_email: 'guest@example.com',
        locale: 'ko',
        status: reservations_status.pending,
        start_time: new Date('2026-04-27T01:00:00.000Z'),
        end_time: new Date('2026-04-27T05:00:00.000Z'),
        duration: 4,
        bag_count: 1,
        total_amount: 8000,
        message: null,
        requested_storage_type: reservations_requested_storage_type.l,
        payment_status: reservations_payment_status.paid,
        qr_code: 'token',
        reservation_group_id: 'res_a',
        created_at: new Date('2026-04-27T00:00:00.000Z'),
        stores: guestStoreRow,
      },
    ]);

    const result = await service.createReservation({
      storeId: 'store_1',
      customerName: '홍길동',
      phoneNumber: '010-1234-5678',
      customerEmail: 'guest@example.com',
      startTime: '2026-04-27T10:00:00+09:00',
      duration: 4,
      items: [
        { storageType: reservations_requested_storage_type.s, bagCount: 2 },
        { storageType: reservations_requested_storage_type.l, bagCount: 1 },
      ],
      paymentKey: 'payment_key',
      orderId: 'order_id',
    });

    const createManyArg = tx.reservations.createMany.mock.calls[0][0] as {
      data: Array<Record<string, unknown>>;
    };

    expect(createManyArg.data).toHaveLength(2);
    expect(createManyArg.data[0]).toMatchObject({
      requested_storage_type: reservations_requested_storage_type.s,
      bag_count: 2,
      total_amount: 9000,
      payment_id: 1n,
      payment_status: reservations_payment_status.paid,
    });
    expect(createManyArg.data[1]).toMatchObject({
      requested_storage_type: reservations_requested_storage_type.l,
      bag_count: 1,
      total_amount: 8000,
      payment_id: null,
      payment_status: reservations_payment_status.paid,
    });
    // 그룹 공유 값: group_id는 대표 예약 id, 토큰/고객/생성시각 동일
    expect(createManyArg.data[0].reservation_group_id).toBe(
      createManyArg.data[0].id,
    );
    expect(createManyArg.data[1].reservation_group_id).toBe(
      createManyArg.data[0].id,
    );
    expect(createManyArg.data[1].qr_code).toBe(createManyArg.data[0].qr_code);
    expect(createManyArg.data[1].customer_id).toBe(
      createManyArg.data[0].customer_id,
    );
    expect(createManyArg.data[1].created_at).toBe(
      createManyArg.data[0].created_at,
    );

    expect(result.reservation.id).toBe('res_a');
    expect(result.reservation.groupId).toBe('res_a');
    expect(result.reservation.bagCount).toBe(3);
    expect(result.reservation.totalAmount).toBe(17000);
    expect(result.reservation.items).toEqual([
      {
        storageType: reservations_requested_storage_type.s,
        bagCount: 2,
        amount: 9000,
      },
      {
        storageType: reservations_requested_storage_type.l,
        bagCount: 1,
        amount: 8000,
      },
    ]);
    expect(mailService.sendReservationCreatedEmail).toHaveBeenCalledTimes(1);
    expect(mailService.sendReservationCreatedEmail).toHaveBeenCalledWith(
      'guest@example.com',
      expect.objectContaining({
        reservationId: 'res_a',
        bagCount: 3,
        totalAmount: 17000,
      }),
    );
  });

  it('rejects the whole group when one storage type lacks capacity', async () => {
    const { service, prisma, tx } = createGuestReservationService();

    prisma.stores.findFirst.mockResolvedValue({
      id: 'store_1',
      business_name: '테스트 매장',
    });
    prisma.store_settings.findUnique.mockResolvedValue({
      m_max_capacity: 5,
      xl_max_capacity: 5,
    });
    prisma.reservations.groupBy.mockResolvedValue([
      {
        requested_storage_type: reservations_requested_storage_type.l,
        _sum: { bag_count: 5 },
      },
    ]);

    await expect(
      service.createReservation({
        storeId: 'store_1',
        customerName: '홍길동',
        phoneNumber: '010-1234-5678',
        startTime: '2026-04-27T10:00:00+09:00',
        duration: 4,
        items: [
          { storageType: reservations_requested_storage_type.s, bagCount: 2 },
          { storageType: reservations_requested_storage_type.l, bagCount: 1 },
        ],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CAPACITY_EXCEEDED',
        details: expect.objectContaining({
          failures: [
            expect.objectContaining({
              storageType: reservations_requested_storage_type.l,
              requested: 1,
            }),
          ],
        }),
      }),
    });
    expect(tx.reservations.createMany).not.toHaveBeenCalled();
  });

  it('merges duplicate storage types after normalization (xl/special → l)', async () => {
    const { service, prisma, tx } = createGuestReservationService();

    prisma.stores.findFirst.mockResolvedValue({
      id: 'store_1',
      business_name: '테스트 매장',
    });
    prisma.store_settings.findUnique.mockResolvedValue({
      xl_max_capacity: 10,
    });
    tx.store_settings.findUnique.mockResolvedValue({
      xl_max_capacity: 10,
    });
    prisma.reservations.findMany.mockResolvedValue([
      {
        id: 'res_l',
        store_id: 'store_1',
        customer_name: '홍길동',
        customer_phone: '01012345678',
        customer_email: null,
        locale: 'ko',
        status: reservations_status.pending,
        start_time: new Date('2026-04-27T01:00:00.000Z'),
        end_time: new Date('2026-04-27T05:00:00.000Z'),
        duration: 4,
        bag_count: 5,
        total_amount: 40000,
        message: null,
        requested_storage_type: reservations_requested_storage_type.l,
        payment_status: reservations_payment_status.pending,
        qr_code: 'token',
        reservation_group_id: 'res_l',
        created_at: new Date('2026-04-27T00:00:00.000Z'),
        stores: guestStoreRow,
      },
    ]);

    await service.createReservation({
      storeId: 'store_1',
      customerName: '홍길동',
      phoneNumber: '010-1234-5678',
      startTime: '2026-04-27T10:00:00+09:00',
      duration: 4,
      items: [
        { storageType: reservations_requested_storage_type.xl, bagCount: 2 },
        {
          storageType: reservations_requested_storage_type.special,
          bagCount: 3,
        },
      ],
    });

    const createManyArg = tx.reservations.createMany.mock.calls[0][0] as {
      data: Array<Record<string, unknown>>;
    };

    expect(createManyArg.data).toHaveLength(1);
    expect(createManyArg.data[0]).toMatchObject({
      requested_storage_type: reservations_requested_storage_type.l,
      bag_count: 5,
    });
  });

  it('rejects when merged bag count per type exceeds 10', async () => {
    const { service } = createGuestReservationService();

    await expect(
      service.createReservation({
        storeId: 'store_1',
        customerName: '홍길동',
        phoneNumber: '010-1234-5678',
        startTime: '2026-04-27T10:00:00+09:00',
        duration: 4,
        items: [
          { storageType: reservations_requested_storage_type.xl, bagCount: 6 },
          {
            storageType: reservations_requested_storage_type.special,
            bagCount: 5,
          },
        ],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'VALIDATION_ERROR',
        details: expect.objectContaining({
          storageType: reservations_requested_storage_type.l,
          merged: 11,
        }),
      }),
    });
  });

  it('prefers items over legacy single-type fields when both are sent', async () => {
    const { service, prisma, tx } = createGuestReservationService();

    prisma.stores.findFirst.mockResolvedValue({
      id: 'store_1',
      business_name: '테스트 매장',
    });
    prisma.store_settings.findUnique.mockResolvedValue({
      l_max_capacity: 5,
    });
    tx.store_settings.findUnique.mockResolvedValue({
      l_max_capacity: 5,
    });
    prisma.reservations.findMany.mockResolvedValue([
      {
        id: 'res_m',
        store_id: 'store_1',
        customer_name: '홍길동',
        customer_phone: '01012345678',
        customer_email: null,
        locale: 'ko',
        status: reservations_status.pending,
        start_time: new Date('2026-04-27T01:00:00.000Z'),
        end_time: new Date('2026-04-27T05:00:00.000Z'),
        duration: 4,
        bag_count: 1,
        total_amount: 6000,
        message: null,
        requested_storage_type: reservations_requested_storage_type.m,
        payment_status: reservations_payment_status.pending,
        qr_code: 'token',
        reservation_group_id: 'res_m',
        created_at: new Date('2026-04-27T00:00:00.000Z'),
        stores: guestStoreRow,
      },
    ]);

    await service.createReservation({
      storeId: 'store_1',
      customerName: '홍길동',
      phoneNumber: '010-1234-5678',
      startTime: '2026-04-27T10:00:00+09:00',
      duration: 4,
      bagCount: 9,
      storageType: reservations_requested_storage_type.s,
      items: [
        { storageType: reservations_requested_storage_type.m, bagCount: 1 },
      ],
    });

    const createManyArg = tx.reservations.createMany.mock.calls[0][0] as {
      data: Array<Record<string, unknown>>;
    };

    expect(createManyArg.data).toHaveLength(1);
    expect(createManyArg.data[0]).toMatchObject({
      requested_storage_type: reservations_requested_storage_type.m,
      bag_count: 1,
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
        reservation_group_id: null,
        created_at: new Date('2026-04-27T00:00:00.000Z'),
        stores: guestStoreRow,
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

  it('merges grouped rows into one list entry and keeps legacy rows as-is', async () => {
    const { service, prisma } = createGuestReservationService();
    const base = {
      store_id: 'store_1',
      customer_name: '홍길동',
      customer_phone: '01012345678',
      customer_email: null,
      locale: 'ko',
      start_time: new Date('2026-04-27T01:00:00.000Z'),
      end_time: new Date('2026-04-27T05:00:00.000Z'),
      duration: 4,
      message: null,
      payment_status: reservations_payment_status.pending,
      qr_code: 'token',
      stores: guestStoreRow,
    };

    prisma.reservations.findMany.mockResolvedValue([
      {
        ...base,
        id: 'res_a',
        status: reservations_status.confirmed,
        bag_count: 2,
        total_amount: 9000,
        requested_storage_type: reservations_requested_storage_type.s,
        reservation_group_id: 'res_a',
        created_at: new Date('2026-04-28T00:00:00.000Z'),
      },
      {
        ...base,
        id: 'res_b',
        status: reservations_status.pending,
        bag_count: 1,
        total_amount: 8000,
        requested_storage_type: reservations_requested_storage_type.l,
        reservation_group_id: 'res_a',
        created_at: new Date('2026-04-28T00:00:00.000Z'),
      },
      {
        ...base,
        id: 'res_legacy',
        status: reservations_status.completed,
        bag_count: 1,
        total_amount: 4500,
        requested_storage_type: reservations_requested_storage_type.s,
        reservation_group_id: null,
        created_at: new Date('2026-04-27T00:00:00.000Z'),
      },
    ]);

    const result = await service.listReservations({
      phoneNumber: '010-1234-5678',
    });

    expect(result.total).toBe(2);
    expect(result.items[0].id).toBe('res_a');
    expect(result.items[0].bagCount).toBe(3);
    expect(result.items[0].totalAmount).toBe(17000);
    expect(result.items[0].items).toHaveLength(2);
    // 그룹 status는 진행도가 가장 낮은 상태(pending)로 노출
    expect(result.items[0].status).toBe(reservations_status.pending);
    expect(result.items[1].id).toBe('res_legacy');
    expect(result.items[1].items).toHaveLength(1);
  });

  it('returns the merged group when fetched by a non-representative member id', async () => {
    const { service, prisma } = createGuestReservationService();
    const base = {
      store_id: 'store_1',
      customer_name: '홍길동',
      customer_phone: '01012345678',
      customer_email: null,
      locale: 'ko',
      status: reservations_status.pending,
      start_time: new Date('2026-04-27T01:00:00.000Z'),
      end_time: new Date('2026-04-27T05:00:00.000Z'),
      duration: 4,
      message: null,
      payment_status: reservations_payment_status.pending,
      qr_code: 'token',
      created_at: new Date('2026-04-27T00:00:00.000Z'),
      stores: guestStoreRow,
    };
    const memberRow = {
      ...base,
      id: 'res_b',
      bag_count: 1,
      total_amount: 8000,
      requested_storage_type: reservations_requested_storage_type.l,
      reservation_group_id: 'res_a',
    };

    prisma.reservations.findFirst.mockResolvedValue(memberRow);
    prisma.reservations.findMany.mockResolvedValue([
      {
        ...base,
        id: 'res_a',
        bag_count: 2,
        total_amount: 9000,
        requested_storage_type: reservations_requested_storage_type.s,
        reservation_group_id: 'res_a',
      },
      memberRow,
    ]);

    const result = await service.getReservation('res_b', { token: 'token' });

    expect(prisma.reservations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reservation_group_id: 'res_a', qr_code: 'token' },
      }),
    );
    expect(result.id).toBe('res_a');
    expect(result.groupId).toBe('res_a');
    expect(result.bagCount).toBe(3);
    expect(result.totalAmount).toBe(17000);
    expect(result.items).toHaveLength(2);
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
      reservation_group_id: null,
    });

    const result = await service.cancelReservation('res_email', {
      email: 'guest@example.com',
    });

    expect(tx.reservations.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['res_email'] } },
      data: expect.objectContaining({
        status: reservations_status.cancelled,
      }),
    });
    expect(result).toEqual({
      id: 'res_email',
      status: reservations_status.cancelled,
      groupId: 'res_email',
      cancelledCount: 1,
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
      reservation_group_id: null,
    });

    const result = await service.cancelReservation('res_1', {
      phoneNumber: '010-1234-5678',
    });

    expect(tx.reservations.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['res_1'] } },
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
      groupId: 'res_1',
      cancelledCount: 1,
    });
  });

  it('cancels all reservations in a group when called with a member id', async () => {
    const { service, tx } = createGuestReservationService();
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const groupRows = [
      {
        id: 'res_a',
        customer_phone: '01012345678',
        customer_email: null,
        status: reservations_status.confirmed,
        start_time: future,
        storage_id: 'storage_1',
        reservation_group_id: 'res_a',
        requested_storage_type: reservations_requested_storage_type.s,
      },
      {
        id: 'res_b',
        customer_phone: '01012345678',
        customer_email: null,
        status: reservations_status.pending,
        start_time: future,
        storage_id: 'storage_2',
        reservation_group_id: 'res_a',
        requested_storage_type: reservations_requested_storage_type.l,
      },
    ];

    tx.reservations.findFirst.mockResolvedValue(groupRows[1]);
    tx.reservations.findMany.mockResolvedValue(groupRows);

    const result = await service.cancelReservation('res_b', {
      phoneNumber: '010-1234-5678',
    });

    expect(tx.reservations.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['res_a', 'res_b'] } },
      data: expect.objectContaining({
        status: reservations_status.cancelled,
      }),
    });
    expect(tx.storages.update).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      id: 'res_a',
      status: reservations_status.cancelled,
      groupId: 'res_a',
      cancelledCount: 2,
    });
  });

  it('rejects group cancellation when any member is not cancellable', async () => {
    const { service, tx } = createGuestReservationService();
    const future = new Date(Date.now() + 60 * 60 * 1000);

    tx.reservations.findFirst.mockResolvedValue({
      id: 'res_a',
      customer_phone: '01012345678',
      customer_email: null,
      status: reservations_status.confirmed,
      start_time: future,
      storage_id: null,
      reservation_group_id: 'res_a',
      requested_storage_type: reservations_requested_storage_type.s,
    });
    tx.reservations.findMany.mockResolvedValue([
      {
        id: 'res_a',
        customer_phone: '01012345678',
        customer_email: null,
        status: reservations_status.confirmed,
        start_time: future,
        storage_id: null,
        reservation_group_id: 'res_a',
        requested_storage_type: reservations_requested_storage_type.s,
      },
      {
        id: 'res_b',
        customer_phone: '01012345678',
        customer_email: null,
        status: reservations_status.in_progress,
        start_time: future,
        storage_id: 'storage_2',
        reservation_group_id: 'res_a',
        requested_storage_type: reservations_requested_storage_type.l,
      },
    ]);

    await expect(
      service.cancelReservation('res_a', { phoneNumber: '010-1234-5678' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'NOT_CANCELLABLE',
        details: expect.objectContaining({
          blockedItems: [
            expect.objectContaining({
              id: 'res_b',
              status: reservations_status.in_progress,
            }),
          ],
        }),
      }),
    });
    expect(tx.reservations.updateMany).not.toHaveBeenCalled();
  });

  it('auto-approves the group on creation and assigns storage', async () => {
    const { service, prisma, tx } = createGuestReservationService();

    prisma.stores.findFirst.mockResolvedValue({
      id: 'store_1',
      business_name: '테스트 매장',
    });
    prisma.store_settings.findUnique.mockResolvedValue({ m_max_capacity: 5 });
    tx.store_settings.findUnique.mockResolvedValue({ m_max_capacity: 5 });

    const pendingRow = {
      id: 'res_1',
      store_id: 'store_1',
      status: reservations_status.pending,
      start_time: new Date('2026-04-27T01:00:00.000Z'),
      end_time: new Date('2026-04-27T05:00:00.000Z'),
      requested_storage_type: reservations_requested_storage_type.s,
      confirmed_at: null,
    };
    // autoApproveGroup: 그룹의 pending 행을 조회한 뒤 보관함을 할당한다.
    tx.reservations.findMany.mockResolvedValue([pendingRow]);
    tx.storages.findFirst.mockResolvedValue({ id: 'storage_1', number: 'S1' });
    // 응답용 그룹 조회는 prisma.reservations.findMany를 사용한다.
    prisma.reservations.findMany.mockResolvedValue([
      {
        ...pendingRow,
        customer_name: '홍길동',
        customer_phone: '01012345678',
        customer_email: null,
        locale: 'ko',
        duration: 4,
        bag_count: 1,
        total_amount: 4500,
        message: null,
        payment_status: reservations_payment_status.pending,
        qr_code: 'token',
        reservation_group_id: 'res_1',
        created_at: new Date('2026-04-27T00:00:00.000Z'),
        status: reservations_status.confirmed,
        storage_id: 'storage_1',
        storage_number: 'S1',
        stores: guestStoreRow,
      },
    ]);

    await service.createReservation({
      storeId: 'store_1',
      customerName: '홍길동',
      phoneNumber: '010-1234-5678',
      startTime: '2026-04-27T10:00:00+09:00',
      duration: 4,
      bagCount: 1,
      requestedStorageType: reservations_requested_storage_type.s,
    });

    expect(tx.reservations.update).toHaveBeenCalledWith({
      where: { id: 'res_1' },
      data: expect.objectContaining({
        status: reservations_status.confirmed,
        storage_id: 'storage_1',
        storage_number: 'S1',
      }),
    });
  });

  it('cleanup cancels expired unpaid reservations (incl. auto-approved) and releases storage', async () => {
    const { service, tx } = createGuestReservationService();

    tx.reservations.findMany.mockResolvedValue([
      { id: 'res_1', storage_id: 'storage_1' },
      { id: 'res_2', storage_id: null },
    ]);
    tx.reservations.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.cleanupExpiredReservations();

    expect(tx.storages.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['storage_1'] } },
      data: expect.objectContaining({ status: storages_status.available }),
    });
    expect(tx.reservations.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['res_1', 'res_2'] } },
      data: expect.objectContaining({
        status: reservations_status.cancelled,
      }),
    });
    expect(result).toEqual({ cancelledCount: 2, ttlMinutes: 30 });
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
