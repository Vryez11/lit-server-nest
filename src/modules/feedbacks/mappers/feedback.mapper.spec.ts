import {
  feedbacks,
  feedbacks_category,
  feedbacks_status,
} from '@prisma/client';
import {
  toAdminFeedbackResponse,
  toPublicFeedbackResponse,
} from './feedback.mapper';

describe('feedback mapper', () => {
  const feedback: feedbacks = {
    id: 'fb_1',
    category: feedbacks_category.feature,
    status: feedbacks_status.reviewing,
    message: '보관함 예약 흐름을 개선해주세요.',
    nickname: 'traveler',
    phone: '010-0000-0000',
    locale: 'ko',
    pathname: '/',
    ip_hash: 'hash',
    is_public: true,
    response: '검토 중입니다.',
    response_locale: 'ko',
    published_at: new Date('2026-05-11T01:00:00.000Z'),
    deleted_at: null,
    created_at: new Date('2026-05-11T00:00:00.000Z'),
    updated_at: new Date('2026-05-11T02:00:00.000Z'),
  };

  it('does not expose private fields in public feedback responses', () => {
    const response = toPublicFeedbackResponse(feedback);

    expect(response).toEqual({
      id: 'fb_1',
      category: feedbacks_category.feature,
      status: feedbacks_status.reviewing,
      message: '보관함 예약 흐름을 개선해주세요.',
      nickname: 'traveler',
      response: '검토 중입니다.',
      responseLocale: 'ko',
      createdAt: '2026-05-11T00:00:00.000Z',
      publishedAt: '2026-05-11T01:00:00.000Z',
    });
    expect(response).not.toHaveProperty('phone');
    expect(response).not.toHaveProperty('ipHash');
  });

  it('includes phone only in admin feedback responses', () => {
    const response = toAdminFeedbackResponse(feedback);

    expect(response.phone).toBe('010-0000-0000');
    expect(response.isPublic).toBe(true);
    expect(response.deletedAt).toBeNull();
  });
});
