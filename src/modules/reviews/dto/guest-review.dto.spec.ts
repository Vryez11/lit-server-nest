import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGuestReviewDto } from './guest-review.dto';

const build = (payload: Record<string, unknown>) =>
  plainToInstance(CreateGuestReviewDto, {
    reservationId: 'res_1',
    token: 'tok',
    rating: 5,
    ...payload,
  });

describe('CreateGuestReviewDto', () => {
  // 2026-07-03 정책 변경: 텍스트 리뷰는 선택 — 별점만으로 제출 가능
  it('accepts a rating-only review (comment omitted)', async () => {
    expect(await validate(build({}))).toHaveLength(0);
  });

  it('accepts a short comment (min length 제거)', async () => {
    expect(await validate(build({ comment: 'good' }))).toHaveLength(0);
  });

  it('accepts a real comment', async () => {
    expect(
      await validate(build({ comment: '정말 좋았습니다 최고!' })),
    ).toHaveLength(0);
  });

  it('rejects a comment over 1000 characters', async () => {
    const errors = await validate(build({ comment: 'a'.repeat(1001) }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('still requires a rating', async () => {
    const errors = await validate(build({ rating: undefined }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts an optional serviceRating within 1-5', async () => {
    expect(await validate(build({ serviceRating: 4 }))).toHaveLength(0);
  });

  it('rejects a serviceRating outside 1-5', async () => {
    const errors = await validate(build({ serviceRating: 6 }));
    expect(errors.length).toBeGreaterThan(0);
  });
});
