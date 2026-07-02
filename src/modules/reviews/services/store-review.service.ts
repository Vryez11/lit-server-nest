import { Injectable, NotFoundException } from '@nestjs/common';
import { reviews_status } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { ListStoreReviewsQueryDto } from '../dto/store-review.dto';
import { ReviewItemDto, toReviewItem } from '../mappers/review.mapper';

export interface ReviewListResponse {
  reviews: ReviewItemDto[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
}

export interface ReviewStatisticsResponse {
  averageRating: number;
  totalReviews: number;
  respondedReviews: number;
  pendingReviews: number;
  ratingDistribution: Record<string, number>;
}

@Injectable()
export class StoreReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async listReviews(
    storeId: string,
    query: ListStoreReviewsQueryDto,
  ): Promise<ReviewListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = {
      store_id: storeId,
      ...(query.filterStatus && query.filterStatus !== 'all'
        ? { status: query.filterStatus }
        : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    const [rows, totalCount] = await Promise.all([
      this.prisma.reviews.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.reviews.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    return {
      reviews: rows.map(toReviewItem),
      totalCount,
      currentPage: page,
      totalPages,
      hasNext: page < totalPages,
    };
  }

  async respondToReview(
    storeId: string,
    reviewId: string,
    response: string,
  ): Promise<ReviewItemDto> {
    const review = await this.prisma.reviews.findFirst({
      where: { id: reviewId, store_id: storeId },
    });
    if (!review) {
      throw new NotFoundException({
        code: 'REVIEW_NOT_FOUND',
        message: '리뷰를 찾을 수 없습니다.',
      });
    }

    const updated = await this.prisma.reviews.update({
      where: { id: reviewId },
      data: {
        response: response.trim(),
        response_date: new Date(),
        status: reviews_status.responded,
        updated_at: new Date(),
      },
    });
    return toReviewItem(updated);
  }

  async getStatistics(storeId: string): Promise<ReviewStatisticsResponse> {
    const [aggregate, respondedReviews, distribution] = await Promise.all([
      this.prisma.reviews.aggregate({
        where: { store_id: storeId },
        _avg: { rating: true },
        _count: true,
      }),
      this.prisma.reviews.count({
        where: { store_id: storeId, status: reviews_status.responded },
      }),
      this.prisma.reviews.groupBy({
        by: ['rating'],
        where: { store_id: storeId },
        _count: { rating: true },
      }),
    ]);

    const totalReviews =
      typeof aggregate._count === 'number' ? aggregate._count : 0;
    const ratingDistribution: Record<string, number> = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    };
    for (const row of distribution) {
      ratingDistribution[String(row.rating)] = row._count.rating;
    }

    return {
      averageRating: Math.round((aggregate._avg.rating ?? 0) * 10) / 10,
      totalReviews,
      respondedReviews,
      pendingReviews: totalReviews - respondedReviews,
      ratingDistribution,
    };
  }
}
