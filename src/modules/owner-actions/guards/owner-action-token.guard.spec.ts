import { ConfigService } from '@nestjs/config';
import { createOwnerActionToken } from '../owner-action-token.util';
import { OwnerActionTokenGuard } from './owner-action-token.guard';

const SECRET = 'test-secret-at-least-32-characters!!';

const createContext = (reservationId: string, token?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        params: { id: reservationId },
        query: token !== undefined ? { t: token } : {},
      }),
    }),
  }) as never;

const createGuard = (secret?: string) =>
  new OwnerActionTokenGuard({
    get: jest.fn().mockReturnValue(secret),
  } as unknown as ConfigService);

describe('OwnerActionTokenGuard', () => {
  it('allows a request with a valid token', () => {
    const guard = createGuard(SECRET);
    const token = createOwnerActionToken('res_1', SECRET);
    expect(guard.canActivate(createContext('res_1', token))).toBe(true);
  });

  it('rejects a token issued for another reservation', () => {
    const guard = createGuard(SECRET);
    const token = createOwnerActionToken('res_2', SECRET);
    expect(() => guard.canActivate(createContext('res_1', token))).toThrow(
      'Unauthorized',
    );
  });

  it('rejects array query params (?t=a&t=b)', () => {
    const guard = createGuard(SECRET);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          params: { id: 'res_1' },
          query: { t: ['validish', 'token'] },
        }),
      }),
    } as never;
    expect(() => guard.canActivate(ctx)).toThrow('Unauthorized');
  });

  it('rejects when ?t is absent', () => {
    const guard = createGuard(SECRET);
    expect(() => guard.canActivate(createContext('res_1'))).toThrow(
      'Unauthorized',
    );
  });

  it('rejects everything when OWNER_ACTION_SECRET is not configured', () => {
    const guard = createGuard(undefined);
    const token = createOwnerActionToken('res_1', SECRET);
    expect(() => guard.canActivate(createContext('res_1', token))).toThrow(
      'Unauthorized',
    );
  });
});
