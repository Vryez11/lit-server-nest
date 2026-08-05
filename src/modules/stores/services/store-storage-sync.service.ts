import { Injectable } from '@nestjs/common';
import { Prisma, storages_status, storages_type } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  FROZEN_STORAGE_PRICES,
  SELLABLE_STORAGE_TYPES,
  STORAGE_SETTINGS_COLUMNS,
} from '../../reservations/pricing/reservation-pricing.constants';

type StorageConfig = {
  type: storages_type;
  prefix: string;
  enabled: boolean;
  capacity: number;
  pricing: number;
};

/**
 * 보관함 동기화의 입력 — 요청 DTO가 아니라 **저장이 끝난 store_settings 행**이다.
 *
 * 예전에는 요청 DTO를 그대로 받아, 누락된 필드를 store_settings 저장 코드는
 * "기존값 유지"로, 이 동기화 코드는 "비활성/용량 0"으로 해석했다. 그 결과 일부 규격만
 * 담긴 요청 한 번에 중형·대형 보관함이 통째로 maintenance로 강등되면서,
 * 설정 화면은 멀쩡해 보이는데 예약만 계속 접수 상태로 죽는 사고가 났다.
 * 저장된 행을 소스로 삼으면 두 값이 어긋날 수 없다.
 */
export type StorageSyncSettings = {
  m_max_capacity?: number | null;
  m_enabled?: boolean | null;
  l_max_capacity?: number | null;
  l_enabled?: boolean | null;
  xl_max_capacity?: number | null;
  xl_enabled?: boolean | null;
};

/** 더 이상 판매하지 않는 레거시 규격 — 남은 보관함은 배정 대상에서 제외한다. */
const LEGACY_STORAGE_TYPES = [
  storages_type.xl,
  storages_type.special,
  storages_type.refrigeration,
];

@Injectable()
export class StoreStorageSyncService {
  async syncFromSettings(
    tx: Prisma.TransactionClient,
    storeId: string,
    settings: StorageSyncSettings,
  ): Promise<void> {
    const configs = this.buildStorageConfigs(settings);

    for (const config of configs) {
      const existing = await tx.storages.findMany({
        where: { store_id: storeId, type: config.type },
        orderBy: { number: 'asc' },
      });

      const existingNumbers = new Set(
        existing.map((storage) => storage.number),
      );
      const targetNumbers = new Set(
        Array.from({ length: config.capacity }, (_, index) =>
          this.storageNumber(config.prefix, index + 1),
        ),
      );

      if (config.enabled && config.capacity > 0) {
        const toCreate: Prisma.storagesCreateManyInput[] = [];
        for (let index = 1; index <= config.capacity; index += 1) {
          const number = this.storageNumber(config.prefix, index);

          if (!existingNumbers.has(number)) {
            toCreate.push({
              id: `stor_${randomUUID()}`,
              store_id: storeId,
              number,
              type: config.type,
              status: storages_status.available,
              pricing: config.pricing,
            });
          }
        }

        if (toCreate.length > 0) {
          await tx.storages.createMany({
            data: toCreate,
            skipDuplicates: true,
          });
        }

        await tx.storages.updateMany({
          where: {
            store_id: storeId,
            type: config.type,
            number: { in: [...targetNumbers] },
          },
          data: {
            pricing: config.pricing,
            updated_at: new Date(),
          },
        });
      }

      // 설정 범위 안인데 maintenance로 묶여 있던 보관함을 되살린다.
      // 이 복구 경로가 없어서, 한 번 강등된 보관함은 설정을 다시 저장해도
      // 영원히 배정 대상에서 빠져 있었다. 사용 중(occupied)은 건드리지 않는다.
      const restorableIds = existing
        .filter(
          (storage) =>
            config.enabled &&
            targetNumbers.has(storage.number) &&
            storage.status === storages_status.maintenance,
        )
        .map((storage) => storage.id);

      if (restorableIds.length > 0) {
        await tx.storages.updateMany({
          where: { id: { in: restorableIds } },
          data: {
            status: storages_status.available,
            updated_at: new Date(),
          },
        });
      }

      const excessAvailableIds = existing
        .filter(
          (storage) =>
            (!config.enabled || !targetNumbers.has(storage.number)) &&
            storage.status === storages_status.available,
        )
        .map((storage) => storage.id);

      if (excessAvailableIds.length > 0) {
        await tx.storages.updateMany({
          where: { id: { in: excessAvailableIds } },
          data: {
            status: storages_status.maintenance,
            updated_at: new Date(),
          },
        });
      }
    }

    await this.disableLegacyStorageTypes(tx, storeId);
  }

  private async disableLegacyStorageTypes(
    tx: Prisma.TransactionClient,
    storeId: string,
  ): Promise<void> {
    await tx.storages.updateMany({
      where: {
        store_id: storeId,
        type: {
          in: LEGACY_STORAGE_TYPES,
        },
        status: storages_status.available,
      },
      data: {
        status: storages_status.maintenance,
        updated_at: new Date(),
      },
    });
  }

  /**
   * 소·중·대 3종만 만든다. 규격 ↔ 설정 컬럼 매핑은
   * STORAGE_SETTINGS_COLUMNS 한 곳에서만 정의된다.
   */
  private buildStorageConfigs(settings: StorageSyncSettings): StorageConfig[] {
    return SELLABLE_STORAGE_TYPES.map((storageType) => {
      const binding = STORAGE_SETTINGS_COLUMNS[storageType];

      return {
        type: storages_type[storageType],
        prefix: binding.numberPrefix,
        enabled: settings[binding.enabled] ?? false,
        capacity: settings[binding.capacity] ?? 0,
        pricing: FROZEN_STORAGE_PRICES[storageType],
      };
    });
  }

  private storageNumber(prefix: string, index: number): string {
    return `${prefix}${index}`;
  }
}
