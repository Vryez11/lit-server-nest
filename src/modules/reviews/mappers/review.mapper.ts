import { reviews } from '@prisma/client';

/** lit-store 앱 ReviewItem 계약 (review_models.dart) — 필드명 변경 금지, 추가만 허용 */
export interface ReviewItemDto {
  id: string;
  customerId: string;
  customerName: string;
  storeId: string;
  reservationId: string;
  /** 짐 보관 별점 */
  rating: number;
  /** 매장 서비스·할인 별점 (2026-07-03 추가, 미이용 시 null) — 앱은 아직 미표시 */
  serviceRating: number | null;
  comment: string;
  createdAt: string;
  isResponded: boolean;
  response: string | null;
  respondedAt: string | null;
  type: string;
}

export const toReviewItem = (review: reviews): ReviewItemDto => ({
  id: review.id,
  customerId: review.customer_id,
  customerName: review.customer_name,
  storeId: review.store_id,
  reservationId: review.reservation_id ?? '',
  rating: review.rating,
  serviceRating: review.service_rating,
  comment: review.comment,
  createdAt: (review.created_at ?? new Date()).toISOString(),
  isResponded: review.status === 'responded',
  response: review.response,
  respondedAt: review.response_date?.toISOString() ?? null,
  type: String(review.type),
});
