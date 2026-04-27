import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerSocialProviderService } from './services/customer-social-provider.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CustomerAuthController],
  providers: [CustomerAuthService, CustomerSocialProviderService],
})
export class CustomerAuthModule {}
