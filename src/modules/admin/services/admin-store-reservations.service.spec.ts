/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { reservations, reservations_status } from '@prisma/client';
import { AdminStoreReservationsQueryDto } from '../dto/admin-store-ops.dto';
import { AdminStoreReservationsService } from './admin-store-reservations.service';

const createReservation = (
  overrides: Partial<reservations> = {},
): reservations => ({
  id: 'res_1',
  store_id: 'store_a',
  customer_id: null,
  customer_name: '홍길동',
  customer_phone: '01012345678',
  customer_email: null,
  locale: 'ko',
  storage_id: null,
  storage_number: null,
  requested_storage_type: 'm',
  status: reservations_status.no_show,
  start_time: new Date('2026-09-10T01:00:00.000Z'),
  end_time: new Date('2026-09-10T09:00:00.000Z'),
  request_time: new Date('2026-09-09T01:00:00.000Z'),
  confirmed_at: null,
  actual_start_time: null,
  actual_end_time: null,
  duration: 8,
  bag_count: 2,
  total_amount: 12000,
  message: null,
  special_requests: null,
  luggage_image_urls: null,
  luggage_upload_token: null,
  luggage_customer_memo: null,
  luggage_owner_memo: null,
  payment_status: 'pending',
  payment_method: null,
  payment_id: null,
  qr_code: null,
  reservation_group_id: 'res_1',
  created_at: new Date('2026-09-09T01:00:00.000Z'),
  updated_at: new Date('2026-09-09T01:00:00.000Z'),
  ...overrides,
});

const createService = (rows: reservations[] = [], total = rows.length) => {
  const prisma = {
    reservations: {
      count: jest.fn().mockResolvedValue(total),
      findMany: jest.fn().mockResolvedValue(rows),
    },
  };
  const adminStoreService = {
    getStoreOrThrow: jest.fn().mockResolvedValue({ id: 'store_a' }),
  };
  const service = new AdminStoreReservationsService(
    prisma as never,
    adminStoreService as never,
  );

  return { service, prisma, adminStoreService };
};

const query = (
  overrides: Partial<AdminStoreReservationsQueryDto> = {},
): AdminStoreReservationsQueryDto => ({
  page: 1,
  limit: 20,
  ...overrides,
});

const whereOf = (prisma: ReturnType<typeof createService>['prisma']) =>
  prisma.reservations.findMany.mock.calls[0][0].where;

describe('AdminStoreReservationsService', () => {
  it('maps rows with the store reservation mapper and returns page/limit/total', async () => {
    const rows = [
      createReservation({ id: 'res_1' }),
      createReservation({
        id: 'res_2',
        reservation_group_id: 'res_1',
        requested_storage_type: 'l',
      }),
    ];
    const { service, prisma } = createService(rows, 7);

    const result = await service.listStoreReservations(
      'store_a',
      query({ page: 2, limit: 2 }),
    );

    expect(result).toMatchObject({ page: 2, limit: 2, total: 7 });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: 'res_1',
      storeId: 'store_a',
      customerName: '홍길동',
      phoneNumber: '01012345678',
      status: 'no_show',
      price: 12000,
      groupId: 'res_1',
      storageType: 'm',
    });
    // 그룹 멤버는 N건 개별 노출 + groupId (F-009 규칙 유지)
    expect(result.items[1]).toMatchObject({
      id: 'res_2',
      groupId: 'res_1',
      storageType: 'l',
    });
    expect(prisma.reservations.findMany).toHaveBeenCalledWith({
      where: { store_id: 'store_a' },
      orderBy: { created_at: 'desc' },
      skip: 2,
      take: 2,
    });
    expect(prisma.reservations.count).toHaveBeenCalledWith({
      where: { store_id: 'store_a' },
    });
  });

  it('applies no created_at filter when neither from nor to is given', async () => {
    const { service, prisma } = createService();

    await service.listStoreReservations('store_a', query());

    expect(whereOf(prisma)).not.toHaveProperty('created_at');
  });

  it('applies a KST created_at range when from/to are given (same cohort as the metrics)', async () => {
    const { service, prisma } = createService();

    await service.listStoreReservations(
      'store_a',
      query({ from: '2026-09-01', to: '2026-09-30' }),
    );

    expect(whereOf(prisma).created_at).toEqual({
      gte: new Date('2026-08-31T15:00:00.000Z'),
      lt: new Date('2026-09-30T15:00:00.000Z'),
    });
  });

  it('fills the missing side of the range (only `to` given → 30-day window ending at to)', async () => {
    const { service, prisma } = createService();

    await service.listStoreReservations('store_a', query({ to: '2026-09-30' }));

    expect(whereOf(prisma).created_at).toEqual({
      gte: new Date('2026-08-31T15:00:00.000Z'), // 2026-09-01 KST 00:00
      lt: new Date('2026-09-30T15:00:00.000Z'),
    });
  });

  it('filters by status including no_show', async () => {
    const { service, prisma } = createService();

    await service.listStoreReservations(
      'store_a',
      query({ status: reservations_status.no_show }),
    );

    expect(whereOf(prisma)).toEqual({
      store_id: 'store_a',
      status: reservations_status.no_show,
    });
  });

  it('searches customer name/phone by contains and reservation id by equality', async () => {
    const { service, prisma } = createService();

    await service.listStoreReservations(
      'store_a',
      query({ search: '0101234' }),
    );

    expect(whereOf(prisma).OR).toEqual([
      { customer_name: { contains: '0101234' } },
      { customer_phone: { contains: '0101234' } },
      { id: { equals: '0101234' } },
    ]);
  });

  it('combines status, range and search in one where', async () => {
    const { service, prisma } = createService();

    await service.listStoreReservations(
      'store_a',
      query({
        status: reservations_status.completed,
        from: '2026-09-01',
        to: '2026-09-07',
        search: '홍',
      }),
    );

    expect(whereOf(prisma)).toEqual({
      store_id: 'store_a',
      status: reservations_status.completed,
      created_at: {
        gte: new Date('2026-08-31T15:00:00.000Z'),
        lt: new Date('2026-09-07T15:00:00.000Z'),
      },
      OR: [
        { customer_name: { contains: '홍' } },
        { customer_phone: { contains: '홍' } },
        { id: { equals: '홍' } },
      ],
    });
  });

  it('propagates STORE_NOT_FOUND and skips the queries', async () => {
    const { service, prisma, adminStoreService } = createService();
    adminStoreService.getStoreOrThrow.mockRejectedValue(
      new NotFoundException({ code: 'STORE_NOT_FOUND' }),
    );

    await expect(
      service.listStoreReservations('missing', query()),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.reservations.findMany).not.toHaveBeenCalled();
    expect(prisma.reservations.count).not.toHaveBeenCalled();
  });

  it('propagates range errors (from > to) before querying', async () => {
    const { service, prisma } = createService();

    const promise = service.listStoreReservations(
      'store_a',
      query({ from: '2026-09-30', to: '2026-09-01' }),
    );

    await expect(promise).rejects.toThrow(BadRequestException);
    await expect(promise).rejects.toMatchObject({
      response: { code: 'INVALID_DATE_RANGE' },
    });
    expect(prisma.reservations.findMany).not.toHaveBeenCalled();
  });

  it('returns an empty page with the real total when the page is out of range', async () => {
    const { service } = createService([], 3);

    const result = await service.listStoreReservations(
      'store_a',
      query({ page: 9 }),
    );

    expect(result).toEqual({ items: [], page: 9, limit: 20, total: 3 });
  });
});
