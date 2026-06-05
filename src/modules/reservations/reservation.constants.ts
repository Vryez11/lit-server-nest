import { reservations_status } from '@prisma/client';

export const RESERVATION_LOCALES = ['ko', 'en', 'ja', 'zh'] as const;

export type ReservationLocale = (typeof RESERVATION_LOCALES)[number];

export const DEFAULT_RESERVATION_LOCALE: ReservationLocale = 'ko';

export const normalizeReservationLocale = (
  locale?: string | null,
): ReservationLocale => {
  const normalized = String(locale ?? '').trim();

  if (RESERVATION_LOCALES.includes(normalized as ReservationLocale)) {
    return normalized as ReservationLocale;
  }

  return DEFAULT_RESERVATION_LOCALE;
};

export const ACTIVE_RESERVATION_STATUSES: reservations_status[] = [
  reservations_status.confirmed,
  reservations_status.in_progress,
];

export const RELEASE_STORAGE_STATUSES: reservations_status[] = [
  reservations_status.rejected,
  reservations_status.cancelled,
  reservations_status.completed,
];

export const TERMINAL_RESERVATION_STATUSES: reservations_status[] = [
  reservations_status.rejected,
  reservations_status.cancelled,
  reservations_status.completed,
];
