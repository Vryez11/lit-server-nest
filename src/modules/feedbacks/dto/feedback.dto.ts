import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { feedbacks_category, feedbacks_status } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  emptyToUndefined,
  optionalBoolean,
  optionalNumber,
} from '../../../common/transformers/legacy-input.transformer';

export enum FeedbackLocale {
  Ko = 'ko',
  En = 'en',
  Ja = 'ja',
  Zh = 'zh',
}

export class CreateFeedbackDto {
  @ApiProperty({ enum: feedbacks_category })
  @IsEnum(feedbacks_category)
  category!: feedbacks_category;

  @ApiProperty({ minLength: 5, maxLength: 1000 })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  message!: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ enum: FeedbackLocale })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(FeedbackLocale)
  locale?: FeedbackLocale;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(200)
  pathname?: string;
}

export class FeedbackWallQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Transform(optionalNumber)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @ApiPropertyOptional({
    description: '이전 페이지 마지막 항목의 publishedAt ISO 문자열입니다.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  cursor?: string;
}

export class AdminFeedbackListQueryDto {
  @ApiPropertyOptional({ enum: feedbacks_status })
  @IsOptional()
  @IsEnum(feedbacks_status)
  status?: feedbacks_status;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(optionalNumber)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Transform(optionalNumber)
  @IsInt()
  @Min(0)
  offset = 0;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  includeDeleted = false;
}

export class UpdateFeedbackDto {
  @ApiPropertyOptional({ enum: feedbacks_status })
  @IsOptional()
  @IsEnum(feedbacks_status)
  status?: feedbacks_status;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  response?: string;

  @ApiPropertyOptional({ enum: FeedbackLocale })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(FeedbackLocale)
  responseLocale?: FeedbackLocale;

  @ApiPropertyOptional({
    description: 'true면 소프트 삭제, false면 복원합니다.',
  })
  @IsOptional()
  @IsBoolean()
  deleted?: boolean;
}

export class CreateFeedbackResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  createdAt!: string;
}

export class PublicFeedbackDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: feedbacks_category })
  category!: feedbacks_category;

  @ApiProperty({
    enum: [
      feedbacks_status.reviewing,
      feedbacks_status.inProgress,
      feedbacks_status.shipped,
    ],
  })
  status!: feedbacks_status;

  @ApiProperty()
  message!: string;

  @ApiProperty({ nullable: true })
  nickname!: string | null;

  @ApiProperty({ nullable: true })
  response!: string | null;

  @ApiProperty({ nullable: true })
  responseLocale!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ nullable: true })
  publishedAt!: string | null;
}

export class FeedbackWallResponseDto {
  @ApiProperty({ type: [PublicFeedbackDto] })
  items!: PublicFeedbackDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}

export class AdminFeedbackDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: feedbacks_category })
  category!: feedbacks_category;

  @ApiProperty({ enum: feedbacks_status })
  status!: feedbacks_status;

  @ApiProperty()
  message!: string;

  @ApiProperty({ nullable: true })
  nickname!: string | null;

  @ApiProperty({ nullable: true })
  phone!: string | null;

  @ApiProperty({ nullable: true })
  locale!: string | null;

  @ApiProperty({ nullable: true })
  pathname!: string | null;

  @ApiProperty()
  isPublic!: boolean;

  @ApiProperty({ nullable: true })
  response!: string | null;

  @ApiProperty({ nullable: true })
  responseLocale!: string | null;

  @ApiProperty({ nullable: true })
  publishedAt!: string | null;

  @ApiProperty({ nullable: true })
  deletedAt!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class AdminFeedbackCountsDto {
  @ApiProperty()
  reviewing!: number;

  @ApiProperty()
  inProgress!: number;

  @ApiProperty()
  shipped!: number;

  @ApiProperty()
  rejected!: number;
}

export class AdminFeedbackListMetaDto {
  @ApiProperty({ type: AdminFeedbackCountsDto })
  counts!: AdminFeedbackCountsDto;
}

export class AdminFeedbackListResponseDto {
  @ApiProperty({ type: [AdminFeedbackDto] })
  items!: AdminFeedbackDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;

  @ApiProperty({ type: AdminFeedbackListMetaDto })
  meta!: AdminFeedbackListMetaDto;
}
