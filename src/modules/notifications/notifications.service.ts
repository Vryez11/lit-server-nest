import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SolapiMessageService } from 'solapi';

export interface CancelNotificationData {
  reservationId: string;
  customerPhone: string;
  storeName: string;
  ownerPhone: string;
  luggageType: string; // reservations_requested_storage_type 값
  bagCount: number;
  startTime: Date;
  cancelledCount: number;
}

/** 짐 타입 코드 → 한국어 레이블 */
const LUGGAGE_LABELS_KO: Record<string, string> = {
  s: '소형',
  m: '중형',
  l: '대형',
  xl: '특대',
  special: '특수',
  refrigeration: '냉장',
};

function shortCode(reservationId: string): string {
  const lastDash = reservationId.lastIndexOf('-');
  const tail = lastDash >= 0 ? reservationId.slice(lastDash + 1) : reservationId;
  return tail.slice(-6).toUpperCase();
}

function formatKoreanDateTime(date: Date): string {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function buildLuggageList(luggageType: string, bagCount: number): string {
  const label = LUGGAGE_LABELS_KO[luggageType] ?? luggageType;
  return `${label} ${bagCount}개`;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * 예약 취소 시 Discord embed + 카카오 알림톡(점주)을 발송합니다.
   * 환경변수 미설정 시 해당 채널을 스킵하며, 예외는 호출자가 처리합니다.
   */
  async sendCancelNotification(data: CancelNotificationData): Promise<void> {
    await Promise.allSettled([
      this.sendDiscordCancelEmbed(data),
      this.sendKakaoCancelAlimtalk(data),
    ]);
  }

  // ─── Discord ─────────────────────────────────────────────────────────

  private async sendDiscordCancelEmbed(data: CancelNotificationData): Promise<void> {
    const webhookUrl = this.configService.get<string>('DISCORD_RESERVATION_WEBHOOK_URL');
    if (!webhookUrl) {
      this.logger.debug('DISCORD_RESERVATION_WEBHOOK_URL 미설정 — Discord 알림 스킵');
      return;
    }

    const code = shortCode(data.reservationId);
    const luggageList = buildLuggageList(data.luggageType, data.bagCount);
    const startFormatted = formatKoreanDateTime(data.startTime);

    const embed = {
      title: `❌ 예약 취소 [${code}]`,
      color: 0xef4444,
      fields: [
        { name: '매장명', value: data.storeName || '(알 수 없음)', inline: true },
        { name: '고객 연락처', value: data.customerPhone || '(없음)', inline: true },
        { name: '예약코드', value: code, inline: true },
        { name: '짐 정보', value: luggageList, inline: true },
        { name: '보관 시작 시각', value: startFormatted, inline: true },
      ],
      footer: { text: '고객이 직접 취소함' },
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!res.ok) {
      throw new Error(`Discord webhook 실패: ${res.status} ${res.statusText}`);
    }

    this.logger.log({
      event: 'notifications.discord_cancel_sent',
      reservationId: data.reservationId,
    });
  }

  // ─── Kakao 알림톡 ─────────────────────────────────────────────────

  private async sendKakaoCancelAlimtalk(data: CancelNotificationData): Promise<void> {
    const apiKey = this.configService.get<string>('SOLAPI_API_KEY');
    const apiSecret = this.configService.get<string>('SOLAPI_API_SECRET');
    const pfId = this.configService.get<string>('SOLAPI_KAKAO_PF_ID');
    const templateId = this.configService.get<string>('SOLAPI_KAKAO_CANCEL_TEMPLATE_ID');

    if (!apiKey || !apiSecret || !pfId || !templateId) {
      this.logger.debug('Solapi 환경변수 미설정 — 카카오 취소 알림톡 스킵');
      return;
    }

    if (!data.ownerPhone) {
      this.logger.debug('ownerPhone 없음 — 카카오 취소 알림톡 스킵');
      return;
    }

    const code = shortCode(data.reservationId);
    const luggageList = buildLuggageList(data.luggageType, data.bagCount);
    const startFormatted = formatKoreanDateTime(data.startTime);
    const cancelTime = formatKoreanDateTime(new Date());

    const client = new SolapiMessageService(apiKey, apiSecret);

    await client.send({
      to: data.ownerPhone,
      kakaoOptions: {
        pfId,
        templateId,
        variables: {
          '#{reservation_code}': code,
          '#{customer_contact}': data.customerPhone,
          '#{luggage_list}': luggageList,
          '#{start_time}': startFormatted,
          '#{cancel_time}': cancelTime,
        },
      },
    });

    this.logger.log({
      event: 'notifications.kakao_cancel_sent',
      reservationId: data.reservationId,
      ownerPhone: data.ownerPhone,
    });
  }
}
