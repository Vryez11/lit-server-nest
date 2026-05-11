import { ConfigService } from '@nestjs/config';
import { AdminFeedbackTokenGuard } from './admin-feedback-token.guard';

describe('AdminFeedbackTokenGuard', () => {
  const createContext = (token?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          header: (name: string) =>
            name.toLowerCase() === 'x-admin-token' ? token : undefined,
        }),
      }),
    }) as never;

  it('allows requests with the configured admin token', () => {
    const guard = new AdminFeedbackTokenGuard({
      get: jest.fn().mockReturnValue('secret-token'),
    } as unknown as ConfigService);

    expect(guard.canActivate(createContext('secret-token'))).toBe(true);
  });

  it('rejects requests without the configured admin token', () => {
    const guard = new AdminFeedbackTokenGuard({
      get: jest.fn().mockReturnValue('secret-token'),
    } as unknown as ConfigService);

    expect(() => guard.canActivate(createContext('wrong-token'))).toThrow(
      'Unauthorized',
    );
  });
});
