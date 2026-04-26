import { Injectable } from '@nestjs/common';
import {
  payments_status,
  reservations_status,
  storages_status,
  storages_type,
} from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { DashboardDateRangeQueryDto } from '../dto/dashboard-query.dto';
import {
  DashboardReservationDailyItemDto,
  DashboardReservationStatusCountsDto,
  DashboardReservationsResponseDto,
  DashboardRevenueDailyItemDto,
  DashboardRevenueResponseDto,
  DashboardStorageStatusCountsDto,
  DashboardStorageTypeItemDto,
  DashboardStoragesResponseDto,
  DashboardSummaryResponseDto,
} from '../dto/dashboard-response.dto';
import {
  getKstDateRange,
  getKstDateString,
} from '../utils/kst-date-range.util';

@Injectable()
export class DashboardQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(storeId: string): Promise<DashboardSummaryResponseDto> {
    const today = getKstDateString();
    const range = getKstDateRange({ from: today, to: today }, 1);

    const [reservationRows, revenue, storageRows, totalStorages] =
      await Promise.all([
        this.prisma.reservations.groupBy({
          by: ['status'],
          where: {
            store_id: storeId,
            start_time: {
              gte: range.start,
              lt: range.endExclusive,
            },
          },
          _count: { _all: true },
        }),
        this.prisma.payments.aggregate({
          where: {
            store_id: storeId,
            status: payments_status.SUCCESS,
            paid_at: {
              gte: range.start,
              lt: range.endExclusive,
            },
          },
          _sum: { amount_total: true },
          _count: { _all: true },
        }),
        this.prisma.storages.groupBy({
          by: ['status'],
          where: { store_id: storeId },
          _count: { _all: true },
        }),
        this.prisma.storages.count({
          where: { store_id: storeId },
        }),
      ]);

    const reservationCounts = this.createReservationStatusCounts();
    for (const row of reservationRows) {
      this.addReservationStatusCount(
        reservationCounts,
        row.status ?? reservations_status.pending,
        row._count._all,
      );
    }

    const storageCounts = this.createStorageStatusCounts();
    for (const row of storageRows) {
      this.addStorageStatusCount(
        storageCounts,
        row.status ?? storages_status.available,
        row._count._all,
      );
    }

    return {
      date: today,
      reservations: {
        total: this.sumReservationCounts(reservationCounts),
        ...reservationCounts,
      },
      revenue: {
        totalRevenue: revenue._sum.amount_total ?? 0,
        paidPaymentCount: revenue._count._all,
      },
      storages: {
        total: totalStorages,
        ...storageCounts,
      },
    };
  }

  async getRevenue(
    storeId: string,
    query: DashboardDateRangeQueryDto,
  ): Promise<DashboardRevenueResponseDto> {
    const range = getKstDateRange(query);
    const buckets = new Map<string, DashboardRevenueDailyItemDto>(
      range.dates.map((date) => [
        date,
        {
          date,
          revenue: 0,
          paymentCount: 0,
        },
      ]),
    );
    const payments = await this.prisma.payments.findMany({
      where: {
        store_id: storeId,
        status: payments_status.SUCCESS,
        paid_at: {
          gte: range.start,
          lt: range.endExclusive,
        },
      },
      select: {
        amount_total: true,
        paid_at: true,
      },
      orderBy: { paid_at: 'asc' },
    });

    for (const payment of payments) {
      if (!payment.paid_at) {
        continue;
      }

      const date = getKstDateString(payment.paid_at);
      const bucket = buckets.get(date);

      if (bucket) {
        bucket.revenue += payment.amount_total;
        bucket.paymentCount += 1;
      }
    }

    const items = [...buckets.values()];

    return {
      from: range.from,
      to: range.to,
      totalRevenue: items.reduce((sum, item) => sum + item.revenue, 0),
      paidPaymentCount: items.reduce((sum, item) => sum + item.paymentCount, 0),
      items,
    };
  }

  async getReservations(
    storeId: string,
    query: DashboardDateRangeQueryDto,
  ): Promise<DashboardReservationsResponseDto> {
    const range = getKstDateRange(query);
    const buckets = new Map<string, DashboardReservationDailyItemDto>(
      range.dates.map((date) => [
        date,
        {
          date,
          total: 0,
          ...this.createReservationStatusCounts(),
        },
      ]),
    );
    const byStatus = this.createReservationStatusCounts();
    const reservations = await this.prisma.reservations.findMany({
      where: {
        store_id: storeId,
        start_time: {
          gte: range.start,
          lt: range.endExclusive,
        },
      },
      select: {
        status: true,
        start_time: true,
      },
      orderBy: { start_time: 'asc' },
    });

    for (const reservation of reservations) {
      const status = reservation.status ?? reservations_status.pending;
      const date = getKstDateString(reservation.start_time);
      const bucket = buckets.get(date);

      this.addReservationStatusCount(byStatus, status, 1);

      if (bucket) {
        bucket.total += 1;
        this.addReservationStatusCount(bucket, status, 1);
      }
    }

    return {
      from: range.from,
      to: range.to,
      totalReservations: this.sumReservationCounts(byStatus),
      byStatus,
      items: [...buckets.values()],
    };
  }

  async getStorages(storeId: string): Promise<DashboardStoragesResponseDto> {
    const rows = await this.prisma.storages.groupBy({
      by: ['type', 'status'],
      where: { store_id: storeId },
      _count: { _all: true },
    });
    const byStatus = this.createStorageStatusCounts();
    const byType = new Map<storages_type, DashboardStorageTypeItemDto>();

    for (const type of Object.values(storages_type)) {
      byType.set(type, {
        type,
        total: 0,
        ...this.createStorageStatusCounts(),
      });
    }

    for (const row of rows) {
      const status = row.status ?? storages_status.available;
      const count = row._count._all;
      const typeBucket = byType.get(row.type);

      this.addStorageStatusCount(byStatus, status, count);

      if (typeBucket) {
        typeBucket.total += count;
        this.addStorageStatusCount(typeBucket, status, count);
      }
    }

    return {
      total: this.sumStorageCounts(byStatus),
      byStatus,
      byType: [...byType.values()],
    };
  }

  private createReservationStatusCounts(): DashboardReservationStatusCountsDto {
    return {
      pending: 0,
      pendingApproval: 0,
      confirmed: 0,
      rejected: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
    };
  }

  private addReservationStatusCount(
    counts: DashboardReservationStatusCountsDto,
    status: reservations_status,
    count: number,
  ): void {
    const statusFields: Record<reservations_status, keyof DashboardReservationStatusCountsDto> =
      {
        pending: 'pending',
        pending_approval: 'pendingApproval',
        confirmed: 'confirmed',
        rejected: 'rejected',
        in_progress: 'inProgress',
        completed: 'completed',
        cancelled: 'cancelled',
      };

    counts[statusFields[status]] += count;
  }

  private sumReservationCounts(
    counts: DashboardReservationStatusCountsDto,
  ): number {
    return Object.values(counts).reduce((sum, count) => sum + count, 0);
  }

  private createStorageStatusCounts(): DashboardStorageStatusCountsDto {
    return {
      available: 0,
      occupied: 0,
      maintenance: 0,
    };
  }

  private addStorageStatusCount(
    counts: DashboardStorageStatusCountsDto,
    status: storages_status,
    count: number,
  ): void {
    counts[status] += count;
  }

  private sumStorageCounts(counts: DashboardStorageStatusCountsDto): number {
    return Object.values(counts).reduce((sum, count) => sum + count, 0);
  }
}
