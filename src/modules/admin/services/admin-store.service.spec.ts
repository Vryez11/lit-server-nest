import { NotFoundException } from '@nestjs/common';
import { store_status_status } from '@prisma/client';
import { ADMIN_STORE_SELECT, AdminStoreService } from './admin-store.service';

const createService = () => {
  const prisma = {
    stores: { findUnique: jest.fn() },
    store_status: { findMany: jest.fn() },
  };

  return { service: new AdminStoreService(prisma as never), prisma };
};

describe('AdminStoreService', () => {
  describe('getStoreOrThrow', () => {
    it('returns the admin-facing store columns', async () => {
      const { service, prisma } = createService();
      const store = { id: 'store_1', business_name: '홍대 짐보관소' };
      prisma.stores.findUnique.mockResolvedValue(store);

      await expect(service.getStoreOrThrow('store_1')).resolves.toBe(store);
      expect(prisma.stores.findUnique).toHaveBeenCalledWith({
        where: { id: 'store_1' },
        select: ADMIN_STORE_SELECT,
      });
      expect(ADMIN_STORE_SELECT).not.toHaveProperty('password_hash');
    });

    it('throws STORE_NOT_FOUND for an unknown store', async () => {
      const { service, prisma } = createService();
      prisma.stores.findUnique.mockResolvedValue(null);

      const promise = service.getStoreOrThrow('missing');

      await expect(promise).rejects.toThrow(NotFoundException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'STORE_NOT_FOUND' },
      });
    });
  });

  describe('getLatestStatuses', () => {
    it('keeps only the newest row per store', async () => {
      const { service, prisma } = createService();
      prisma.store_status.findMany.mockResolvedValue([
        { store_id: 'store_1', status: store_status_status.open },
        { store_id: 'store_2', status: store_status_status.temporarily_closed },
        { store_id: 'store_1', status: store_status_status.closed }, // older
      ]);

      const statuses = await service.getLatestStatuses(['store_1', 'store_2']);

      expect(prisma.store_status.findMany).toHaveBeenCalledWith({
        where: { store_id: { in: ['store_1', 'store_2'] } },
        orderBy: { updated_at: 'desc' },
        select: { store_id: true, status: true },
      });
      expect(statuses.get('store_1')).toBe(store_status_status.open);
      expect(statuses.get('store_2')).toBe(
        store_status_status.temporarily_closed,
      );
    });

    it('skips the query for an empty id list', async () => {
      const { service, prisma } = createService();

      await expect(service.getLatestStatuses([])).resolves.toEqual(new Map());
      expect(prisma.store_status.findMany).not.toHaveBeenCalled();
    });

    it('resolveStatus defaults to closed when a store has no status row', () => {
      const statuses = new Map([['store_1', store_status_status.open]]);

      expect(AdminStoreService.resolveStatus(statuses, 'store_1')).toBe(
        store_status_status.open,
      );
      expect(AdminStoreService.resolveStatus(statuses, 'store_9')).toBe(
        store_status_status.closed,
      );
    });
  });
});
