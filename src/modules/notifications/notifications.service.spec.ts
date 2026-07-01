import { ConfigService } from '@nestjs/config';
import {
  CancelNotificationData,
  CreateNotificationData,
  NotificationsService,
} from './notifications.service';

const solapiSendMock = jest.fn().mockResolvedValue(undefined);
jest.mock('solapi', () => ({
  SolapiMessageService: jest.fn().mockImplementation(() => ({
    send: solapiSendMock,
  })),
}));

const createService = (config: Record<string, string>) => {
  const configService = {
    get: jest.fn((key: string) => config[key]),
  } as unknown as ConfigService;
  const mailService = {
    sendReviewRequestEmail: jest.fn().mockResolvedValue(undefined),
  };

  const service = new NotificationsService(configService, mailService as never);
  const errorSpy = jest
    .spyOn(
      (
        service as unknown as {
          logger: { error: (...args: unknown[]) => void };
        }
      ).logger,
      'error',
    )
    .mockImplementation(() => undefined);

  return { service, mailService, errorSpy };
};

const cancelData: CancelNotificationData = {
  reservationId: 'res_abc-123456',
  customerPhone: '01012345678',
  storeName: '테스트 매장',
  ownerPhone: '01099998888',
  luggageType: 's',
  bagCount: 1,
  startTime: new Date('2026-07-02T05:00:00.000Z'),
  cancelledCount: 1,
};

const createData: CreateNotificationData = {
  reservationId: 'res_abc-123456',
  storeName: '테스트 매장',
  storeAddress: '서울',
  ownerPhone: '01099998888',
  customerName: '홍길동',
  customerPhone: '01012345678',
  luggageItems: [{ type: 's', count: 1 }],
  startTime: new Date('2026-07-02T05:00:00.000Z'),
  endTime: new Date('2026-07-02T09:00:00.000Z'),
  duration: 4,
  totalAmount: 4500,
  locale: 'ko',
};

const checkoutData = {
  reservationId: 'res_abc-123456',
  storeName: '테스트 매장',
  customerName: '홍길동',
  customerPhone: '01012345678',
  customerEmail: null as string | null,
  locale: 'ko',
  reviewPath: 'www.lifeistravel.io/review/res_abc?token=tok',
};

describe('NotificationsService', () => {
  beforeEach(() => {
    solapiSendMock.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs an error when a cancel notification channel fails', async () => {
    const { service, errorSpy } = createService({
      DISCORD_RESERVATION_WEBHOOK_URL: 'https://discord.test/webhook',
    });

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    await service.sendCancelNotification(cancelData);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'notifications.channel_failed',
        channel: 'discord',
        reservationId: 'res_abc-123456',
      }),
    );
  });

  it('logs an error when a create notification channel fails', async () => {
    const { service, errorSpy } = createService({
      DISCORD_RESERVATION_WEBHOOK_URL: 'https://discord.test/webhook',
    });

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    await service.sendCreateNotification(createData);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'notifications.channel_failed',
        channel: 'discord',
        reservationId: 'res_abc-123456',
      }),
    );
  });

  it('does not log errors when all channels succeed or are skipped', async () => {
    const { service, errorSpy } = createService({
      DISCORD_RESERVATION_WEBHOOK_URL: 'https://discord.test/webhook',
    });

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 204,
      statusText: 'No Content',
    } as Response);

    await service.sendCancelNotification(cancelData);

    expect(errorSpy).not.toHaveBeenCalled();
  });

  describe('sendCheckoutNotification', () => {
    it('sends the review-request email when the guest booked with an email address', async () => {
      const { service, mailService } = createService({});

      await service.sendCheckoutNotification({
        ...checkoutData,
        customerPhone: 'guest@example.com',
        customerEmail: 'guest@example.com',
        locale: 'en',
      });

      expect(mailService.sendReviewRequestEmail).toHaveBeenCalledWith(
        'guest@example.com',
        expect.objectContaining({
          locale: 'en',
          storeName: '테스트 매장',
          reviewUrl: 'https://www.lifeistravel.io/review/res_abc?token=tok',
        }),
      );
    });

    it('prefers email over LMS for a foreign phone number with an email on file', async () => {
      const { service, mailService } = createService({});

      await service.sendCheckoutNotification({
        ...checkoutData,
        customerPhone: '+14155550123',
        customerEmail: 'traveler@example.com',
        locale: 'en',
      });

      expect(mailService.sendReviewRequestEmail).toHaveBeenCalledWith(
        'traveler@example.com',
        expect.anything(),
      );
    });

    it('skips silently when no solapi env and no email exist (korean phone)', async () => {
      const { service, mailService, errorSpy } = createService({});

      await service.sendCheckoutNotification(checkoutData);

      expect(mailService.sendReviewRequestEmail).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('falls back to Korean LMS with the review URL when alimtalk env is absent but sender phone exists', async () => {
      const { service } = createService({
        SOLAPI_API_KEY: 'k',
        SOLAPI_API_SECRET: 's',
        SOLAPI_SENDER_PHONE: '0212345678',
      });

      await service.sendCheckoutNotification(checkoutData);

      expect(solapiSendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '01012345678',
          from: '0212345678',
          type: 'LMS',
          text: expect.stringContaining(
            'https://www.lifeistravel.io/review/res_abc?token=tok',
          ),
        }),
      );
    });
  });
});
