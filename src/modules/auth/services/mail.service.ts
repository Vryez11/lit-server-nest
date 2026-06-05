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
  storeName?: string | null;
  startTime: Date;
  endTime?: Date | null;
  bagCount: number;
  totalAmount: number;
  accessToken?: string | null;
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
    const storeName = context.storeName?.trim() || 'Lit 제휴 매장';
    const startTime = this.formatKstDateTime(context.startTime);
    const endTime = context.endTime
      ? this.formatKstDateTime(context.endTime)
      : '미정';
    const accessTokenLine = context.accessToken
      ? `\n예약 조회 토큰: ${context.accessToken}\n`
      : '';

    await this.sendMail({
      to: email,
      subject: `[Lit] ${storeName} 예약이 접수되었습니다`,
      text: `[Lit] 예약 접수 안내

${context.customerName}님, 예약이 접수되었습니다.

예약 번호: ${context.reservationId}
매장: ${storeName}
보관 시작: ${startTime}
보관 종료: ${endTime}
수하물 수량: ${context.bagCount}개
결제 금액: ${context.totalAmount.toLocaleString('ko-KR')}원${accessTokenLine}
예약 상태가 변경되면 추가로 안내드리겠습니다.

- Lit`,
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

  private formatKstDateTime(date: Date): string {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }
}
