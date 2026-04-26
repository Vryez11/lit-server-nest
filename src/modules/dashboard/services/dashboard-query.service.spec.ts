/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  payments_status,
  reservations_status,
  storages_status,
  storages_type,
} from '@prisma/client';
import { DashboardQueryService } from './dashboard-query.service';

const createDashboardQueryService = () => {
  const prisma = {
    reservations: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    payments: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    storages: {
      groupBy: jest.fn(),
      count: jest.fn(),
    },
  };

  return {
    service: new DashboardQueryService(prisma as never),
    prisma,
  };
};

describe('DashboardQueryService', () => {
  it('returns a realtime dashboard summary for the current store only', async () => {
    const { service, prisma } = createDashboardQueryService();

    prisma.reservations.groupBy.mockResolvedValue([
      { status: reservations_status.confirmed, _count: { _all: 2 } },
      { status: reservations_status.completed, _count: { _all: 1 } },
    ]);
    prisma.payments.aggregate.mockResolvedValue({
      _sum: { amount_total: 15000 },
      _count: { _all: 3 },
    });
    prisma.storages.groupBy.mockResolvedValue([
      { status: storages_status.available, _count: { _all: 4 } },
      { status: storages_status.occupied, _count: { _all: 1 } },
    ]);
    prisma.storages.count.mockResolvedValue(5);

    const result = await service.getSummary('store_1');

    expect(prisma.reservations.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ store_id: 'store_1' }),
      }),
    );
    expect(prisma.payments.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          store_id: 'store_1',
          status: payments_status.SUCCESS,
        }),
      }),
    );
    expect(result.reservations.total).toBe(3);
    expect(result.reservations.confirmed).toBe(2);
    expect(result.revenue.totalRevenue).toBe(15000);
    expect(result.storages.total).toBe(5);
  });

  it('fills missing revenue dates with zero values', async () => {
    const { service, prisma } = createDashboardQueryService();

    prisma.payments.findMany.mockResolvedValue([
      {
        amount_total: 7000,
        paid_at: new Date('2026-04-01T03:00:00+09:00'),
      },
      {
        amount_total: 3000,
        paid_at: new Date('2026-04-03T12:00:00+09:00'),
      },
    ]);

    const result = await service.getRevenue('store_1', {
      from: '2026-04-01',
      to: '2026-04-03',
    });

    expect(prisma.payments.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ store_id: 'store_1' }),
      }),
    );
    expect(result.items).toEqual([
      { date: '2026-04-01', revenue: 7000, paymentCount: 1 },
      { date: '2026-04-02', revenue: 0, paymentCount: 0 },
      { date: '2026-04-03', revenue: 3000, paymentCount: 1 },
    ]);
    expect(result.totalRevenue).toBe(10000);
  });

  it('groups storage counts by type and status', async () => {
    const { service, prisma } = createDashboardQueryService();

    prisma.storages.groupBy.mockResolvedValue([
      {
        type: storages_type.s,
        status: storages_status.available,
        _count: { _all: 2 },
      },
      {
        type: storages_type.s,
        status: storages_status.maintenance,
        _count: { _all: 1 },
      },
      {
        type: storages_type.refrigeration,
        status: storages_status.occupied,
        _count: { _all: 1 },
      },
    ]);

    const result = await service.getStorages('store_1');
    const small = result.byType.find((item) => item.type === storages_type.s);
    const refrigeration = result.byType.find(
      (item) => item.type === storages_type.refrigeration,
    );

    expect(result.total).toBe(4);
    expect(result.byStatus.available).toBe(2);
    expect(result.byStatus.maintenance).toBe(1);
    expect(small).toEqual(
      expect.objectContaining({
        total: 3,
        available: 2,
        maintenance: 1,
      }),
    );
    expect(refrigeration).toEqual(
      expect.objectContaining({
        total: 1,
        occupied: 1,
      }),
    );
  });
});
