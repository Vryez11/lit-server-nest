import { feedbacks, feedbacks_status } from '@prisma/client';
import {
  AdminFeedbackDto,
  PublicFeedbackDto,
} from '../dto/feedback.dto';

export const toPublicFeedbackResponse = (
  feedback: feedbacks,
): PublicFeedbackDto => ({
  id: feedback.id,
  category: feedback.category,
  status: feedback.status as PublicFeedbackDto['status'],
  message: feedback.message,
  nickname: feedback.nickname,
  response: feedback.response,
  responseLocale: feedback.response_locale,
  createdAt: feedback.created_at.toISOString(),
  publishedAt: feedback.published_at?.toISOString() ?? null,
});

export const toAdminFeedbackResponse = (
  feedback: feedbacks,
): AdminFeedbackDto => ({
  id: feedback.id,
  category: feedback.category,
  status: feedback.status,
  message: feedback.message,
  nickname: feedback.nickname,
  phone: feedback.phone,
  locale: feedback.locale,
  pathname: feedback.pathname,
  isPublic: feedback.is_public,
  response: feedback.response,
  responseLocale: feedback.response_locale,
  publishedAt: feedback.published_at?.toISOString() ?? null,
  deletedAt: feedback.deleted_at?.toISOString() ?? null,
  createdAt: feedback.created_at.toISOString(),
  updatedAt: feedback.updated_at.toISOString(),
});

export const emptyFeedbackCounts = (): Record<feedbacks_status, number> => ({
  [feedbacks_status.reviewing]: 0,
  [feedbacks_status.inProgress]: 0,
  [feedbacks_status.shipped]: 0,
  [feedbacks_status.rejected]: 0,
});
