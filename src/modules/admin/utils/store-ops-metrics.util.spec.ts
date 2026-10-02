import {
  reservations_payment_status,
  reservations_status,
} from '@prisma/client';
import {
  buildBucketKeys,
  buildMetrics,
  coalesceStatus,
  emptyMetrics,
  emptyMetricsInput,
  isPaidRevenueRow,
  isRepresentative,
  kstWeekStart,
  rate,
  representativeReservationWhere,
  sumMetricsInputs,
  toBucketKey,
} from './store-ops-metrics.util';

describe('store-ops-metrics.util', () => {
  describe('representativeReservationWhere', () => {
    it('builds (reservation_group_id IS NULL OR reservation_group_id = id) via a field ref', () => {
      const idRef = { __fieldRef: 'reservations.id' };
      const prisma = { reservations: { fields: { id: idRef } } };

      expect(representativeReservationWhere(prisma as never)).toEqual({
        OR: [
          { reservation_group_id: null },
          { reservation_group_id: { equals: idRef } },
        ],
      });
    });

    it('isRepresentative mirrors the where fragment on rows', () => {
      expect(isRepresentative({ id: 'r1', reservation_group_id: null })).toBe(
        true,
      );
      expect(isRepresentative({ id: 'r1', reservation_group_id: 'r1' })).toBe(
        true,
      );
      expect(isRepresentative({ id: 'r2', reservation_group_id: 'r1' })).toBe(
        false,
      );
    });
  });

  it('isPaidRevenueRow accepts only payment_status = paid', () => {
    expect(
      isPaidRevenueRow({ payment_status: reservations_payment_status.paid }),
    ).toBe(true);
    expect(
      isPaidRevenueRow({ payment_status: reservations_payment_status.pending }),
    ).toBe(false);
    expect(
      isPaidRevenueRow({
        payment_status: reservations_payment_status.refunded,
      }),
    ).toBe(false);
    expect(isPaidRevenueRow({ payment_status: null })).toBe(false);
  });

  it('coalesceStatus treats NULL as pending', () => {
    expect(coalesceStatus(null)).toBe(reservations_status.pending);
    expect(coalesceStatus(undefined)).toBe(reservations_status.pending);
    expect(coalesceStatus(reservations_status.no_show)).toBe(
      reservations_status.no_show,
    );
  });

  describe('rate', () => {
    it('returns null when the denominator is 0', () => {
      expect(rate(0, 0)).toBeNull();
      expect(rate(5, 0)).toBeNull();
    });

    it('rounds to one decimal', () => {
      expect(rate(1, 3)).toBe(33.3);
      expect(rate(2, 3)).toBe(66.7);
      expect(rate(4, 4)).toBe(100);
      expect(rate(0, 4)).toBe(0);
    });
  });

  describe('buildMetrics', () => {
    it('derives counts and rates and keeps the invariant', () => {
      const metrics = buildMetrics({
        reservationRevenue: 1250000,
        paymentRevenue: 980000,
        refundedAmount: 30000,
        paymentCount: 41,
        statusCounts: {
          pending: 1,
          pending_approval: 1,
          confirmed: 3,
          in_progress: 2,
          completed: 55,
          cancelled: 6,
          rejected: 1,
          no_show: 4,
        },
      });

      expect(metrics).toEqual({
        reservationRevenue: 1250000,
        paymentRevenue: 980000,
        refundedAmount: 30000,
        paymentCount: 41,
        reservationCount: 73,
        pendingCount: 2,
        activeCount: 5,
        completedCount: 55,
        cancelledCount: 6,
        rejectedCount: 1,
        noShowCount: 4,
        noShowRate: 6.8,
        completionRate: 75.3,
        cancellationRate: 9.6,
      });
      expect(metrics.reservationCount).toBe(
        metrics.pendingCount +
          metrics.activeCount +
          metrics.completedCount +
          metrics.cancelledCount +
          metrics.rejectedCount +
          metrics.noShowCount,
      );
    });

    it('emptyMetrics has zero counts and null rates', () => {
      expect(emptyMetrics()).toMatchObject({
        reservationRevenue: 0,
        reservationCount: 0,
        noShowCount: 0,
        noShowRate: null,
        completionRate: null,
        cancellationRate: null,
      });
    });

    it('noShowRate ignores cancelled/rejected/pending in the denominator', () => {
      const metrics = buildMetrics({
        ...emptyMetricsInput(),
        statusCounts: {
          pending: 10,
          pending_approval: 0,
          confirmed: 10,
          in_progress: 0,
          completed: 3,
          cancelled: 10,
          rejected: 10,
          no_show: 1,
        },
      });

      expect(metrics.noShowRate).toBe(25);
      expect(metrics.completionRate).toBe(6.8);
      expect(metrics.cancellationRate).toBe(45.5);
    });
  });

  it('sumMetricsInputs adds every field so totals recompute rates as weighted averages', () => {
    const a = {
      reservationRevenue: 100,
      paymentRevenue: 50,
      refundedAmount: 0,
      paymentCount: 1,
      statusCounts: {
        ...emptyMetricsInput().statusCounts,
        completed: 1,
        no_show: 1,
      },
    };
    const b = {
      reservationRevenue: 300,
      paymentRevenue: 150,
      refundedAmount: 20,
      paymentCount: 2,
      statusCounts: {
        ...emptyMetricsInput().statusCounts,
        completed: 7,
        no_show: 1,
      },
    };

    const total = buildMetrics(sumMetricsInputs([a, b]));

    expect(total).toMatchObject({
      reservationRevenue: 400,
      paymentRevenue: 200,
      refundedAmount: 20,
      paymentCount: 3,
      reservationCount: 10,
      completedCount: 8,
      noShowCount: 2,
      noShowRate: 20, // 2 / 10, not the mean of 50% and 12.5%
    });
    expect(a.statusCounts.completed).toBe(1); // inputs are not mutated
  });

  describe('kstWeekStart (Monday-based)', () => {
    it.each([
      ['2026-09-02', '2026-08-31'], // 수 → 월
      ['2026-08-31', '2026-08-31'], // 월 → 자기 자신
      ['2026-09-06', '2026-08-31'], // 일 → 그 주 월요일
      ['2026-09-07', '2026-09-07'], // 다음 주 월요일
      ['2026-01-01', '2025-12-29'], // 연도 경계
    ])('%s → %s', (input, expected) => {
      expect(kstWeekStart(input)).toBe(expected);
    });
  });

  describe('toBucketKey', () => {
    it('uses the KST day boundary (UTC 15:00)', () => {
      expect(toBucketKey(new Date('2026-09-01T14:59:59.000Z'), 'day')).toBe(
        '2026-09-01',
      );
      expect(toBucketKey(new Date('2026-09-01T15:00:00.000Z'), 'day')).toBe(
        '2026-09-02',
      );
    });

    it('maps to week (Monday) and month keys', () => {
      const wednesday = new Date('2026-09-02T03:00:00.000Z');

      expect(toBucketKey(wednesday, 'week')).toBe('2026-08-31');
      expect(toBucketKey(wednesday, 'month')).toBe('2026-09');
    });
  });

  describe('buildBucketKeys', () => {
    const dates = [
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
    ];

    it('keeps every day for day granularity', () => {
      expect(buildBucketKeys(dates, 'day')).toEqual(dates);
    });

    it('collapses to unique Mondays, keeping a partial first week', () => {
      expect(buildBucketKeys(dates, 'week')).toEqual([
        '2026-08-31',
        '2026-09-07',
      ]);
    });

    it('collapses to unique months across a boundary', () => {
      expect(
        buildBucketKeys(['2026-08-30', '2026-08-31', '2026-09-01'], 'month'),
      ).toEqual(['2026-08', '2026-09']);
    });
  });
});
