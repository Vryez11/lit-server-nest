import { ConfigService } from '@nestjs/config';
import {
  feedbacks,
  feedbacks_category,
  feedbacks_status,
} from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { FeedbacksService } from './feedbacks.service';

describe('FeedbacksService', () => {
  const baseFeedback: feedbacks = {
    id: 'fb_1',
    category: feedbacks_category.feature,
    status: feedbacks_status.reviewing,
    message: '보관함 예약 흐름을 개선해주세요.',
    nickname: null,
    phone: null,
    locale: null,
    pathname: null,
    ip_hash: null,
    is_public: false,
    response: null,
    response_locale: null,
    published_at: null,
    deleted_at: null,
    created_at: new Date('2026-05-11T00:00:00.000Z'),
    updated_at: new Date('2026-05-11T00:00:00.000Z'),
  };

  const createService = () => {
    const prisma = {
      feedbacks: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new FeedbacksService(
      prisma as unknown as PrismaService,
      {
        getOrThrow: jest
          .fn()
          .mockReturnValue('feedback-ip-hash-secret-at-least-32-chars'),
      } as unknown as ConfigService,
    );

    return { prisma, service };
  };

  it('sets publishedAt when feedback is made public for the first time', async () => {
    const { prisma, service } = createService();
    prisma.feedbacks.findUnique.mockResolvedValue(baseFeedback);
    prisma.feedbacks.update.mockImplementation(({ data }) =>
      Promise.resolve({
        ...baseFeedback,
        ...data,
        is_public: true,
      }),
    );

    const response = await service.updateAdmin('fb_1', { isPublic: true });

    expect(prisma.feedbacks.update).toHaveBeenCalledWith({
      where: { id: 'fb_1' },
      data: expect.objectContaining({
        is_public: true,
        published_at: expect.any(Date),
      }),
    });
    expect(response.isPublic).toBe(true);
    expect(response.publishedAt).not.toBeNull();
  });

  it('keeps existing publishedAt when feedback is republished', async () => {
    const publishedAt = new Date('2026-05-10T00:00:00.000Z');
    const { prisma, service } = createService();
    prisma.feedbacks.findUnique.mockResolvedValue({
      ...baseFeedback,
      is_public: false,
      published_at: publishedAt,
    });
    prisma.feedbacks.update.mockImplementation(({ data }) =>
      Promise.resolve({
        ...baseFeedback,
        ...data,
        is_public: true,
        published_at: publishedAt,
      }),
    );

    await service.updateAdmin('fb_1', { isPublic: true });

    expect(prisma.feedbacks.update).toHaveBeenCalledWith({
      where: { id: 'fb_1' },
      data: expect.not.objectContaining({
        published_at: expect.any(Date),
      }),
    });
  });
});
