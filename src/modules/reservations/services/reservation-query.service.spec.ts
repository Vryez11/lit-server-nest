import { reservations_status } from '@prisma/client';
import { ReservationQueryService } from './reservation-query.service';

const createReservationQueryService = () => {
  const prisma = {
    reservations: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  return {
    service: new ReservationQueryService(prisma as never),
    prisma,
  };
};

describe('ReservationQueryService', () => {
  it('limits customer reservation lists to the authenticated customer id', async () => {
    const { service, prisma } = createReservationQueryService();

    prisma.reservations.count.mockResolvedValue(0);
    prisma.reservations.findMany.mockResolvedValue([]);

    const result = await service.listCustomerReservations('cust_1', {
      status: reservations_status.confirmed,
      storeId: 'store_1',
      page: 1,
      limit: 20,
    });

    expect(prisma.reservations.count).toHaveBeenCalledWith({
      where: {
        customer_id: 'cust_1',
        store_id: 'store_1',
        status: reservations_status.confirmed,
      },
    });
    expect(prisma.reservations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          customer_id: 'cust_1',
          store_id: 'store_1',
          status: reservations_status.confirmed,
        },
      }),
    );
    expect(result).toEqual({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
    });
  });
});
