import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class ListStoreReviewsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ enum: ['all', 'responded', 'pending'] })
  @IsOptional()
  @IsIn(['all', 'responded', 'pending'])
  filterStatus?: 'all' | 'responded' | 'pending';

  @ApiPropertyOptional({ enum: ['storage', 'store'] })
  @IsOptional()
  @IsIn(['storage', 'store'])
  type?: 'storage' | 'store';

  /** 앱이 보내지만 서버는 인증 storeId만 사용 — 무시 */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storeId?: string;
}

export class RespondToReviewDto {
  @ApiPropertyOptional({ description: '앱이 body에 넣어 보냄 — 경로 :id 우선' })
  @IsOptional()
  @IsString()
  reviewId?: string;

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  response!: string;
}
