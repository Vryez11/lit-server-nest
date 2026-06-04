import { reservations_requested_storage_type } from '@prisma/client';
import { ReservationPricingService } from './reservation-pricing.service';

describe('ReservationPricingService', () => {
  const service = new ReservationPricingService();

  it('charges fixed 소형 price for same-day storage', () => {
    const total = service.calculateTotalAmount({
      storageType: reservations_requested_storage_type.s,
      bagCount: 2,
      startTime: new Date('2026-04-27T01:00:00.000Z'),
      endTime: new Date('2026-04-27T05:00:00.000Z'),
    });

    expect(total).toBe(9000);
  });

  it('applies progressive pricing when storage crosses midnight in KST', () => {
    // 22:00 KST → 13:00 KST 다음날 (15시간): 과금 기준일 다름 → 2일
    const total = service.calculateTotalAmount({
      storageType: reservations_requested_storage_type.s,
      bagCount: 1,
      startTime: new Date('2026-04-27T13:00:00.000Z'),
      endTime: new Date('2026-04-28T04:00:00.000Z'),
    });

    expect(total).toBe(9000);
  });

  it('charges same-day fee when storage ends before 06:00 KST next calendar day', () => {
    // 23:00 KST → 01:00 KST 다음날: 자정을 넘겼지만 06:00 전이므로 당일 요금
    const total = service.calculateTotalAmount({
      storageType: reservations_requested_storage_type.s,
      bagCount: 1,
      startTime: new Date('2026-04-27T14:00:00.000Z'), // 23:00 KST
      endTime: new Date('2026-04-27T16:00:00.000Z'),   // 01:00 KST 다음날
    });

    expect(total).toBe(4500);
  });

  it('charges two-day fee when storage ends after 06:00 KST next calendar day', () => {
    // 23:00 KST → 07:00 KST 다음날: 06:00 이후이므로 2일 요금
    const total = service.calculateTotalAmount({
      storageType: reservations_requested_storage_type.s,
      bagCount: 1,
      startTime: new Date('2026-04-27T14:00:00.000Z'), // 23:00 KST
      endTime: new Date('2026-04-27T22:00:00.000Z'),   // 07:00 KST 다음날
    });

    expect(total).toBe(9000);
  });

  it('uses 중형 and 대형 fixed prices', () => {
    expect(
      service.calculateTotalAmount({
        storageType: reservations_requested_storage_type.m,
        bagCount: 1,
        startTime: new Date('2026-04-27T01:00:00.000Z'),
        endTime: new Date('2026-04-27T05:00:00.000Z'),
      }),
    ).toBe(6000);

    expect(
      service.calculateTotalAmount({
        storageType: reservations_requested_storage_type.l,
        bagCount: 1,
        startTime: new Date('2026-04-27T01:00:00.000Z'),
        endTime: new Date('2026-04-27T05:00:00.000Z'),
      }),
    ).toBe(8000);
  });

  it('maps legacy xl storage type to 대형 pricing', () => {
    const total = service.calculateTotalAmount({
      storageType: reservations_requested_storage_type.xl,
      bagCount: 1,
      startTime: new Date('2026-04-27T01:00:00.000Z'),
      endTime: new Date('2026-04-27T05:00:00.000Z'),
    });

    expect(total).toBe(8000);
  });

  it('charges 냉장 storage at 소형 price', () => {
    const total = service.calculateTotalAmount({
      storageType: reservations_requested_storage_type.refrigeration,
      bagCount: 2,
      startTime: new Date('2026-04-27T01:00:00.000Z'),
      endTime: new Date('2026-04-27T05:00:00.000Z'),
    });

    expect(total).toBe(9000);
  });
});
