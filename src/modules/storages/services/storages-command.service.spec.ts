/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { BadRequestException } from '@nestjs/common';
import { Prisma, storages_status, storages_type } from '@prisma/client';
import { StoragesCommandService } from './storages-command.service';

const createStoragesCommandService = () => {
  const prisma = {
    storages: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const storagePolicyService = {
    assertStoreExists: jest.fn(),
    assertStorageNumberAvailable: jest.fn(),
    getStorageOrThrow: jest.fn(),
    assertCanUpdateStorage: jest.fn(),
    assertCanDeleteOrDeactivate: jest.fn(),
    duplicateStorageNumber: jest.fn((number: string) => {
      return new BadRequestException({
        code: 'DUPLICATE_STORAGE_NUMBER',
        message: '이미 존재하는 보관함 번호입니다.',
        details: { number },
      });
    }),
  };

  return {
    service: new StoragesCommandService(
      prisma as never,
      storagePolicyService as never,
    ),
    prisma,
    storagePolicyService,
  };
};

describe('StoragesCommandService', () => {
  it('turns DELETE into maintenance status instead of hard deleting', async () => {
    const { service, prisma, storagePolicyService } =
      createStoragesCommandService();

    storagePolicyService.getStorageOrThrow.mockResolvedValue({
      id: 'storage_1',
      store_id: 'store_1',
      status: storages_status.available,
    });
    prisma.storages.update.mockResolvedValue({});

    const result = await service.deleteStorage('store_1', 'storage_1');

    expect(storagePolicyService.assertCanDeleteOrDeactivate).toHaveBeenCalled();
    expect(prisma.storages.update).toHaveBeenCalledWith({
      where: { id: 'storage_1' },
      data: expect.objectContaining({
        status: storages_status.maintenance,
      }),
    });
    expect(result).toEqual({
      id: 'storage_1',
      deleted: false,
      status: storages_status.maintenance,
    });
  });

  it('maps Prisma unique violations to duplicate storage number errors', async () => {
    const { service, prisma } = createStoragesCommandService();

    prisma.storages.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['store_id', 'number'] },
      }),
    );

    await expect(
      service.createStorage('store_1', {
        number: 'S1',
        type: storages_type.s,
        pricing: 2000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
