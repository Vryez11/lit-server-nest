/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { storages_status, storages_type } from '@prisma/client';
import {
  StoreStorageSyncService,
  StorageSyncSettings,
} from './store-storage-sync.service';

const createTx = () => ({
  storages: {
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    updateMany: jest.fn(),
  },
});

/** 소·중·대가 모두 켜져 있는 정상 매장 설정 (컬럼은 한 칸 밀린 레거시 오프셋) */
const settings = (
  overrides: Partial<StorageSyncSettings> = {},
): StorageSyncSettings => ({
  m_max_capacity: 1,
  m_enabled: true,
  l_max_capacity: 1,
  l_enabled: true,
  xl_max_capacity: 1,
  xl_enabled: true,
  ...overrides,
});

/** findMany는 규격 순서(s→m→l)대로 호출된다. */
const mockExisting = (
  tx: ReturnType<typeof createTx>,
  bySize: { s?: unknown[]; m?: unknown[]; l?: unknown[] },
) => {
  tx.storages.findMany
    .mockResolvedValueOnce(bySize.s ?? [])
    .mockResolvedValueOnce(bySize.m ?? [])
    .mockResolvedValueOnce(bySize.l ?? [])
    .mockResolvedValue([]);
};

const storage = (
  id: string,
  number: string,
  type: storages_type,
  status: storages_status,
) => ({ id, store_id: 'store_1', number, type, status, pricing: 2000 });

describe('StoreStorageSyncService', () => {
  it('수용량을 줄여도 보관함을 삭제하지 않고, 범위를 벗어난 available만 maintenance로 내린다', async () => {
    const service = new StoreStorageSyncService();
    const tx = createTx();

    mockExisting(tx, {
      s: [
        storage('storage_1', 'S1', storages_type.s, storages_status.available),
        storage('storage_2', 'S2', storages_type.s, storages_status.available),
      ],
    });
    tx.storages.updateMany.mockResolvedValue({ count: 1 });

    await service.syncFromSettings(tx as never, 'store_1', settings());

    expect(tx.storages.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['storage_2'] } },
      data: expect.objectContaining({ status: storages_status.maintenance }),
    });
    expect(tx.storages).not.toHaveProperty('deleteMany');
  });

  it('설정 범위 안인데 maintenance로 남아 있던 보관함을 available로 되살린다', async () => {
    const service = new StoreStorageSyncService();
    const tx = createTx();

    // 중형 M1이 과거 사고로 maintenance에 묶여 있는 상태
    mockExisting(tx, {
      m: [
        storage(
          'storage_m1',
          'M1',
          storages_type.m,
          storages_status.maintenance,
        ),
      ],
    });
    tx.storages.updateMany.mockResolvedValue({ count: 1 });

    await service.syncFromSettings(tx as never, 'store_1', settings());

    expect(tx.storages.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['storage_m1'] } },
      data: expect.objectContaining({ status: storages_status.available }),
    });
  });

  it('사용 중(occupied)인 보관함은 복구 대상에서 제외한다', async () => {
    const service = new StoreStorageSyncService();
    const tx = createTx();

    mockExisting(tx, {
      m: [
        storage('storage_m1', 'M1', storages_type.m, storages_status.occupied),
      ],
    });
    tx.storages.updateMany.mockResolvedValue({ count: 0 });

    await service.syncFromSettings(tx as never, 'store_1', settings());

    expect(tx.storages.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['storage_m1'] } },
      }),
    );
  });

  it('냉장 보관함은 더 이상 만들지 않고, 남아 있던 냉장·특수·특대는 maintenance로 내린다', async () => {
    const service = new StoreStorageSyncService();
    const tx = createTx();

    mockExisting(tx, {});
    tx.storages.updateMany.mockResolvedValue({ count: 0 });
    tx.storages.createMany.mockResolvedValue({ count: 3 });

    await service.syncFromSettings(tx as never, 'store_1', settings());

    const createdTypes = tx.storages.createMany.mock.calls.flatMap(
      (call: [{ data: { type: storages_type }[] }]) =>
        call[0].data.map((row) => row.type),
    );
    expect(createdTypes).not.toContain(storages_type.refrigeration);

    expect(tx.storages.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: {
            in: [
              storages_type.xl,
              storages_type.special,
              storages_type.refrigeration,
            ],
          },
        }),
      }),
    );
  });

  it('저장된 설정을 그대로 쓰므로, 일부 규격만 담긴 요청이 다른 규격 보관함을 죽이지 않는다', async () => {
    const service = new StoreStorageSyncService();
    const tx = createTx();

    // 소형만 바꾸는 요청이 들어와도 settings에는 중·대형 값이 살아 있다
    mockExisting(tx, {
      m: [
        storage('storage_m1', 'M1', storages_type.m, storages_status.available),
      ],
      l: [
        storage('storage_l1', 'L1', storages_type.l, storages_status.available),
      ],
    });
    tx.storages.updateMany.mockResolvedValue({ count: 0 });

    await service.syncFromSettings(tx as never, 'store_1', settings());

    expect(tx.storages.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: expect.arrayContaining(['storage_m1']) } },
        data: expect.objectContaining({
          status: storages_status.maintenance,
        }),
      }),
    );
  });
});
