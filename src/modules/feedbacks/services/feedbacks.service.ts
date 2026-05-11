import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { feedbacks_status, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../../common/database/prisma.service';
import {
  AdminFeedbackDto,
  AdminFeedbackListQueryDto,
  AdminFeedbackListResponseDto,
  CreateFeedbackDto,
  CreateFeedbackResponseDto,
  FeedbackWallQueryDto,
  FeedbackWallResponseDto,
  UpdateFeedbackDto,
} from '../dto/feedback.dto';
import {
  emptyFeedbackCounts,
  toAdminFeedbackResponse,
  toPublicFeedbackResponse,
} from '../mappers/feedback.mapper';

@Injectable()
export class FeedbacksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async createFeedback(
    dto: CreateFeedbackDto,
    ip: string,
  ): Promise<CreateFeedbackResponseDto> {
    const feedback = await this.prisma.feedbacks.create({
      data: {
        id: `fb_${randomUUID()}`,
        category: dto.category,
        status: feedbacks_status.reviewing,
        message: dto.message.trim(),
        nickname: dto.nickname?.trim() || null,
        phone: dto.phone?.trim() || null,
        locale: dto.locale ?? null,
        pathname: dto.pathname?.trim() || null,
        ip_hash: this.hashIp(ip),
        is_public: false,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    return {
      id: feedback.id,
      createdAt: feedback.created_at.toISOString(),
    };
  }

  async listWall(
    query: FeedbackWallQueryDto,
  ): Promise<FeedbackWallResponseDto> {
    const take = query.limit + 1;
    const publishedBefore = this.parseCursor(query.cursor);

    const feedbacks = await this.prisma.feedbacks.findMany({
      where: {
        is_public: true,
        deleted_at: null,
        status: {
          in: [
            feedbacks_status.reviewing,
            feedbacks_status.inProgress,
            feedbacks_status.shipped,
          ],
        },
        published_at: {
          not: null,
          ...(publishedBefore ? { lt: publishedBefore } : {}),
        },
      },
      orderBy: [{ published_at: 'desc' }, { created_at: 'desc' }],
      take,
    });

    const pageItems = feedbacks.slice(0, query.limit);
    const hasNext = feedbacks.length > query.limit;
    const lastItem = pageItems[pageItems.length - 1];

    return {
      items: pageItems.map(toPublicFeedbackResponse),
      nextCursor:
        hasNext && lastItem?.published_at
          ? lastItem.published_at.toISOString()
          : null,
    };
  }

  async listAdmin(
    query: AdminFeedbackListQueryDto,
  ): Promise<AdminFeedbackListResponseDto> {
    const where: Prisma.feedbacksWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.includeDeleted ? {} : { deleted_at: null }),
    };

    const [items, total, counts] = await this.prisma.$transaction([
      this.prisma.feedbacks.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.feedbacks.count({ where }),
      this.prisma.feedbacks.groupBy({
        by: ['status'],
        where: query.includeDeleted ? {} : { deleted_at: null },
        orderBy: { status: 'asc' },
        _count: true,
      }),
    ]);

    const countMap = emptyFeedbackCounts();
    for (const count of counts) {
      const countValue =
        typeof count._count === 'number'
          ? count._count
          : count._count && count._count !== true
            ? (count._count._all ?? 0)
            : 0;

      countMap[count.status] = countValue;
    }

    return {
      items: items.map(toAdminFeedbackResponse),
      total,
      limit: query.limit,
      offset: query.offset,
      meta: {
        counts: countMap,
      },
    };
  }

  async updateAdmin(
    feedbackId: string,
    dto: UpdateFeedbackDto,
  ): Promise<AdminFeedbackDto> {
    const existing = await this.prisma.feedbacks.findUnique({
      where: { id: feedbackId },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'FEEDBACK_NOT_FOUND',
        message: '피드백을 찾을 수 없습니다.',
      });
    }

    const now = new Date();
    const data: Prisma.feedbacksUpdateInput = {
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.isPublic !== undefined ? { is_public: dto.isPublic } : {}),
      ...(dto.response !== undefined
        ? { response: dto.response?.trim() || null }
        : {}),
      ...(dto.responseLocale !== undefined
        ? { response_locale: dto.responseLocale ?? null }
        : {}),
      ...(dto.deleted !== undefined
        ? { deleted_at: dto.deleted ? now : null }
        : {}),
      updated_at: now,
    };

    if (
      dto.isPublic === true &&
      !existing.is_public &&
      !existing.published_at
    ) {
      data.published_at = now;
    }

    const updated = await this.prisma.feedbacks.update({
      where: { id: feedbackId },
      data,
    });

    return toAdminFeedbackResponse(updated);
  }

  private hashIp(ip: string): string {
    const secret = this.configService.getOrThrow<string>(
      'FEEDBACK_IP_HASH_SECRET',
    );

    return createHash('sha256').update(`${ip}:${secret}`).digest('hex');
  }

  private parseCursor(cursor?: string): Date | undefined {
    if (!cursor) {
      return undefined;
    }

    const date = new Date(cursor);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
}
