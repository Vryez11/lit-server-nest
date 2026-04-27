import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  customer_auth_providers_provider_type,
  customers,
  customers_provider_type,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { TokenService } from '../auth/services/token.service';
import {
  CustomerAuthResponseDto,
  CustomerLogoutDto,
  CustomerMeResponseDto,
  CustomerMessageResponseDto,
  CustomerNotificationSettingsResponseDto,
  CustomerRefreshTokenDto,
  CustomerRefreshTokenResponseDto,
  CustomerSignupDto,
  CustomerSocialLoginDto,
  UpdateCustomerMeDto,
  UpdateCustomerNotificationSettingsDto,
} from './dto/customer-auth.dto';
import {
  toCustomerAuthResponse,
  toCustomerMeResponse,
} from './mappers/customer-auth.mapper';
import {
  CustomerSocialProviderService,
  VerifiedSocialProfile,
} from './services/customer-social-provider.service';

const DEFAULT_NOTIFICATION_SETTINGS: CustomerNotificationSettingsResponseDto = {
  pushEnabled: true,
  emailEnabled: true,
  smsEnabled: false,
  marketingEnabled: false,
};

@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly socialProviderService: CustomerSocialProviderService,
  ) {}

  async socialLogin(
    dto: CustomerSocialLoginDto,
  ): Promise<CustomerAuthResponseDto> {
    const provider = this.normalizeProvider(dto.provider);
    const providerAccessToken = this.getProviderAccessToken(dto);
    const verifiedProfile = await this.socialProviderService.verifyAccessToken(
      provider,
      providerAccessToken,
    );

    this.assertRequestedSocialIdMatches(dto.socialId, verifiedProfile);

    const now = new Date();
    const { customer, isNewUser } = await this.prisma
      .$transaction(async (tx) => {
        const existingCustomer = await tx.customers.findFirst({
          where: {
            provider_type: provider,
            provider_id: verifiedProfile.providerId,
          },
        });

        if (existingCustomer?.name === '탈퇴회원') {
          await this.deleteWithdrawnCustomer(tx, existingCustomer.id);
        }

        const shouldCreate =
          !existingCustomer || existingCustomer.name === '탈퇴회원';
        const activeCustomer = shouldCreate
          ? await this.createSocialCustomer(
              tx,
              provider,
              dto,
              verifiedProfile,
              now,
            )
          : await this.updateExistingSocialCustomer(
              tx,
              existingCustomer,
              dto,
              verifiedProfile,
              now,
            );

        await this.upsertAuthProvider(tx, activeCustomer.id, provider, {
          providerId: verifiedProfile.providerId,
          email: verifiedProfile.email,
          rawProfile: verifiedProfile.rawProfile,
        });

        return {
          customer: activeCustomer,
          isNewUser: shouldCreate,
        };
      })
      .catch((error: unknown) => {
        throw this.toPrismaMutationError(error);
      });

    return this.issueAuthResponse({
      customer,
      isNewUser,
      providerRefreshToken: dto.refreshToken ?? null,
    });
  }

  async signupCustomer(
    customerId: string,
    tokenProvider: string | undefined,
    dto: CustomerSignupDto,
  ): Promise<CustomerAuthResponseDto> {
    const provider = this.normalizeProvider(dto.provider ?? tokenProvider);
    const providerAccessToken = this.getOptionalProviderAccessToken(dto);
    const verifiedProfile = providerAccessToken
      ? await this.socialProviderService.verifyAccessToken(
          provider,
          providerAccessToken,
        )
      : null;

    if (verifiedProfile) {
      this.assertRequestedSocialIdMatches(dto.socialId, verifiedProfile);
    }

    const customer = await this.prisma
      .$transaction(async (tx) => {
        const existingCustomer = await tx.customers.findUnique({
          where: { id: customerId },
        });

        if (!existingCustomer) {
          throw new NotFoundException({
            code: 'USER_NOT_FOUND',
            message: '고객 정보를 찾을 수 없습니다.',
          });
        }

        if (
          verifiedProfile &&
          existingCustomer.provider_id &&
          existingCustomer.provider_id !== verifiedProfile.providerId
        ) {
          throw new ForbiddenException({
            code: 'PROVIDER_ID_MISMATCH',
            message: '토큰의 소셜 계정과 가입 고객이 일치하지 않습니다.',
          });
        }

        const updatedCustomer = await tx.customers.update({
          where: { id: customerId },
          data: this.createCustomerUpdateData(dto, verifiedProfile),
        });

        if (verifiedProfile) {
          await this.upsertAuthProvider(tx, customerId, provider, {
            providerId: verifiedProfile.providerId,
            email: verifiedProfile.email,
            rawProfile: verifiedProfile.rawProfile,
          });
        }

        return updatedCustomer;
      })
      .catch((error: unknown) => {
        throw this.toPrismaMutationError(error);
      });

    return this.issueAuthResponse({
      customer,
      isNewUser: false,
      providerRefreshToken: dto.refreshToken ?? null,
    });
  }

  async refresh(
    dto: CustomerRefreshTokenDto,
  ): Promise<CustomerRefreshTokenResponseDto> {
    const payload = this.tokenService.verifyCustomerRefreshToken(
      dto.refreshToken,
    );
    const tokenRecord = await this.prisma.customer_refresh_tokens.findFirst({
      where: { token: dto.refreshToken },
    });

    if (!tokenRecord || tokenRecord.customer_id !== payload.customerId) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'refreshToken이 유효하지 않습니다.',
      });
    }

    if (tokenRecord.expires_at <= new Date()) {
      await this.prisma.customer_refresh_tokens.deleteMany({
        where: { token: dto.refreshToken },
      });

      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_EXPIRED',
        message: 'refreshToken이 만료되었습니다.',
      });
    }

    const customer = await this.prisma.customers.findUnique({
      where: { id: payload.customerId },
      select: { id: true, provider_type: true },
    });

    if (!customer) {
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: '고객 정보를 찾을 수 없습니다.',
      });
    }

    const accessToken = this.tokenService.generateCustomerAccessToken(
      customer.id,
      customer.provider_type,
    );
    const refreshToken = this.tokenService.generateCustomerRefreshToken(
      customer.id,
      customer.provider_type,
    );

    await this.prisma.customer_refresh_tokens.update({
      where: { id: tokenRecord.id },
      data: {
        token: refreshToken,
        expires_at: this.tokenService.getRefreshTokenExpiresAt(),
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async logout(dto: CustomerLogoutDto): Promise<CustomerMessageResponseDto> {
    if (dto.refreshToken) {
      await this.prisma.customer_refresh_tokens.deleteMany({
        where: { token: dto.refreshToken },
      });
    }

    return {
      message: '로그아웃 완료',
    };
  }

  async withdraw(customerId: string): Promise<CustomerMessageResponseDto> {
    await this.prisma
      .$transaction(async (tx) => {
        await tx.customer_refresh_tokens.deleteMany({
          where: { customer_id: customerId },
        });
        await tx.customer_auth_providers.deleteMany({
          where: { customer_id: customerId },
        });
        await tx.customers.update({
          where: { id: customerId },
          data: {
            email: null,
            name: '탈퇴회원',
            phone_number: null,
            birth_date: null,
            carrier: null,
            gender: null,
            profile_image_url: null,
            provider_id: `withdrawn_${customerId}`,
            updated_at: new Date(),
          },
        });
      })
      .catch((error: unknown) => {
        throw this.toPrismaMutationError(error);
      });

    return {
      message: '회원탈퇴가 완료되었습니다',
    };
  }

  async getMe(customerId: string): Promise<CustomerMeResponseDto> {
    const customer = await this.findCustomerOrThrow(customerId);

    return toCustomerMeResponse(customer);
  }

  async updateMe(
    customerId: string,
    dto: UpdateCustomerMeDto,
  ): Promise<CustomerMeResponseDto> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '수정할 필드가 없습니다.',
      });
    }

    const customer = await this.prisma.customers
      .update({
        where: { id: customerId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.email !== undefined
            ? { email: this.normalizeEmail(dto.email) }
            : {}),
          ...(dto.phoneNumber !== undefined
            ? { phone_number: dto.phoneNumber.trim() }
            : {}),
          ...(dto.profileImage !== undefined
            ? { profile_image_url: dto.profileImage }
            : {}),
          updated_at: new Date(),
        },
      })
      .catch((error: unknown) => {
        throw this.toPrismaMutationError(error);
      });

    return toCustomerMeResponse(customer);
  }

  async getNotificationSettings(
    customerId: string,
  ): Promise<CustomerNotificationSettingsResponseDto> {
    await this.assertCustomerExists(customerId);

    return DEFAULT_NOTIFICATION_SETTINGS;
  }

  async updateNotificationSettings(
    customerId: string,
    dto: UpdateCustomerNotificationSettingsDto,
  ): Promise<CustomerNotificationSettingsResponseDto> {
    void dto;
    await this.assertCustomerExists(customerId);

    throw new BadRequestException({
      code: 'DB_MIGRATION_NEEDED',
      message:
        'customers 테이블에 알림 설정 컬럼이 필요합니다. 현재 스키마에서는 조회 기본값만 제공합니다.',
    });
  }

  private async issueAuthResponse(params: {
    customer: customers;
    isNewUser: boolean;
    providerRefreshToken?: string | null;
  }): Promise<CustomerAuthResponseDto> {
    const accessToken = this.tokenService.generateCustomerAccessToken(
      params.customer.id,
      params.customer.provider_type,
    );
    const refreshToken = this.tokenService.generateCustomerRefreshToken(
      params.customer.id,
      params.customer.provider_type,
    );

    await this.prisma.customer_refresh_tokens.create({
      data: {
        customer_id: params.customer.id,
        token: refreshToken,
        expires_at: this.tokenService.getRefreshTokenExpiresAt(),
      },
    });

    return toCustomerAuthResponse({
      customer: params.customer,
      isNewUser: params.isNewUser,
      accessToken,
      refreshToken,
      providerRefreshToken: params.providerRefreshToken,
    });
  }

  private async updateExistingSocialCustomer(
    tx: Prisma.TransactionClient,
    customer: customers,
    dto: CustomerSocialLoginDto,
    verifiedProfile: VerifiedSocialProfile,
    now: Date,
  ): Promise<customers> {
    return tx.customers.update({
      where: { id: customer.id },
      data: {
        email:
          customer.email ??
          this.normalizeNullableEmail(dto.email ?? verifiedProfile.email),
        name: dto.name ?? customer.name ?? verifiedProfile.name,
        phone_number: dto.phoneNumber ?? customer.phone_number,
        profile_image_url:
          dto.profileImage ??
          customer.profile_image_url ??
          verifiedProfile.profileImage,
        birth_date:
          this.parseOptionalDate(dto.birthDate) ?? customer.birth_date,
        carrier: dto.carrier ?? customer.carrier,
        gender: dto.gender ?? customer.gender,
        last_login_at: now,
        updated_at: now,
      },
    });
  }

  private async createSocialCustomer(
    tx: Prisma.TransactionClient,
    provider: customers_provider_type,
    dto: CustomerSocialLoginDto,
    verifiedProfile: VerifiedSocialProfile,
    now: Date,
  ): Promise<customers> {
    const customerId = `customer_${randomUUID()}`;

    return tx.customers
      .create({
        data: {
          id: customerId,
          email: this.normalizeNullableEmail(
            dto.email ?? verifiedProfile.email,
          ),
          name: dto.name ?? verifiedProfile.name,
          phone_number: dto.phoneNumber ?? null,
          birth_date: this.parseOptionalDate(dto.birthDate),
          carrier: dto.carrier ?? null,
          gender: dto.gender ?? null,
          profile_image_url: dto.profileImage ?? verifiedProfile.profileImage,
          provider_type: provider,
          provider_id: verifiedProfile.providerId,
          terms_agreed: this.toTinyInt(dto.termsAgreed),
          privacy_agreed: this.toTinyInt(dto.privacyAgreed),
          location_agreed: this.toTinyInt(dto.locationAgreed),
          marketing_agreed: this.toTinyInt(dto.marketingAgreed),
          last_login_at: now,
          created_at: now,
          updated_at: now,
        },
      })
      .catch((error: unknown) => {
        throw this.toPrismaMutationError(error);
      });
  }

  private createCustomerUpdateData(
    dto: CustomerSignupDto,
    verifiedProfile: VerifiedSocialProfile | null,
  ): Prisma.customersUpdateInput {
    return {
      ...(dto.email !== undefined || verifiedProfile?.email
        ? {
            email: this.normalizeNullableEmail(
              dto.email ?? verifiedProfile?.email ?? null,
            ),
          }
        : {}),
      ...(dto.name !== undefined || verifiedProfile?.name
        ? { name: dto.name ?? verifiedProfile?.name ?? null }
        : {}),
      ...(dto.phoneNumber !== undefined
        ? { phone_number: dto.phoneNumber.trim() }
        : {}),
      ...(dto.birthDate !== undefined
        ? { birth_date: this.parseOptionalDate(dto.birthDate) }
        : {}),
      ...(dto.carrier !== undefined ? { carrier: dto.carrier } : {}),
      ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
      ...(dto.profileImage !== undefined || verifiedProfile?.profileImage
        ? {
            profile_image_url:
              dto.profileImage ?? verifiedProfile?.profileImage ?? null,
          }
        : {}),
      ...(dto.termsAgreed !== undefined
        ? { terms_agreed: this.toTinyInt(dto.termsAgreed) }
        : {}),
      ...(dto.privacyAgreed !== undefined
        ? { privacy_agreed: this.toTinyInt(dto.privacyAgreed) }
        : {}),
      ...(dto.locationAgreed !== undefined
        ? { location_agreed: this.toTinyInt(dto.locationAgreed) }
        : {}),
      ...(dto.marketingAgreed !== undefined
        ? { marketing_agreed: this.toTinyInt(dto.marketingAgreed) }
        : {}),
      ...(verifiedProfile
        ? {
            provider_id: verifiedProfile.providerId,
          }
        : {}),
      updated_at: new Date(),
    };
  }

  private async upsertAuthProvider(
    tx: Prisma.TransactionClient,
    customerId: string,
    provider: customers_provider_type,
    profile: {
      providerId: string;
      email: string | null;
      rawProfile: unknown;
    },
  ): Promise<void> {
    const providerType = this.toAuthProviderType(provider);

    await tx.customer_auth_providers.upsert({
      where: {
        provider_type_provider_id: {
          provider_type: providerType,
          provider_id: profile.providerId,
        },
      },
      create: {
        customer_id: customerId,
        provider_type: providerType,
        provider_id: profile.providerId,
        email: profile.email,
        raw_profile: profile.rawProfile as Prisma.InputJsonValue,
      },
      update: {
        customer_id: customerId,
        email: profile.email,
        raw_profile: profile.rawProfile as Prisma.InputJsonValue,
        updated_at: new Date(),
      },
    });
  }

  private async deleteWithdrawnCustomer(
    tx: Prisma.TransactionClient,
    customerId: string,
  ): Promise<void> {
    await tx.customer_refresh_tokens.deleteMany({
      where: { customer_id: customerId },
    });
    await tx.customer_auth_providers.deleteMany({
      where: { customer_id: customerId },
    });
    await tx.customers.delete({
      where: { id: customerId },
    });
  }

  private async findCustomerOrThrow(customerId: string): Promise<customers> {
    const customer = await this.prisma.customers.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: '고객 정보를 찾을 수 없습니다.',
      });
    }

    return customer;
  }

  private async assertCustomerExists(customerId: string): Promise<void> {
    const customer = await this.prisma.customers.findUnique({
      where: { id: customerId },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: '고객 정보를 찾을 수 없습니다.',
      });
    }
  }

  private getProviderAccessToken(dto: CustomerSocialLoginDto): string {
    const token = this.getOptionalProviderAccessToken(dto);

    if (!token) {
      throw new BadRequestException({
        code: 'PROVIDER_TOKEN_REQUIRED',
        message: 'provider accessToken이 필요합니다.',
      });
    }

    return token;
  }

  private getOptionalProviderAccessToken(
    dto: Pick<CustomerSocialLoginDto, 'accessToken' | 'socialAccessToken'>,
  ): string | null {
    return dto.accessToken?.trim() || dto.socialAccessToken?.trim() || null;
  }

  private assertRequestedSocialIdMatches(
    socialId: string | undefined,
    verifiedProfile: VerifiedSocialProfile,
  ): void {
    if (socialId && socialId !== verifiedProfile.providerId) {
      throw new UnauthorizedException({
        code: 'PROVIDER_ID_MISMATCH',
        message: '요청한 socialId와 provider accessToken의 사용자가 다릅니다.',
      });
    }
  }

  private normalizeProvider(provider: unknown): customers_provider_type {
    if (typeof provider !== 'string' || provider.length === 0) {
      throw new BadRequestException({
        code: 'PROVIDER_REQUIRED',
        message: 'provider가 필요합니다.',
      });
    }

    const normalized = provider.toLowerCase();

    if (
      !Object.values(customers_provider_type).includes(
        normalized as customers_provider_type,
      )
    ) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_PROVIDER',
        message: `지원하지 않는 provider입니다: ${provider}`,
      });
    }

    return normalized as customers_provider_type;
  }

  private toAuthProviderType(
    provider: customers_provider_type,
  ): customer_auth_providers_provider_type {
    return provider;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeNullableEmail(
    email: string | null | undefined,
  ): string | null {
    return email ? this.normalizeEmail(email) : null;
  }

  private parseOptionalDate(value: string | undefined): Date | null {
    if (!value) {
      return null;
    }

    return new Date(`${value}T00:00:00.000Z`);
  }

  private toTinyInt(value: boolean | undefined): number {
    return value ? 1 : 0;
  }

  private toPrismaMutationError(error: unknown): Error {
    if (this.isPrismaErrorCode(error, 'P2002')) {
      return new BadRequestException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: '이미 등록된 이메일입니다.',
      });
    }

    if (this.isPrismaErrorCode(error, 'P2025')) {
      return new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: '고객 정보를 찾을 수 없습니다.',
      });
    }

    return error instanceof Error
      ? error
      : new BadRequestException({
          code: 'CUSTOMER_AUTH_MUTATION_FAILED',
          message: '고객 인증 정보 저장에 실패했습니다.',
        });
  }

  private isPrismaErrorCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === code
    );
  }
}
