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

/**
 * 실제로 판매·배정하는 규격 — 소형/중형/대형 3종.
 *
 * DB enum(reservations_requested_storage_type)에는 xl·special·refrigeration도 남아 있지만
 * 과거 예약 행 보존을 위한 것이고 신규 판매는 하지 않는다. 2026-08 기준 프로덕션 12개 매장
 * 모두 소·중·대만 활성이고 특수·냉장을 켠 매장은 0곳이다.
 * xl·special은 배정 시 l로 흡수되고(STORAGE_ASSIGNMENT_ALIASES), refrigeration은 판매하지 않는다.
 */
export const SELLABLE_STORAGE_TYPES = [
  reservations_requested_storage_type.s,
  reservations_requested_storage_type.m,
  reservations_requested_storage_type.l,
] as const;

/**
 * 규격 ↔ store_settings 컬럼 매핑.
 *
 * 화면 '소형'이 m_* 컬럼에, '중형'이 l_*, '대형'이 xl_*에 저장되는 한 칸 밀린 오프셋이
 * 역사적 이유로 남아 있다(s_* 컬럼은 폐기된 '초소형' 자리라 아무도 쓰지 않는다).
 * 이 오프셋을 네 곳(getMaxCapacity·buildStorageConfigs·buildSettingsData·응답 매퍼)이
 * 각자 인라인으로 알고 있었고, 그 틈에서 보관함이 통째로 maintenance로 강등되는 사고가 났다.
 *
 * 현재 이 상수를 쓰는 곳은 판매/배정 경로 두 곳(getMaxCapacity·buildStorageConfigs)이다.
 * 설정 저장(buildSettingsData)과 응답 매퍼는 아직 인라인이지만, syncFromSettings가
 * 저장된 store_settings 행을 소스로 삼도록 바뀌어 둘이 어긋날 수는 없다.
 * 오프셋 교정은 데이터 마이그레이션이 필요한 별도 과제다.
 */
export const STORAGE_SETTINGS_COLUMNS: Record<
  BillingStorageType,
  StorageTypeBinding
> = {
  s: { capacity: 'm_max_capacity', enabled: 'm_enabled', numberPrefix: 'S' },
  m: { capacity: 'l_max_capacity', enabled: 'l_enabled', numberPrefix: 'M' },
  l: { capacity: 'xl_max_capacity', enabled: 'xl_enabled', numberPrefix: 'L' },
};

export type StorageTypeBinding = {
  /** store_settings 수용량 컬럼 */
  capacity: 'm_max_capacity' | 'l_max_capacity' | 'xl_max_capacity';
  /** store_settings 활성 여부 컬럼 */
  enabled: 'm_enabled' | 'l_enabled' | 'xl_enabled';
  /** 보관함 번호 접두사 (S1, M1, L1) */
  numberPrefix: 'S' | 'M' | 'L';
};

export type StorageEnabledSettings = {
  m_enabled?: boolean | null;
  l_enabled?: boolean | null;
  xl_enabled?: boolean | null;
};

/**
 * enabled 컬럼의 NULL은 스키마 기본값(true)으로 해석한다.
 * 판매(getMaxCapacity)·보관함 동기화(buildStorageConfigs)·설정 응답 매퍼가 이 해석을
 * 공유해야 한다 — 세 소비처가 NULL을 서로 다르게 읽으면, 화면은 켜져 있는데
 * 보관함만 maintenance로 강등되어 예약이 접수 상태로 죽는 사고가 난다.
 */
export const isStorageTypeEnabled = (
  settings: StorageEnabledSettings | null | undefined,
  storageType: BillingStorageType,
): boolean => settings?.[STORAGE_SETTINGS_COLUMNS[storageType].enabled] ?? true;

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
