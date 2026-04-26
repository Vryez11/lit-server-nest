import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class DashboardDateRangeQueryDto {
  @ApiPropertyOptional({
    example: '2026-04-01',
    description: '조회 시작일입니다. KST 기준 YYYY-MM-DD 형식입니다.',
  })
  @IsOptional()
  @Matches(DATE_PATTERN)
  from?: string;

  @ApiPropertyOptional({
    example: '2026-04-26',
    description: '조회 종료일입니다. KST 기준 YYYY-MM-DD 형식입니다.',
  })
  @IsOptional()
  @Matches(DATE_PATTERN)
  to?: string;
}
