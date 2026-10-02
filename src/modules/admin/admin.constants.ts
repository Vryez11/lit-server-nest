import { NotImplementedException } from '@nestjs/common';

/** F-018 기본 기간 창(일). 운영 화면은 월 단위가 자연스러워 대시보드(7일)보다 길다. */
export const ADMIN_DEFAULT_RANGE_DAYS = 30;

/**
 * PR-2 뼈대 단계에서 집계 본문이 아직 없는 엔드포인트가 던진다.
 * PR-3/4/5가 각 서비스 본문을 채우면서 이 호출을 제거한다.
 */
export const notImplemented = (feature: string): NotImplementedException =>
  new NotImplementedException({
    code: 'NOT_IMPLEMENTED',
    message: `아직 구현되지 않은 기능입니다: ${feature}`,
  });
