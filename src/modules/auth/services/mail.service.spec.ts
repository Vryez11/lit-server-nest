import { ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

const createMailService = () => {
  const sendMail = jest.fn().mockResolvedValue(undefined);
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string | number | boolean> = {
        EMAIL_USER: 'contact@lifeistravel.io',
        EMAIL_PASSWORD: 'password',
      };

      return values[key];
    }),
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string | number | boolean> = {
        EMAIL_HOST: 'smtp.example.com',
        EMAIL_PORT: 587,
        EMAIL_SECURE: false,
        EMAIL_FROM: 'Life is Travel <contact@lifeistravel.io>',
      };

      return values[key];
    }),
  };

  (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

  return {
    service: new MailService(configService as never),
    sendMail,
  };
};

describe('MailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      locale: 'en',
      subject: '[Lit] Your reservation has been received.',
      heading: '[Lit] Your reservation has been received.',
      luggage: 'Luggage 1 item(s) · ₩4,500',
      lookup:
        'View reservation: https://lifeistravel.io/en/reservations?email=guest%40example.com',
      staffInstruction:
        'Open the reservation link and show the reservation card to the staff.',
    },
    {
      locale: 'ja',
      subject: '[Lit] 予約を受け付けました。',
      heading: '[Lit] 予約を受け付けました。',
      luggage: '手荷物 1個 · ₩4,500',
      lookup:
        '予約確認: https://lifeistravel.io/ja/reservations?email=guest%40example.com',
      staffInstruction:
        '予約確認リンクを開き、該当予約カードをスタッフにお見せください。',
    },
    {
      locale: 'zh',
      subject: '[Lit] 预约已受理。',
      heading: '[Lit] 预约已受理。',
      luggage: '行李 1件 · ₩4,500',
      lookup:
        '查看预约： https://lifeistravel.io/zh/reservations?email=guest%40example.com',
      staffInstruction: '请打开预约查询链接，并向工作人员出示该预约卡。',
    },
  ])('sends $locale reservation email template', async (expected) => {
    const { service, sendMail } = createMailService();

    await service.sendReservationCreatedEmail('guest@example.com', {
      reservationId: 'res_123456',
      customerName: 'Guest',
      locale: expected.locale,
      storeName: 'Bin Mama Papa',
      startTime: new Date('2026-06-05T04:00:00.000Z'),
      endTime: new Date('2026-06-05T14:00:00.000Z'),
      bagCount: 1,
      totalAmount: 4500,
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'guest@example.com',
        subject: expected.subject,
        text: expect.stringContaining(expected.heading),
      }),
    );
    expect(sendMail.mock.calls[0][0].text).toContain('Bin Mama Papa');
    expect(sendMail.mock.calls[0][0].text).toContain(expected.luggage);
    expect(sendMail.mock.calls[0][0].text).toContain(expected.lookup);
    expect(sendMail.mock.calls[0][0].text).toContain(
      expected.staffInstruction,
    );
  });

  it('falls back to Korean template and formats the requested body shape', async () => {
    const { service, sendMail } = createMailService();

    await service.sendReservationCreatedEmail('guest@example.com', {
      reservationId: 'res_123456',
      customerName: '홍길동',
      locale: 'ko',
      storeName: '빈마마파파',
      startTime: new Date('2026-06-05T04:00:00.000Z'),
      endTime: new Date('2026-06-05T14:00:00.000Z'),
      bagCount: 1,
      totalAmount: 4500,
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: '[Lit] 예약이 접수되었습니다.',
        text: `[Lit] 예약이 접수되었습니다.

빈마마파파
2026.06.05 오후 1:00 ~ 오후 11:00
수하물 1개 · ₩4,500

예약 조회: https://lifeistravel.io/ko/reservations?email=guest%40example.com

예약 조회에 들어가서 해당 내역의 카드를 직원에게 보여주세요!`,
      }),
    );
  });

  it('throws when SMTP credentials are missing', async () => {
    const configService = {
      get: jest.fn().mockReturnValue(''),
      getOrThrow: jest.fn(),
    };
    const service = new MailService(configService as never);

    await expect(
      service.sendReservationCreatedEmail('guest@example.com', {
        reservationId: 'res_123456',
        customerName: 'Guest',
        locale: 'en',
        startTime: new Date('2026-06-05T04:00:00.000Z'),
        bagCount: 1,
        totalAmount: 4500,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
