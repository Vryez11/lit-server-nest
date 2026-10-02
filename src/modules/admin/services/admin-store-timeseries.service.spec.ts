/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  payments_status,
  reservations_payment_status,
  reservations_status,
} from '@prisma/client';
import {
  AdminStoreTimeseriesQueryDto,
  AdminTimeseriesGranularity,
} from '../dto/admin-store-ops.dto';
import { AdminStoreTimeseriesService } from './admin-store-timeseries.service';

type ReservationRow = {
  id: string;
  reservation_group_id: string | null;
  status: reservations_status | null;
  payment_status: reservations_payment_status | null;
  total_amount: number;
  created_at: Date | null;
};

type PaymentRow = {
  amount_total: number;
  status: payments_status;
  paid_at: Date | null;
  canceled_at: Date | null;
};

const reservation = (
  overrides: Partial<ReservationRow> & { id: string; created_at: Date },
): ReservationRow => ({
  reservation_group_id: overrides.id,
  status: reservations_status.completed,
  payment_status: reservations_payment_status.paid,
  total_amount: 1000,
  ...overrides,
});

const createService = (
  reservations: ReservationRow[] = [],
  payments: PaymentRow[] = [],
) => {
  const prisma = {
    reservations: { findMany: jest.fn().mockResolvedValue(reservations) },
    payments: { findMany: jest.fn().mockResolvedValue(payments) },
  };
  const adminStoreService = {
    getStoreOrThrow: jest.fn().mockResolvedValue({ id: 'store_a' }),
  };
  const service = new AdminStoreTimeseriesService(
    prisma as never,
    adminStoreService as never,
  );

  return { service, prisma, adminStoreService };
};

const query = (
  overrides: Partial<AdminStoreTimeseriesQueryDto> = {},
): AdminStoreTimeseriesQueryDto => ({
  from: '2026-09-01',
  to: '2026-09-07',
  granularity: AdminTimeseriesGranularity.Day,
  ...overrides,
});

const nonZero = (buckets: Array<Record<string, unknown>>) =>
  buckets.filter((bucket) =>
    Object.entries(bucket).some(
      ([key, value]) => key !== 'date' && value !== 0,
    ),
  );

