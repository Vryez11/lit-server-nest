import { reservations_requested_storage_type } from '@prisma/client';

/** 소형 / 중형 / 대형 고정 요금 (원, 가방 1개·1일 기준) */
export const FROZEN_STORAGE_PRICES = {
  s: 4500,
  m: 6000,
  l: 8000,
} as const;

/** 냉장 보관도 소형과 동일 단가 */
export const FROZEN_REFRIGERATION_PRICE = FROZEN_STORAGE_PRICES.s;

export type BillingStorageType = keyof typeof FROZEN_STORAGE_PRICES;

export const STORAGE_SIZE_LABELS: Record<BillingStorageType, string> = {
  s: '소형',
  m: '중형',
  l: '대형',
};

/** 익일 누진 계산에 사용하는 KST 타임존 */
export const STORAGE_BILLING_TIMEZONE = 'Asia/Seoul';

const STORAGE_ASSIGNMENT_ALIASES: Partial<
  Record<
    reservations_requested_storage_type,
    reservations_requested_storage_type
  >
> = {
  [reservations_requested_storage_type.xl]:
    reservations_requested_storage_type.l,
  [reservations_requested_storage_type.special]:
    reservations_requested_storage_type.l,
};

export const normalizeStorageAssignmentType = (
  storageType: reservations_requested_storage_type,
): reservations_requested_storage_type =>
  STORAGE_ASSIGNMENT_ALIASES[storageType] ?? storageType;

export const normalizeBillingStorageType = (
  storageType: reservations_requested_storage_type,
): BillingStorageType => {
  const resolved = normalizeStorageAssignmentType(storageType);

  if (
    resolved === reservations_requested_storage_type.s ||
    resolved === reservations_requested_storage_type.m ||
    resolved === reservations_requested_storage_type.l
  ) {
    return resolved;
  }

  if (resolved === reservations_requested_storage_type.refrigeration) {
    return reservations_requested_storage_type.s;
  }

  return reservations_requested_storage_type.s;
};

export const getFrozenPricePerBagPerDay = (
  storageType: reservations_requested_storage_type,
): number => {
  if (
    storageType === reservations_requested_storage_type.refrigeration ||
    normalizeStorageAssignmentType(storageType) ===
      reservations_requested_storage_type.refrigeration
  ) {
    return FROZEN_REFRIGERATION_PRICE;
  }

  const billingType = normalizeBillingStorageType(storageType);
  return FROZEN_STORAGE_PRICES[billingType];
};
