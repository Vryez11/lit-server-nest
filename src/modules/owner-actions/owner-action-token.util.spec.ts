import {
  createOwnerActionToken,
  verifyOwnerActionToken,
} from './owner-action-token.util';

describe('owner-action-token.util', () => {
  const secret = 'test-secret-at-least-32-characters!!';

  it('creates a deterministic base64url token per reservation', () => {
    const a = createOwnerActionToken('res_1', secret);
    const b = createOwnerActionToken('res_1', secret);
    expect(a).toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('verifies a valid token and rejects tampered ones', () => {
    const token = createOwnerActionToken('res_1', secret);
    expect(verifyOwnerActionToken('res_1', token, secret)).toBe(true);
    expect(verifyOwnerActionToken('res_2', token, secret)).toBe(false);
    expect(verifyOwnerActionToken('res_1', token + 'x', secret)).toBe(false);
    expect(verifyOwnerActionToken('res_1', '', secret)).toBe(false);
  });
});
