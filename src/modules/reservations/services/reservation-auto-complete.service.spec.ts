/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { reservations_status, storages_status } from '@prisma/client';
import { ReservationAutoCompleteService } from './reservation-auto-complete.service';

const createService = () => {
  const tx = {
    reservations: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    storages: { updateMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
  };
  return {
    service: new ReservationAutoCompleteService(prisma as never),
    tx,
  };
};

describe('ReservationAutoCompleteService', () => {
  it('completes overdue confirmed/in_progress reservations without touching actual_end_time', async () => {
    const { service, tx } = createService();
    tx.reservations.findMany.mockResolvedValue([
      { id: 'res_1', storage_id: 'storage_1' },
      { id: 'res_2', storage_id: null },
    ]);
    tx.reservations.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.autoCompleteOverdue();

    const findArgs = tx.reservations.findMany.mock.calls[0][0];
    expect(findArgs.where.status.in).toEqual([
      reservations_status.confirmed,
      reservations_status.in_progress,
    ]);
    expect(findArgs.where.end_time.lt).toBeInstanceOf(Date);

    const updateArgs = tx.reservations.updateMany.mock.calls[0][0];
    expect(updateArgs.data.status).toBe(reservations_status.completed);
    expect(updateArgs.data).not.toHaveProperty('actual_end_time');
    // CAS: 스냅샷과 실제 상태 사이 변경(취소 등)된 행을 덮어쓰지 않도록 status 필터 필수
    expect(updateArgs.where.status.in).toEqual([
      reservations_status.confirmed,
      reservations_status.in_progress,
    ]);

    expect(tx.storages.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['storage_1'] } },
        data: expect.objectContaining({ status: storages_status.available }),
      }),
    );
    expect(result.completedCount).toBe(2);
  });

  it('does nothing when no reservation is overdue', async () => {
    const { service, tx } = createService();

    const result = await service.autoCompleteOverdue();

    expect(tx.reservations.updateMany).not.toHaveBeenCalled();
    expect(result.completedCount).toBe(0);
  });
});
