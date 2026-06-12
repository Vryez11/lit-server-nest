import {
  reservations,
  reservations_status,
  stores,
  stores as StoreModel,
} from '@prisma/client';
import {
  GuestReservationItemDto,
  GuestReservationResponseDto,
} from '../dto/guest-reservation.dto';

export type GuestReservationWithStore = reservations & {
  stores?: Pick<
    stores,
    'business_name' | 'address' | 'phone_number' | 'latitude' | 'longitude'
  > | null;
};

// 그룹 status 도출 시 진행도가 낮은 상태를 우선합니다 (일부만 승인된 그룹은 아직 승인 전으로 노출).
const STATUS_PROGRESS_ORDER: reservations_status[] = [
  reservations_status.pending,
  reservations_status.pending_approval,
  reservations_status.confirmed,
  reservations_status.in_progress,
  reservations_status.completed,
  reservations_status.rejected,
  reservations_status.cancelled,
];

export const toGuestReservationResponse = (
  reservation: GuestReservationWithStore,
  options: { includeAccessToken?: boolean } = {},
): GuestReservationResponseDto =>
  toGuestReservationGroupResponse([reservation], options);

export const toGuestReservationGroupResponse = (
  rows: GuestReservationWithStore[],
  options: { includeAccessToken?: boolean } = {},
): GuestReservationResponseDto => {
  const representative =
    rows.find((row) => row.id === row.reservation_group_id) ?? rows[0];
  const members = [
    representative,
    ...rows.filter((row) => row !== representative),
  ];

  return {
    id: representative.id,
    storeId: representative.store_id,
    customerName: representative.customer_name,
    phoneNumber: representative.customer_phone,
    email: representative.customer_email,
    locale: representative.locale,
    status: deriveGroupStatus(members),
    startTime: representative.start_time,
    endTime: representative.end_time,
    duration: representative.duration,
    bagCount: sumBy(members, (row) => row.bag_count),
    totalAmount: sumBy(members, (row) => row.total_amount),
    message: representative.message,
    storageType: representative.requested_storage_type,
    groupId: representative.reservation_group_id ?? representative.id,
    items: toGuestReservationItems(members),
    paymentStatus: representative.payment_status,
    ...(options.includeAccessToken
      ? { accessToken: representative.qr_code }
      : {}),
    createdAt: representative.created_at,
    storeName: representative.stores?.business_name ?? '',
    storeAddress: representative.stores?.address ?? null,
    storePhone: representative.stores?.phone_number ?? null,
    lat: toNumberOrNull(representative.stores?.latitude),
    lng: toNumberOrNull(representative.stores?.longitude),
  };
};

export const toGuestStoreName = (
  store: Pick<StoreModel, 'business_name'>,
): string => store.business_name;

const toGuestReservationItems = (
  members: GuestReservationWithStore[],
): GuestReservationItemDto[] =>
  members
    .filter(
      (
        row,
      ): row is GuestReservationWithStore & {
        requested_storage_type: NonNullable<
          GuestReservationWithStore['requested_storage_type']
        >;
      } => row.requested_storage_type !== null,
    )
    .map((row) => ({
      storageType: row.requested_storage_type,
      bagCount: row.bag_count,
      amount: row.total_amount,
    }));

const deriveGroupStatus = (
  members: GuestReservationWithStore[],
): reservations_status | null => {
  const statuses = members
    .map((row) => row.status)
    .filter((status): status is reservations_status => status !== null);

  if (!statuses.length) {
    return null;
  }

  return statuses.reduce((lowest, status) =>
    STATUS_PROGRESS_ORDER.indexOf(status) <
    STATUS_PROGRESS_ORDER.indexOf(lowest)
      ? status
      : lowest,
  );
};

const sumBy = (
  members: GuestReservationWithStore[],
  pick: (row: GuestReservationWithStore) => number,
): number => members.reduce((total, row) => total + pick(row), 0);

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
};
