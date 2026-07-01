import { createHmac, timingSafeEqual } from 'crypto';

/** 점주 액션 링크용 stateless 서명 토큰. DB 저장 없이 검증된다. */
export const createOwnerActionToken = (
  reservationId: string,
  secret: string,
): string =>
  createHmac('sha256', secret).update(reservationId).digest('base64url');

export const verifyOwnerActionToken = (
  reservationId: string,
  token: string | undefined,
  secret: string,
): boolean => {
  const expected = Buffer.from(createOwnerActionToken(reservationId, secret));
  const actual = Buffer.from(String(token ?? ''));
  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
};
