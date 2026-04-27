import { customers } from '@prisma/client';
import {
  CustomerAuthResponseDto,
  CustomerMeResponseDto,
} from '../dto/customer-auth.dto';

export const toCustomerMeResponse = (
  customer: customers,
): CustomerMeResponseDto => ({
  id: customer.id,
  email: customer.email,
  name: customer.name,
  phoneNumber: customer.phone_number,
  provider: customer.provider_type,
  profileImage: customer.profile_image_url,
});

export const toCustomerAuthResponse = (params: {
  customer: customers;
  isNewUser: boolean;
  accessToken: string;
  refreshToken: string;
  providerRefreshToken?: string | null;
}): CustomerAuthResponseDto => ({
  isNewUser: params.isNewUser,
  accessToken: params.accessToken,
  refreshToken: params.refreshToken,
  providerRefreshToken: params.providerRefreshToken ?? null,
  userId: params.customer.id,
  customerId: params.customer.id,
  name: params.customer.name,
  email: params.customer.email,
  phoneNumber: params.customer.phone_number,
  profileImage: params.customer.profile_image_url,
  birthDate: params.customer.birth_date,
  carrier: params.customer.carrier,
  gender: params.customer.gender,
  termsAgreed: params.customer.terms_agreed,
  privacyAgreed: params.customer.privacy_agreed,
  locationAgreed: params.customer.location_agreed,
  marketingAgreed: params.customer.marketing_agreed,
  provider: params.customer.provider_type,
});
