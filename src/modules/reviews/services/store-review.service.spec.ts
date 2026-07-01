/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { StoreReviewService } from './store-review.service';

const createService = () => {
  const prisma = {
    reviews: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
      groupBy: jest.fn().mockResolvedValue([]),
      aggregate: jest
        .fn()
        .mockResolvedValue({ _avg: { rating: null }, _count: 0 }),
    },
  };
  return { service: new StoreReviewService(prisma as never), prisma };
};

const reviewRow = {
  id: 'review_1',
  store_id: 'store_1',
  customer_id: 'guest_1',
  customer_name: '홍*동',
  reservation_id: 'res_1',
  type: 'store',
  rating: 5,
  comment: '좋았어요 최고!',
  images: [],
  status: 'pending',
  response: null,
  response_date: null,
  created_at: new Date('2026-07-01T00:00:00.000Z'),
};

describe('StoreReviewService', () => {
  it('lists reviews for the authenticated store with pagination shape', async () => {
    const { service, prisma } = createService();
    prisma.reviews.findMany.mockResolvedValue([reviewRow]);
    prisma.reviews.count.mockResolvedValue(41);

    const result = await service.listReviews('store_1', {
      page: 2,
      limit: 20,
      filterStatus: 'pending',
    });

    expect(prisma.reviews.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { store_id: 'store_1', status: 'pending' },
        skip: 20,
        take: 20,
      }),
    );
    expect(result).toMatchObject({
      totalCount: 41,
      currentPage: 2,
      totalPages: 3,
      hasNext: true,
    });
    expect(result.reviews[0]).toMatchObject({
      id: 'review_1',
      customerName: '홍*동',
      isResponded: false,
      type: 'store',
      createdAt: '2026-07-01T00:00:00.000Z',
      respondedAt: null,
    });
  });

  it('ignores the client-sent storeId and always scopes by the authenticated store', async () => {
    const { service, prisma } = createService();

    await service.listReviews('store_auth', {
      storeId: 'store_other',
      filterStatus: 'all',
    });

    expect(prisma.reviews.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { store_id: 'store_auth' } }),
    );
  });

  it('responds to a review owned by the store', async () => {
    const { service, prisma } = createService();
    prisma.reviews.findFirst.mockResolvedValue(reviewRow);
    prisma.reviews.update.mockResolvedValue({
      ...reviewRow,
      status: 'responded',
      response: '감사합니다!',
      response_date: new Date('2026-07-02T00:00:00.000Z'),
    });

    const result = await service.respondToReview(
      'store_1',
      'review_1',
      '감사합니다!',
    );

    expect(prisma.reviews.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'review_1' },
        data: expect.objectContaining({
          status: 'responded',
          response: '감사합니다!',
        }),
      }),
    );
    expect(result.isResponded).toBe(true);
    expect(result.respondedAt).toBe('2026-07-02T00:00:00.000Z');
  });

  it('rejects responding to another store review', async () => {
    const { service, prisma } = createService();
    prisma.reviews.findFirst.mockResolvedValue(null);

    await expect(
      service.respondToReview('store_2', 'review_1', 'x'),
    ).rejects.toMatchObject({ response: { code: 'REVIEW_NOT_FOUND' } });
  });

  it('builds statistics with a full 1..5 distribution and string keys', async () => {
    const { service, prisma } = createService();
    prisma.reviews.aggregate.mockResolvedValue({
      _avg: { rating: 4.5 },
      _count: 10,
    });
    prisma.reviews.count.mockResolvedValue(4);
    prisma.reviews.groupBy.mockResolvedValue([
      { rating: 5, _count: { rating: 6 } },
      { rating: 4, _count: { rating: 4 } },
    ]);

    const stats = await service.getStatistics('store_1');

    expect(stats).toEqual({
      averageRating: 4.5,
      totalReviews: 10,
      respondedReviews: 4,
      pendingReviews: 6,
      ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 4, '5': 6 },
    });
  });
});
