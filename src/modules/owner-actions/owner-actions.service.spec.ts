/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { reservations_status } from '@prisma/client';
import { OwnerActionsService } from './owner-actions.service';

const createService = () => {
  const tx = {
    reservations: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    storages: { updateMany: jest.fn() },
  };
  const prisma = {
    reservations: { findFirst: jest.fn(), findMany: jest.fn() },
    stores: { findFirst: jest.fn() },
    $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
  };
  const reservationStorageService = {
    releaseStorageIfAny: jest.fn().mockResolvedValue(undefined),
  };
  const notificationsService = {
    sendCheckoutNotification: jest.fn().mockResolvedValue(undefined),
  };
  const service = new OwnerActionsService(
    prisma as never,
    reservationStorageService as never,
    notificationsService as never,
  );
  return {
    service,
    prisma,
    tx,
    reservationStorageService,
    notificationsService,
  };
};

const baseRow = {
  id: 'res_1',
  store_id: 'store_1',
  customer_name: '홍길동',
  customer_phone: '01012345678',
  customer_email: null,
  locale: 'ko',
  status: reservations_status.confirmed,
  start_time: new Date(Date.now() - 60 * 60 * 1000),
  end_time: new Date(Date.now() + 3 * 60 * 60 * 1000),
  actual_start_time: null,
  actual_end_time: null,
  storage_id: 'storage_1',
  qr_code: 'guest-token',
  reservation_group_id: 'res_1',
  requested_storage_type: 's',
  bag_count: 2,
};

describe('OwnerActionsService', () => {
  it('checkIn moves a confirmed group to in_progress', async () => {
    const { service, tx } = createService();
    tx.reservations.findFirst.mockResolvedValue(baseRow);
    tx.reservations.findMany.mockResolvedValue([baseRow]);

    const result = await service.checkIn('res_1');

    expect(tx.reservations.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['res_1'] } }),
        data: expect.objectContaining({
          status: reservations_status.in_progress,
          actual_start_time: expect.any(Date),
        }),
      }),
    );
    expect(result.status).toBe(reservations_status.in_progress);
  });

  it('checkIn rejects a reservation that is not confirmed', async () => {
    const { service, tx } = createService();
    const row = { ...baseRow, status: reservations_status.completed };
    tx.reservations.findFirst.mockResolvedValue(row);
    tx.reservations.findMany.mockResolvedValue([row]);

    await expect(service.checkIn('res_1')).rejects.toMatchObject({
      response: { code: 'INVALID_TRANSITION' },
    });
  });

  it('checkOut completes, releases storage, and sends the review request', async () => {
    const {
      service,
      prisma,
      tx,
      reservationStorageService,
      notificationsService,
    } = createService();
    const row = { ...baseRow, status: reservations_status.in_progress };
    tx.reservations.findFirst.mockResolvedValue(row);
    tx.reservations.findMany.mockResolvedValue([row]);
    prisma.stores.findFirst.mockResolvedValue({ business_name: '테스트 매장' });

    const result = await service.checkOut('res_1');

    expect(tx.reservations.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: reservations_status.completed,
          actual_end_time: expect.any(Date),
        }),
      }),
    );
    expect(reservationStorageService.releaseStorageIfAny).toHaveBeenCalledWith(
      tx,
      'storage_1',
    );
    expect(notificationsService.sendCheckoutNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: 'res_1',
        customerPhone: '01012345678',
        locale: 'ko',
        reviewPath: expect.stringContaining('/review/res_1?token=guest-token'),
      }),
    );
    expect(result.status).toBe(reservations_status.completed);
  });

  it('noShow rejects before start_time', async () => {
    const { service, tx } = createService();
    const row = {
      ...baseRow,
      start_time: new Date(Date.now() + 60 * 60 * 1000),
    };
    tx.reservations.findFirst.mockResolvedValue(row);
    tx.reservations.findMany.mockResolvedValue([row]);

    await expect(service.noShow('res_1')).rejects.toMatchObject({
      response: { code: 'TOO_EARLY_FOR_NO_SHOW' },
    });
  });

  it('noShow marks a past-start confirmed group as no_show and releases storage', async () => {
    const { service, tx, reservationStorageService } = createService();
    tx.reservations.findFirst.mockResolvedValue(baseRow);
    tx.reservations.findMany.mockResolvedValue([baseRow]);

    const result = await service.noShow('res_1');

    expect(tx.reservations.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: reservations_status.no_show }),
      }),
    );
    expect(reservationStorageService.releaseStorageIfAny).toHaveBeenCalled();
    expect(result.status).toBe(reservations_status.no_show);
  });

  it('checkOut on an already-completed reservation throws and does not send a review request', async () => {
    const { service, tx, notificationsService } = createService();
    const row = { ...baseRow, status: reservations_status.completed };
    tx.reservations.findFirst.mockResolvedValue(row);
    tx.reservations.findMany.mockResolvedValue([row]);

    await expect(service.checkOut('res_1')).rejects.toMatchObject({
      response: { code: 'INVALID_TRANSITION' },
    });
    expect(
      notificationsService.sendCheckoutNotification,
    ).not.toHaveBeenCalled();
  });

  it('throws INVALID_TRANSITION when the CAS update matches fewer rows than members (race lost)', async () => {
    const { service, tx, notificationsService } = createService();
    tx.reservations.findFirst.mockResolvedValue(baseRow);
    tx.reservations.findMany.mockResolvedValue([baseRow]);
    tx.reservations.updateMany.mockResolvedValue({ count: 0 }); // 경합 패배 시뮬레이션

    await expect(service.checkOut('res_1')).rejects.toMatchObject({
      response: { code: 'INVALID_TRANSITION' },
    });
    expect(
      notificationsService.sendCheckoutNotification,
    ).not.toHaveBeenCalled();
  });

  it('CAS updateMany filters by allowed statuses', async () => {
    const { service, tx } = createService();
    tx.reservations.findFirst.mockResolvedValue(baseRow);
    tx.reservations.findMany.mockResolvedValue([baseRow]);

    await service.checkIn('res_1');

    expect(tx.reservations.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: expect.arrayContaining([reservations_status.confirmed]),
          },
        }),
      }),
    );
  });

  it('checkIn works for a mixed group with a pending member (physical confirmation wins)', async () => {
    const { service, tx } = createService();
    const pendingMember = {
      ...baseRow,
      id: 'res_2',
      status: reservations_status.pending,
      reservation_group_id: 'res_1',
    };
    tx.reservations.findFirst.mockResolvedValue(baseRow);
    tx.reservations.findMany.mockResolvedValue([baseRow, pendingMember]);
    tx.reservations.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.checkIn('res_1');
    expect(result.updatedCount).toBe(2);
  });

  it('getSummary masks the customer name', async () => {
    const { service, prisma } = createService();
    prisma.reservations.findFirst.mockResolvedValue(baseRow);
    prisma.reservations.findMany.mockResolvedValue([baseRow]);

    const summary = await service.getSummary('res_1');

    expect(summary.customerName).toBe('홍*동');
    expect(summary.items).toEqual([{ storageType: 's', bagCount: 2 }]);
  });
});
