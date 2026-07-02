import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { reservations_status, storages_status } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';

/** 픽업 예정 후 이 시간이 지나면 자동 완료 처리한다. */
const AUTO_COMPLETE_GRACE_HOURS = 6;

const AUTO_COMPLETE_FROM: reservations_status[] = [
  reservations_status.confirmed,
  reservations_status.in_progress,
];

/**
 * 점주가 체크아웃을 누르지 않은 예약을 자동으로 completed 처리하는 안전망.
 * actual_end_time은 기록하지 않는다 — "점주 직접 확인" 예약과 구분되어
 * 자동 완료 건에는 리뷰 요청이 발송되지 않는다.
 */
@Injectable()
export class ReservationAutoCompleteService {
  private readonly logger = new Logger(ReservationAutoCompleteService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron(): Promise<void> {
    try {
      const result = await this.autoCompleteOverdue();
      if (result.completedCount > 0) {
        this.logger.log({
          event: 'reservation.auto_completed',
          count: result.completedCount,
        });
      }
    } catch (err: unknown) {
      this.logger.error('자동 완료 cron 실패', err);
    }
  }

  async autoCompleteOverdue(): Promise<{ completedCount: number }> {
    const cutoff = new Date(
      Date.now() - AUTO_COMPLETE_GRACE_HOURS * 60 * 60 * 1000,
    );

    return this.prisma.$transaction(async (tx) => {
      const overdue = await tx.reservations.findMany({
        where: {
          status: { in: AUTO_COMPLETE_FROM },
          end_time: { lt: cutoff },
        },
        select: { id: true, storage_id: true },
      });

      if (!overdue.length) {
        return { completedCount: 0 };
      }

      const storageIds = [
        ...new Set(
          overdue
            .map((row) => row.storage_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      if (storageIds.length) {
        await tx.storages.updateMany({
          where: { id: { in: storageIds } },
          data: { status: storages_status.available, updated_at: new Date() },
        });
      }

      // CAS: 스냅샷 이후 점주 액션으로 상태가 바뀐 행은 덮어쓰지 않는다
      const result = await tx.reservations.updateMany({
        where: {
          id: { in: overdue.map((row) => row.id) },
          status: { in: AUTO_COMPLETE_FROM },
        },
        data: {
          status: reservations_status.completed,
          updated_at: new Date(),
        },
      });

      return { completedCount: result.count };
    });
  }
}
