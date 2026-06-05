import { reservations_status } from '@prisma/client';

export const DEFAULT_RESERVATION_LOCALE = 'ko-KR';

export const normalizeReservationLocale = (
  locale?: string | null,
): string => {
  const normalized = String(locale ?? '').trim();

  return normalized || DEFAULT_RESERVATION_LOCALE;
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
