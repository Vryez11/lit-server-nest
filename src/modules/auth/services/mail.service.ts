import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

type SendMailOptions = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type ReservationCreatedMailContext = {
  reservationId: string;
  customerName: string;
  locale?: string | null;
  storeName?: string | null;
  startTime: Date;
  endTime?: Date | null;
  bagCount: number;
  totalAmount: number;
  accessToken?: string | null;
};

type ReservationMailLocale = 'ko' | 'en' | 'ja' | 'zh';

type ReservationMailTemplate = {
  subject: string;
  heading: string;
  fallbackStoreName: string;
  luggageLabel: string;
  amountLabel: (amount: number) => string;
  lookupLabel: string;
  staffInstruction: string;
};

const RESERVATION_MAIL_TEMPLATES: Record<
  ReservationMailLocale,
  ReservationMailTemplate
> = {
  ko: {
    subject: '[Lit] 예약이 접수되었습니다.',
    heading: '[Lit] 예약이 접수되었습니다.',
    fallbackStoreName: 'Lit 제휴 매장',
    luggageLabel: '수하물',
    amountLabel: (amount) => `₩${amount.toLocaleString('ko-KR')}`,
    lookupLabel: '예약 조회:',
    staffInstruction:
      '예약 조회에 들어가서 해당 내역의 카드를 직원에게 보여주세요!',
  },
  en: {
    subject: '[Lit] Your reservation has been received.',
    heading: '[Lit] Your reservation has been received.',
    fallbackStoreName: 'Lit partner store',
    luggageLabel: 'Luggage',
    amountLabel: (amount) => `₩${amount.toLocaleString('en-US')}`,
    lookupLabel: 'View reservation:',
    staffInstruction:
      'Open the reservation link and show the reservation card to the staff.',
  },
  ja: {
    subject: '[Lit] 予約を受け付けました。',
    heading: '[Lit] 予約を受け付けました。',
    fallbackStoreName: 'Lit提携店舗',
    luggageLabel: '手荷物',
    amountLabel: (amount) => `₩${amount.toLocaleString('ja-JP')}`,
    lookupLabel: '予約確認:',
    staffInstruction:
      '予約確認リンクを開き、該当予約カードをスタッフにお見せください。',
  },
  zh: {
    subject: '[Lit] 预约已受理。',
    heading: '[Lit] 预约已受理。',
    fallbackStoreName: 'Lit合作门店',
    luggageLabel: '行李',
    amountLabel: (amount) => `₩${amount.toLocaleString('zh-CN')}`,
    lookupLabel: '查看预约：',
    staffInstruction: '请打开预约查询链接，并向工作人员出示该预约卡。',
  },
};

@Injectable()
export class MailService {
  constructor(private readonly configService: ConfigService) {}

  async sendVerificationEmail(email: string, code: string): Promise<void> {
    await this.sendMail({
      to: email,
      subject: '[Lit] 이메일 인증 코드',
      text: `[Lit] 이메일 인증 코드

인증 코드: ${code}

이 코드는 3분 내에만 유효합니다.

- Lit`,
    });
  }

  async sendReservationCreatedEmail(
    email: string,
    context: ReservationCreatedMailContext,
  ): Promise<void> {
    const locale = this.resolveReservationMailLocale(context.locale);
    const template = RESERVATION_MAIL_TEMPLATES[locale];
    const storeName = context.storeName?.trim() || template.fallbackStoreName;
    const timeRange = this.formatReservationTimeRange({
      startTime: context.startTime,
      endTime: context.endTime,
      locale,
    });
    const lookupUrl = this.createReservationLookupUrl(locale, email);

    await this.sendMail({
      to: email,
      subject: template.subject,
      text: `${template.heading}

${storeName}
${timeRange}
${template.luggageLabel} ${context.bagCount}${this.getLuggageUnit(locale)} · ${template.amountLabel(context.totalAmount)}

${template.lookupLabel} ${lookupUrl}

${template.staffInstruction}`,
    });
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    const user = this.configService.get<string>('EMAIL_USER');
    const pass = this.configService.get<string>('EMAIL_PASSWORD');

    if (!user || !pass) {
      throw new ServiceUnavailableException({
        code: 'EMAIL_CONFIG_MISSING',
        message: '이메일 발송 설정이 누락되었습니다.',
      });
    }

    const transporter = nodemailer.createTransport({
      host: this.configService.getOrThrow<string>('EMAIL_HOST'),
      port: this.configService.getOrThrow<number>('EMAIL_PORT'),
      secure: this.configService.getOrThrow<boolean>('EMAIL_SECURE'),
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: this.configService.getOrThrow<string>('EMAIL_FROM'),
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
  }

  private resolveReservationMailLocale(
    locale?: string | null,
  ): ReservationMailLocale {
    if (locale === 'en' || locale === 'ja' || locale === 'zh') {
      return locale;
    }

    return 'ko';
  }

  private createReservationLookupUrl(
    locale: ReservationMailLocale,
    email: string,
  ): string {
    return `https://lifeistravel.io/${locale}/reservations?email=${encodeURIComponent(email)}`;
  }

  private formatReservationTimeRange(params: {
    startTime: Date;
    endTime?: Date | null;
    locale: ReservationMailLocale;
  }): string {
    const date = this.formatReservationDate(params.startTime, params.locale);
    const startTime = this.formatReservationTime(params.startTime, params.locale);
    const endTime = params.endTime
      ? this.formatReservationTime(params.endTime, params.locale)
      : this.getUnknownEndTimeLabel(params.locale);

    return `${date} ${startTime} ~ ${endTime}`;
  }

  private formatReservationDate(
    date: Date,
    locale: ReservationMailLocale,
  ): string {
    if (locale === 'ko') {
      return new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .format(date)
        .replaceAll(' ', '')
        .replace(/\.$/, '');
    }

    const localeMap: Record<ReservationMailLocale, string> = {
      ko: 'ko-KR',
      en: 'en-US',
      ja: 'ja-JP',
      zh: 'zh-CN',
    };

    return new Intl.DateTimeFormat(localeMap[locale], {
      timeZone: 'Asia/Seoul',
      dateStyle: 'medium',
    }).format(date);
  }

  private formatReservationTime(
    date: Date,
    locale: ReservationMailLocale,
  ): string {
    const localeMap: Record<ReservationMailLocale, string> = {
      ko: 'ko-KR',
      en: 'en-US',
      ja: 'ja-JP',
      zh: 'zh-CN',
    };

    return new Intl.DateTimeFormat(localeMap[locale], {
      timeZone: 'Asia/Seoul',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  private getLuggageUnit(locale: ReservationMailLocale): string {
    const unitMap: Record<ReservationMailLocale, string> = {
      ko: '개',
      en: ' item(s)',
      ja: '個',
      zh: '件',
    };

    return unitMap[locale];
  }

  private getUnknownEndTimeLabel(locale: ReservationMailLocale): string {
    const labelMap: Record<ReservationMailLocale, string> = {
      ko: '미정',
      en: 'TBD',
      ja: '未定',
      zh: '待定',
    };

    return labelMap[locale];
  }
}
