import { Injectable } from '@nestjs/common';
import { Prisma, payments_status, reservations_status } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import {
  getKstDateRange,
  KstDateRange,
} from '../../dashboard/utils/kst-date-range.util';
import { ADMIN_DEFAULT_RANGE_DAYS } from '../admin.constants';
import {
  AdminPlatformTimeseriesResponseDto,
  AdminStoreTimeseriesQueryDto,
  AdminStoreTimeseriesResponseDto,
  AdminTimeseriesBucketDto,
  AdminTimeseriesGranularity,
} from '../dto/admin-store-ops.dto';
import {
  BucketGranularity,
  buildBucketKeys,
  coalesceStatus,
  isPaidRevenueRow,
  isRepresentative,
  toBucketKey,
} from '../utils/store-ops-metrics.util';
import { AdminStoreService } from './admin-store.service';

const PAYMENT_REVENUE_STATUSES: payments_status[] = [
  payments_status.SUCCESS,
  payments_status.CANCELED,
  payments_status.REFUNDED,
];

const PAYMENT_REFUND_STATUSES: payments_status[] = [
  payments_status.CANCELED,
  payments_status.REFUNDED,
];

const GRANULARITY: Record<AdminTimeseriesGranularity, BucketGranularity> = {
  [AdminTimeseriesGranularity.Day]: 'day',
  [AdminTimeseriesGranularity.Week]: 'week',
  [AdminTimeseriesGranularity.Month]: 'month',
};

const RESERVATION_SELECT = {
  id: true,
  reservation_group_id: true,
  status: true,
  payment_status: true,
  total_amount: true,
  created_at: true,
} satisfies Prisma.reservationsSelect;

const PAYMENT_SELECT = {
  amount_total: true,
  status: true,
  paid_at: true,
  canceled_at: true,
} satisfies Prisma.paymentsSelect;

/**
 * 4.3 매장별 추이 · 4.5 플랫폼 전체 추이 (store-operations.md §7.4).
 *
 * Prisma groupBy는 날짜 절단을 지원하지 않고 raw SQL은 세션 타임존에 의존하므로,
 * 기간 내 행을 읽어 메모리에서 KST 기준으로 버킷에 누적한다. 두 엔드포인트는
 * storeId 유무만 다른 같은 함수를 쓴다.
 */
@Injectable()
export class AdminStoreTimeseriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminStoreService: AdminStoreService,
  ) {}

  async getStoreTimeseries(
    storeId: string,
    query: AdminStoreTimeseriesQueryDto,
  ): Promise<AdminStoreTimeseriesResponseDto> {
    const range = getKstDateRange(query, ADMIN_DEFAULT_RANGE_DAYS);
    await this.adminStoreService.getStoreOrThrow(storeId);

    return {
      storeId,
      ...(await this.buildTimeseries(range, query.granularity, storeId)),
    };
  }

  async getPlatformTimeseries(
    query: AdminStoreTimeseriesQueryDto,
  ): Promise<AdminPlatformTimeseriesResponseDto> {
    const range = getKstDateRange(query, ADMIN_DEFAULT_RANGE_DAYS);

    return this.buildTimeseries(range, query.granularity);
  }

  private async buildTimeseries(
    range: KstDateRange,
    granularity: AdminTimeseriesGranularity,
    storeId?: string,
  ): Promise<AdminPlatformTimeseriesResponseDto> {
    const bucketGranularity = GRANULARITY[granularity];
    const createdAt = { gte: range.start, lt: range.endExclusive };
    const storeScope = storeId ? { store_id: storeId } : {};

    const [reservations, payments] = await Promise.all([
      this.prisma.reservations.findMany({
        where: { ...storeScope, created_at: createdAt },
        select: RESERVATION_SELECT,
      }),
      this.prisma.payments.findMany({
        where: {
          ...storeScope,
          status: { in: PAYMENT_REVENUE_STATUSES },
          OR: [{ paid_at: createdAt }, { canceled_at: createdAt }],
        },
        select: PAYMENT_SELECT,
      }),
    ]);

    // 기간 내 모든 버킷을 0으로 먼저 채운다(데이터가 없는 날/주/월도 응답에 포함).
    const buckets = new Map<string, AdminTimeseriesBucketDto>(
      buildBucketKeys(range.dates, bucketGranularity).map((date) => [
        date,
        {
          date,
          reservationRevenue: 0,
          paymentRevenue: 0,
          refundedAmount: 0,
          reservationCount: 0,
          completedCount: 0,
          cancelledCount: 0,
          rejectedCount: 0,
          noShowCount: 0,
        },
      ]),
    );
    const bucketFor = (date: Date): AdminTimeseriesBucketDto | undefined =>
      buckets.get(toBucketKey(date, bucketGranularity));
    const inRange = (date: Date | null): date is Date =>
      date !== null && date >= range.start && date < range.endExclusive;

    for (const row of reservations) {
      if (!row.created_at) {
        continue;
      }

      const bucket = bucketFor(row.created_at);

      if (!bucket) {
        continue;
      }

      // 매출은 멤버 행을 포함한 모든 paid 행, 건수는 그룹 대표 행만(§5).
      if (isPaidRevenueRow(row)) {
        bucket.reservationRevenue += row.total_amount;
      }

      if (!isRepresentative(row)) {
        continue;
      }

      bucket.reservationCount += 1;

      switch (coalesceStatus(row.status)) {
        case reservations_status.completed:
          bucket.completedCount += 1;
          break;
        case reservations_status.cancelled:
          bucket.cancelledCount += 1;
          break;
        case reservations_status.rejected:
          bucket.rejectedCount += 1;
          break;
        case reservations_status.no_show:
          bucket.noShowCount += 1;
          break;
        default:
          break;
      }
    }

    // OR 조회라 paid_at·canceled_at 중 하나만 기간 안일 수 있으므로 각자 다시 검사한다.
    for (const row of payments) {
      if (inRange(row.paid_at)) {
        const bucket = bucketFor(row.paid_at);

        if (bucket) {
          bucket.paymentRevenue += row.amount_total;
        }
      }

      if (
        PAYMENT_REFUND_STATUSES.includes(row.status) &&
        inRange(row.canceled_at)
      ) {
        const bucket = bucketFor(row.canceled_at);

        if (bucket) {
          bucket.refundedAmount += row.amount_total;
        }
      }
    }

    return {
      granularity,
      range: { from: range.from, to: range.to },
      buckets: [...buckets.values()],
    };
  }
}
