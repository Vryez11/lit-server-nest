/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  reservations_requested_storage_type,
  storages_status,
  storages_type,
} from '@prisma/client';
import { ReservationStorageService } from './reservation-storage.service';

const createTx = () => ({
  storages: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
});

describe('ReservationStorageService', () => {
  const params = {
    storeId: 'store_1',
    startTime: new Date('2026-05-01T01:00:00.000Z'),
    endTime: new Date('2026-05-01T05:00:00.000Z'),
  };

  it('레거시 특대(xl) 요청도 대형(l) 보관함에서 번호순으로 배정하고 occupied로 바꾼다', async () => {
    const service = new ReservationStorageService({} as never);
    const tx = createTx();
    tx.storages.findFirst.mockResolvedValue({ id: 'storage_l1', number: 'L1' });

    const result = await service.assignAvailableStorage(tx as never, {
      ...params,
      storageType: reservations_requested_storage_type.xl,
    });

    expect(tx.storages.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: storages_type.l,
          status: storages_status.available,
        }),
        orderBy: { number: 'asc' },
      }),
    );
    expect(tx.storages.update).toHaveBeenCalledWith({
      where: { id: 'storage_l1' },
      data: expect.objectContaining({ status: storages_status.occupied }),
    });
    expect(result).toEqual({ id: 'storage_l1', number: 'L1' });
  });

  it('가용 보관함이 없으면 NO_AVAILABLE_STORAGE 코드로 거부한다', async () => {
    const service = new ReservationStorageService({} as never);
    const tx = createTx();
    tx.storages.findFirst.mockResolvedValue(null);

    // autoApproveGroup이 이 코드 문자열로 "해당 행만 pending 유지"를 판정하므로
    // 코드명이 바뀌면 멀티타입 예약이 한 타입 부족만으로 전체 실패한다.
    await expect(
      service.assignAvailableStorage(tx as never, {
        ...params,
        storageType: reservations_requested_storage_type.l,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NO_AVAILABLE_STORAGE' }),
    });
    expect(tx.storages.update).not.toHaveBeenCalled();
  });
});
