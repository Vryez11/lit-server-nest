import {
  Prisma,
  reservations_payment_status,
  reservations_status,
} from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { getKstDateString } from '../../dashboard/utils/kst-date-range.util';
import { StoreOpsMetricsDto } from '../dto/admin-store-ops.dto';

/**
 * F-018 지표 계산의 순수 함수 모음. DB where 조각(7.2)과 메모리 필터(7.4)가
 * 같은 의미를 갖도록 대표 행·매출 행·상태 정규화를 한 곳에 둔다.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const RESERVATION_STATUSES: reservations_status[] = [
  reservations_status.pending,
  reservations_status.pending_approval,
  reservations_status.confirmed,
  reservations_status.rejected,
  reservations_status.in_progress,
  reservations_status.completed,
  reservations_status.cancelled,
  reservations_status.no_show,
];

/** `reservation_group_id IS NULL OR reservation_group_id = id` — 그룹 대표 행. */
export const representativeReservationWhere = (
  prisma: PrismaService,
): Prisma.reservationsWhereInput => ({
  OR: [
    { reservation_group_id: null },
    { reservation_group_id: { equals: prisma.reservations.fields.id } },
  ],
});

export const isRepresentative = (row: {
  id: string;
  reservation_group_id: string | null;
}): boolean =>
  row.reservation_group_id === null || row.reservation_group_id === row.id;

/** 예약 기준 매출 대상 행: payment_status = paid (예약 status 무관, F-012 동일). */
export const isPaidRevenueRow = (row: {
  payment_status: reservations_payment_status | null;
}): boolean => row.payment_status === reservations_payment_status.paid;

/** status NULL 행은 pending으로 간주한다. */
export const coalesceStatus = (
  status: reservations_status | null | undefined,
): reservations_status => status ?? reservations_status.pending;

/** 비율(%) 소수 1자리. 분모 0이면 null. */
export const rate = (numerator: number, denominator: number): number | null =>
  denominator === 0
    ? null
    : Number(((numerator / denominator) * 100).toFixed(1));

export type StatusCounts = Record<reservations_status, number>;

export const emptyStatusCounts = (): StatusCounts => ({
  pending: 0,
  pending_approval: 0,
  confirmed: 0,
  rejected: 0,
  in_progress: 0,
  completed: 0,
  cancelled: 0,
  no_show: 0,
});

/** 집계 쿼리 결과를 모은 원시 입력. 비율은 buildMetrics에서 파생한다. */
export type MetricsInput = {
  reservationRevenue: number;
  paymentRevenue: number;
  refundedAmount: number;
  paymentCount: number;
  statusCounts: StatusCounts;
};

export const emptyMetricsInput = (): MetricsInput => ({
  reservationRevenue: 0,
  paymentRevenue: 0,
  refundedAmount: 0,
  paymentCount: 0,
  statusCounts: emptyStatusCounts(),
});

/** 여러 매장의 입력을 합친다(meta.totals용). 비율은 합산 분자/분모로 재계산된다. */
export const sumMetricsInputs = (inputs: MetricsInput[]): MetricsInput =>
  inputs.reduce<MetricsInput>((acc, input) => {
    acc.reservationRevenue += input.reservationRevenue;
    acc.paymentRevenue += input.paymentRevenue;
    acc.refundedAmount += input.refundedAmount;
    acc.paymentCount += input.paymentCount;

    for (const status of RESERVATION_STATUSES) {
      acc.statusCounts[status] += input.statusCounts[status];
    }

    return acc;
  }, emptyMetricsInput());

/**
 * 원시 입력 → 응답 metrics. 불변식
 * reservationCount = pending + active + completed + cancelled + rejected + noShow
 * 가 구성상 항상 성립한다.
 */
export const buildMetrics = (input: MetricsInput): StoreOpsMetricsDto => {
  const counts = input.statusCounts;
  const pendingCount = counts.pending + counts.pending_approval;
  const activeCount = counts.confirmed + counts.in_progress;
  const completedCount = counts.completed;
  const cancelledCount = counts.cancelled;
  const rejectedCount = counts.rejected;
  const noShowCount = counts.no_show;
  const reservationCount =
    pendingCount +
    activeCount +
    completedCount +
    cancelledCount +
    rejectedCount +
    noShowCount;

  return {
    reservationRevenue: input.reservationRevenue,
    paymentRevenue: input.paymentRevenue,
    refundedAmount: input.refundedAmount,
    paymentCount: input.paymentCount,
    reservationCount,
    pendingCount,
    activeCount,
    completedCount,
    cancelledCount,
    rejectedCount,
    noShowCount,
    noShowRate: rate(noShowCount, completedCount + noShowCount),
    completionRate: rate(completedCount, reservationCount),
    cancellationRate: rate(cancelledCount + rejectedCount, reservationCount),
  };
};

export const emptyMetrics = (): StoreOpsMetricsDto =>
  buildMetrics(emptyMetricsInput());

export type BucketGranularity = 'day' | 'week' | 'month';

/**
 * KST 일자(YYYY-MM-DD)가 속한 주의 월요일 일자. Date.UTC로 파싱하므로
 * 실행 환경 타임존의 영향을 받지 않는다. 예: 2026-09-02(수) → 2026-08-31.
 */
export const kstWeekStart = (dateString: string): string => {
  const [year, month, day] = dateString.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const weekday = new Date(utc).getUTCDay(); // 0 = 일요일
  const monday = utc - ((weekday + 6) % 7) * DAY_MS;

  return new Date(monday).toISOString().slice(0, 10);
};

/** KST 일자 문자열 → 버킷 키. */
export const toBucketKeyFromDateString = (
  dateString: string,
  granularity: BucketGranularity,
): string => {
  switch (granularity) {
    case 'day':
      return dateString;
    case 'week':
      return kstWeekStart(dateString);
    case 'month':
      return dateString.slice(0, 7);
  }
};

/** 타임스탬프 → KST 기준 버킷 키. 2026-09-01T15:00:00Z는 KST 9/2다. */
export const toBucketKey = (
  date: Date,
  granularity: BucketGranularity,
): string => toBucketKeyFromDateString(getKstDateString(date), granularity);

/** 기간의 일자 목록 → 순서를 유지한 유니크 버킷 키(0 채움의 뼈대). */
export const buildBucketKeys = (
  dates: string[],
  granularity: BucketGranularity,
): string[] => {
  const keys: string[] = [];
  const seen = new Set<string>();

  for (const date of dates) {
    const key = toBucketKeyFromDateString(date, granularity);

    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }

  return keys;
};
