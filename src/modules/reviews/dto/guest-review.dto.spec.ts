import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGuestReviewDto } from './guest-review.dto';

const build = (comment: string) =>
  plainToInstance(CreateGuestReviewDto, {
    reservationId: 'res_1',
    token: 'tok',
    rating: 5,
    comment,
  });

describe('CreateGuestReviewDto', () => {
  it('rejects a whitespace-padded short comment', async () => {
    const errors = await validate(build('         a'));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts a real 10+ char comment', async () => {
    expect(await validate(build('정말 좋았습니다 최고!'))).toHaveLength(0);
  });
});