describe('AdminStoreTimeseriesService', () => {
  describe('bucket skeleton (0 채움)', () => {
    it('returns every day in the range with zeros when there is no data', async () => {
      const { service } = createService();

      const result = await service.getPlatformTimeseries(query());

      expect(result.granularity).toBe('day');
      expect(result.range).toEqual({ from: '2026-09-01', to: '2026-09-07' });
      expect(result.buckets.map((bucket) => bucket.date)).toEqual([
        '2026-09-01',
        '2026-09-02',
        '2026-09-03',
        '2026-09-04',
        '2026-09-05',
        '2026-09-06',
        '2026-09-07',
      ]);
      expect(result.buckets[0]).toEqual({
        date: '2026-09-01',
        reservationRevenue: 0,
        paymentRevenue: 0,
        refundedAmount: 0,
        reservationCount: 0,
        completedCount: 0,
        cancelledCount: 0,
        rejectedCount: 0,
        noShowCount: 0,
      });
    });

    it('uses Monday-start week keys and keeps partial weeks at both ends', async () => {
      const { service } = createService();

      const result = await service.getPlatformTimeseries(
        query({
          from: '2026-09-02', // 수요일
          to: '2026-09-15', // 화요일
          granularity: AdminTimeseriesGranularity.Week,
        }),
      );

      expect(result.buckets.map((bucket) => bucket.date)).toEqual([
        '2026-08-31',
        '2026-09-07',
        '2026-09-14',
      ]);
    });

    it('uses YYYY-MM keys across a month boundary', async () => {
      const { service } = createService();

      const result = await service.getPlatformTimeseries(
        query({
          from: '2026-08-30',
          to: '2026-09-02',
          granularity: AdminTimeseriesGranularity.Month,
        }),
      );

      expect(result.buckets.map((bucket) => bucket.date)).toEqual([
        '2026-08',
        '2026-09',
      ]);
    });
  });

  describe('reservation accumulation', () => {
    it('buckets by KST day, counts representative rows only, and sums revenue over every paid row', async () => {
      const { service } = createService([
        // 2026-09-01 14:59Z = KST 9/1 23:59 → 9/1 버킷
        reservation({
          id: 'g1',
          created_at: new Date('2026-09-01T14:59:59.000Z'),
          total_amount: 4500,
        }),
        // 같은 그룹의 멤버 행: 매출에는 포함, 건수에는 미포함
        reservation({
          id: 'g1-m',
          reservation_group_id: 'g1',
          created_at: new Date('2026-09-01T14:59:59.000Z'),
          total_amount: 6000,
        }),
        // 2026-09-01 15:00Z = KST 9/2 00:00 → 9/2 버킷, 레거시 NULL 그룹 = 대표
        reservation({
          id: 'legacy',
          reservation_group_id: null,
          status: reservations_status.no_show,
          payment_status: reservations_payment_status.pending,
          created_at: new Date('2026-09-01T15:00:00.000Z'),
          total_amount: 8000,
        }),
        reservation({
          id: 'g2',
          status: reservations_status.cancelled,
          payment_status: reservations_payment_status.refunded,
          created_at: new Date('2026-09-03T03:00:00.000Z'),
        }),
        reservation({
          id: 'g3',
          status: reservations_status.rejected,
          payment_status: null,
          created_at: new Date('2026-09-03T04:00:00.000Z'),
        }),
        // status NULL → pending: reservationCount에만 반영
        reservation({
          id: 'g4',
          status: null,
          payment_status: reservations_payment_status.paid,
          created_at: new Date('2026-09-03T05:00:00.000Z'),
          total_amount: 2000,
        }),
      ]);

      const { buckets } = await service.getPlatformTimeseries(query());

      expect(nonZero(buckets)).toEqual([
        {
          date: '2026-09-01',
          reservationRevenue: 10500, // 4500 + 6000 (멤버 포함)
          paymentRevenue: 0,
          refundedAmount: 0,
          reservationCount: 1, // 대표 행만
          completedCount: 1,
          cancelledCount: 0,
          rejectedCount: 0,
          noShowCount: 0,
        },
        {
          date: '2026-09-02',
          reservationRevenue: 0, // pending 결제는 매출 아님
          paymentRevenue: 0,
          refundedAmount: 0,
          reservationCount: 1,
          completedCount: 0,
          cancelledCount: 0,
          rejectedCount: 0,
          noShowCount: 1,
        },
        {
          date: '2026-09-03',
          reservationRevenue: 2000, // refunded·NULL 결제 제외, paid만
          paymentRevenue: 0,
          refundedAmount: 0,
          reservationCount: 3,
          completedCount: 0,
          cancelledCount: 1,
          rejectedCount: 1,
          noShowCount: 0,
        },
      ]);
    });

    it('folds days into the Monday bucket for week granularity (partial first week)', async () => {
      const { service } = createService([
        reservation({
          id: 'a',
          created_at: new Date('2026-09-02T03:00:00.000Z'),
        }), // 수
        reservation({
          id: 'b',
          created_at: new Date('2026-09-06T03:00:00.000Z'),
        }), // 일
        reservation({
          id: 'c',
          created_at: new Date('2026-09-07T03:00:00.000Z'),
        }), // 다음 주 월
      ]);

      const { buckets } = await service.getPlatformTimeseries(
        query({
          from: '2026-09-02',
          to: '2026-09-08',
          granularity: AdminTimeseriesGranularity.Week,
        }),
      );

      expect(buckets.map((b) => [b.date, b.reservationCount])).toEqual([
        ['2026-08-31', 2],
        ['2026-09-07', 1],
      ]);
    });
  });

  describe('payment accumulation', () => {
    it('puts paid_at into paymentRevenue and canceled_at into refundedAmount, each on its own day', async () => {
      const { service } = createService(
        [],
        [
          // 정상 결제: 매출만
          {
            amount_total: 10000,
            status: payments_status.SUCCESS,
            paid_at: new Date('2026-09-01T03:00:00.000Z'),
            canceled_at: null,
          },
          // 지난달 결제가 이번 기간에 환불: 환불액만 (paid_at은 기간 밖)
          {
            amount_total: 7000,
            status: payments_status.REFUNDED,
            paid_at: new Date('2026-08-20T03:00:00.000Z'),
            canceled_at: new Date('2026-09-02T03:00:00.000Z'),
          },
          // 기간 내 결제 후 기간 내 취소: 매출과 환불 둘 다, 각자의 날짜에
          {
            amount_total: 5000,
            status: payments_status.CANCELED,
            paid_at: new Date('2026-09-03T03:00:00.000Z'),
            canceled_at: new Date('2026-09-05T03:00:00.000Z'),
          },
          // SUCCESS인데 canceled_at만 있는 비정상 행: 환불로 세지 않는다
          {
            amount_total: 999,
            status: payments_status.SUCCESS,
            paid_at: null,
            canceled_at: new Date('2026-09-06T03:00:00.000Z'),
          },
        ],
      );

      const { buckets } = await service.getPlatformTimeseries(query());

      expect(
        nonZero(buckets).map((b) => [
          b.date,
          b.paymentRevenue,
          b.refundedAmount,
        ]),
      ).toEqual([
        ['2026-09-01', 10000, 0],
        ['2026-09-02', 0, 7000],
        ['2026-09-03', 5000, 0],
        ['2026-09-05', 0, 5000],
      ]);
    });

    it('queries payments by revenue statuses with paid_at OR canceled_at in range', async () => {
      const { service, prisma } = createService();

      await service.getPlatformTimeseries(query());

      expect(prisma.payments.findMany).toHaveBeenCalledWith({
        where: {
          status: {
            in: [
              payments_status.SUCCESS,
              payments_status.CANCELED,
              payments_status.REFUNDED,
            ],
          },
          OR: [
            {
              paid_at: {
                gte: new Date('2026-08-31T15:00:00.000Z'),
                lt: new Date('2026-09-07T15:00:00.000Z'),
              },
            },
            {
              canceled_at: {
                gte: new Date('2026-08-31T15:00:00.000Z'),
                lt: new Date('2026-09-07T15:00:00.000Z'),
              },
            },
          ],
        },
        select: expect.any(Object),
      });
    });
  });

  describe('store vs platform scope', () => {
    it('scopes both queries to the store, checks existence first, and echoes storeId', async () => {
      const { service, prisma, adminStoreService } = createService();

      const result = await service.getStoreTimeseries('store_a', query());

      expect(adminStoreService.getStoreOrThrow).toHaveBeenCalledWith('store_a');
      expect(prisma.reservations.findMany).toHaveBeenCalledWith({
        where: {
          store_id: 'store_a',
          created_at: {
            gte: new Date('2026-08-31T15:00:00.000Z'),
            lt: new Date('2026-09-07T15:00:00.000Z'),
          },
        },
        select: {
          id: true,
          reservation_group_id: true,
          status: true,
          payment_status: true,
          total_amount: true,
          created_at: true,
        },
      });
      expect(prisma.payments.findMany.mock.calls[0][0].where.store_id).toBe(
        'store_a',
      );
      expect(result.storeId).toBe('store_a');
    });

    it('propagates STORE_NOT_FOUND and does not query rows', async () => {
      const { service, prisma, adminStoreService } = createService();
      adminStoreService.getStoreOrThrow.mockRejectedValue(
        new NotFoundException({ code: 'STORE_NOT_FOUND' }),
      );

      await expect(
        service.getStoreTimeseries('missing', query()),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.reservations.findMany).not.toHaveBeenCalled();
    });

    it('platform timeseries omits store_id, skips the store lookup, and has no storeId in the response', async () => {
      const { service, prisma, adminStoreService } = createService();

      const result = await service.getPlatformTimeseries(query());

      expect(adminStoreService.getStoreOrThrow).not.toHaveBeenCalled();
      expect(
        prisma.reservations.findMany.mock.calls[0][0].where,
      ).not.toHaveProperty('store_id');
      expect(
        prisma.payments.findMany.mock.calls[0][0].where,
      ).not.toHaveProperty('store_id');
      expect(result).not.toHaveProperty('storeId');
    });

    it('bucket sums equal the period totals (platform = sum over all stores)', async () => {
      const rows = [
        reservation({
          id: 'a',
          created_at: new Date('2026-09-01T01:00:00.000Z'),
          total_amount: 100,
        }),
        reservation({
          id: 'a-m',
          reservation_group_id: 'a',
          created_at: new Date('2026-09-01T01:00:00.000Z'),
          total_amount: 50,
        }),
        reservation({
          id: 'b',
          status: reservations_status.no_show,
          created_at: new Date('2026-09-04T01:00:00.000Z'),
          total_amount: 300,
        }),
        reservation({
          id: 'c',
          payment_status: reservations_payment_status.pending,
          created_at: new Date('2026-09-06T01:00:00.000Z'),
          total_amount: 700,
        }),
      ];
      const { service } = createService(rows);

      const { buckets } = await service.getPlatformTimeseries(
        query({ granularity: AdminTimeseriesGranularity.Week }),
      );

      const sum = (key: 'reservationCount' | 'reservationRevenue') =>
        buckets.reduce((acc, bucket) => acc + bucket[key], 0);

      expect(sum('reservationCount')).toBe(3); // 대표 행 a, b, c
      expect(sum('reservationRevenue')).toBe(450); // paid 행 a(100) + a-m(50) + b(300)
    });
  });

  it('propagates DATE_RANGE_TOO_LARGE before querying', async () => {
    const { service, prisma } = createService();

    const promise = service.getPlatformTimeseries(
      query({ from: '2025-01-01', to: '2026-12-31' }),
    );

    await expect(promise).rejects.toThrow(BadRequestException);
    await expect(promise).rejects.toMatchObject({
      response: { code: 'DATE_RANGE_TOO_LARGE' },
    });
    expect(prisma.reservations.findMany).not.toHaveBeenCalled();
  });
});
