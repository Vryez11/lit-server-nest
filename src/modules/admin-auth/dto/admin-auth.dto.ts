import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({ example: 'ops@lifeistravel.kr' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(1)
  password: string;
}

export class AdminSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional({ nullable: true })
  name: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: '이번 로그인 이전의 마지막 로그인 시각. 최초 로그인이면 null.',
  })
  lastLoginAt: Date | null;
}

export class AdminAuthTokenResponseDto {
  @ApiProperty()
  token: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({ example: 3600 })
  expiresIn: number;

  @ApiProperty({ type: AdminSummaryDto })
  admin: AdminSummaryDto;
}

export class AdminInfoDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional({ nullable: true })
  name: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiPropertyOptional({ nullable: true })
  lastLoginAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  createdAt: Date | null;
}

export class AdminMessageResponseDto {
  @ApiProperty()
  message: string;
}
