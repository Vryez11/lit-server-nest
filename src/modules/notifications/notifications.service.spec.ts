import { ConfigService } from '@nestjs/config';
import {
  CancelNotificationData,
  CreateNotificationData,
  NotificationsService,
} from './notifications.service';

const createService = (config: Record<string, string>) => {
  const configService = {
    get: jest.fn((key: string) => config[key]),
  } as unknown as ConfigService;

  const service = new NotificationsService(configService);
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

  return { service, errorSpy };
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

describe('NotificationsService', () => {
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
});
