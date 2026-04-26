import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, storages_status } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../common/database/prisma.service';
import {
  CreateStorageDto,
  DeleteStorageResponseDto,
  StorageResponseDto,
  UpdateStorageDto,
} from '../dto/storage.dto';
import { toStorageResponse } from '../mappers/storage.mapper';
import { StoragePolicyService } from './storage-policy.service';

@Injectable()
export class StoragesCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storagePolicyService: StoragePolicyService,
  ) {}

  async createStorage(
    storeId: string,
    dto: CreateStorageDto,
  ): Promise<StorageResponseDto> {
    await this.storagePolicyService.assertStoreExists(storeId);
    const number = dto.number.trim();
    await this.storagePolicyService.assertStorageNumberAvailable(
      storeId,
      number,
    );

    try {
      const storage = await this.prisma.storages.create({
        data: {
          id: `storage_${randomUUID()}`,
          store_id: storeId,
          number,
          type: dto.type,
          status: storages_status.available,
          width: dto.width ?? null,
          height: dto.height ?? null,
          depth: dto.depth ?? null,
          pricing: dto.pricing,
          floor: dto.floor ?? null,
          section: dto.section?.trim() ?? null,
          row_num: dto.row ?? null,
          column_num: dto.column ?? null,
        },
      });

      return toStorageResponse(storage);
    } catch (error) {
      this.throwDuplicateStorageNumberIfNeeded(error, number);
      throw error;
    }
  }

  async updateStorage(
    storeId: string,
    storageId: string,
    dto: UpdateStorageDto,
  ): Promise<StorageResponseDto> {
    const storage = await this.storagePolicyService.getStorageOrThrow(
      storageId,
      storeId,
    );
    const number = dto.number?.trim();
    const hasChanges = Object.values(dto).some((value) => value !== undefined);

    if (!hasChanges) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '수정할 정보가 없습니다.',
      });
    }

    await this.storagePolicyService.assertCanUpdateStorage(storage, {
      number,
      type: dto.type,
      status: dto.status,
    });

    if (number && number !== storage.number) {
      await this.storagePolicyService.assertStorageNumberAvailable(
        storeId,
        number,
        storageId,
      );
    }

    try {
      const updatedStorage = await this.prisma.storages.update({
        where: { id: storageId },
        data: {
          ...(number !== undefined ? { number } : {}),
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.width !== undefined ? { width: dto.width } : {}),
          ...(dto.height !== undefined ? { height: dto.height } : {}),
          ...(dto.depth !== undefined ? { depth: dto.depth } : {}),
          ...(dto.pricing !== undefined ? { pricing: dto.pricing } : {}),
          ...(dto.floor !== undefined ? { floor: dto.floor } : {}),
          ...(dto.section !== undefined ? { section: dto.section.trim() } : {}),
          ...(dto.row !== undefined ? { row_num: dto.row } : {}),
          ...(dto.column !== undefined ? { column_num: dto.column } : {}),
          updated_at: new Date(),
        },
      });

      return toStorageResponse(updatedStorage);
    } catch (error) {
      this.throwDuplicateStorageNumberIfNeeded(error, number ?? storage.number);
      throw error;
    }
  }

  async deleteStorage(
    storeId: string,
    storageId: string,
  ): Promise<DeleteStorageResponseDto> {
    const storage = await this.storagePolicyService.getStorageOrThrow(
      storageId,
      storeId,
    );

    await this.storagePolicyService.assertCanDeleteOrDeactivate(storage);

    await this.prisma.storages.update({
      where: { id: storageId },
      data: {
        status: storages_status.maintenance,
        updated_at: new Date(),
      },
    });

    return {
      id: storageId,
      deleted: false,
      status: storages_status.maintenance,
    };
  }

  private throwDuplicateStorageNumberIfNeeded(
    error: unknown,
    number: string,
  ): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      this.isStorageNumberUniqueConstraint(error.meta?.target)
    ) {
      throw this.storagePolicyService.duplicateStorageNumber(number);
    }
  }

  private isStorageNumberUniqueConstraint(target: unknown): boolean {
    if (!Array.isArray(target)) {
      return false;
    }

    return (
      target.includes('store_id') &&
      (target.includes('number') || target.includes('unique_storage_number')) &&
      !target.includes('id')
    );
  }
}
