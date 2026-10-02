import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthGuard } from './guards/admin-auth.guard';

/**
 * 관리자 인증·계정(F-019). TokenService·PasswordService·AuthThrottlerGuard는
 * AuthModule에서 가져오고, AdminAuthGuard를 export해 관리자 API 모듈
 * (feedbacks, admin)이 공유한다.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminAuthGuard],
  exports: [AdminAuthGuard],
})
export class AdminAuthModule {}
