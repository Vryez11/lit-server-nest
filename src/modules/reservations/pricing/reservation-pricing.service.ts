import { Injectable } from '@nestjs/common';
import { reservations_requested_storage_type } from '@prisma/client';
import {
  getFrozenPricePerBagPerDay,
  STORAGE_BILLING_TIMEZONE,
} from './reservation-pricing.constants';

export type ReservationPricingInput = {
  storageType: reservations_requested_storage_type;
  bagCount: number;
  startTime: Date;
  endTime: Date;
};

@Injectable()
export class ReservationPricingService {
  calculateTotalAmount(input: ReservationPricingInput): number {
    const pricePerBagPerDay = getFrozenPricePerBagPerDay(input.storageType);
    const storageDays = this.countStorageDays(input.startTime, input.endTime);

    return pricePerBagPerDay * input.bagCount * storageDays;
  }

  countStorageDays(startTime: Date, endTime: Date): number {
    const startDate = this.toBillingDateKey(startTime);
    const endDate = this.toBillingDateKey(endTime);
    const startMs = this.toKstMidnightMs(startDate);
    const endMs = this.toKstMidnightMs(endDate);

    return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
  }

  // 과금 기준일 경계: 자정(00:00) 대신 오전 06:00 사용.
  // 00:00~05:59 KST는 전날 영업일로 취급 — 심야 영업(01:00 마감 등)에서
  // 자정을 넘겨도 같은 영업일 요금으로 계산됨.
  private toBillingDateKey(date: Date): string {
    const BILLING_DAY_OFFSET_MS = 6 * 60 * 60 * 1000; // 6시간
    const shifted = new Date(date.getTime() - BILLING_DAY_OFFSET_MS);
    return shifted.toLocaleDateString('en-CA', {
      timeZone: STORAGE_BILLING_TIMEZONE,
    });
  }

  private toKstMidnightMs(dateKey: string): number {
    return new Date(`${dateKey}T00:00:00+09:00`).getTime();
  }
}
