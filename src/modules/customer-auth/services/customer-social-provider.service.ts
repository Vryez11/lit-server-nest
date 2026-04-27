import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { customers_provider_type } from '@prisma/client';

const KAKAO_USER_ME_URL = 'https://kapi.kakao.com/v2/user/me';

export type VerifiedSocialProfile = {
  providerId: string;
  email: string | null;
  name: string | null;
  profileImage: string | null;
  rawProfile: unknown;
};

type KakaoUserMeResponse = {
  id?: string | number;
  kakao_account?: {
    email?: string;
    name?: string;
    profile?: {
      nickname?: string;
      profile_image_url?: string;
    };
  };
  properties?: {
    nickname?: string;
    profile_image?: string;
  };
};

@Injectable()
export class CustomerSocialProviderService {
  async verifyAccessToken(
    provider: customers_provider_type,
    accessToken: string,
  ): Promise<VerifiedSocialProfile> {
    if (!accessToken) {
      throw this.providerError(
        'PROVIDER_TOKEN_REQUIRED',
        'provider accessToken이 필요합니다.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (provider === customers_provider_type.kakao) {
      return this.verifyKakaoAccessToken(accessToken);
    }

    throw this.providerError(
      'UNSUPPORTED_PROVIDER',
      `지원하지 않는 소셜 로그인 provider입니다: ${provider}`,
      HttpStatus.BAD_REQUEST,
    );
  }

  private async verifyKakaoAccessToken(
    accessToken: string,
  ): Promise<VerifiedSocialProfile> {
    let response: Response;

    try {
      response = await fetch(KAKAO_USER_ME_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw this.providerError(
        'PROVIDER_UNAVAILABLE',
        '카카오 인증 서버에 연결할 수 없습니다.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const data = (await response
      .json()
      .catch(() => ({}))) as KakaoUserMeResponse & {
      msg?: string;
      message?: string;
    };

    if (response.status === Number(HttpStatus.UNAUTHORIZED)) {
      throw this.providerError(
        'PROVIDER_TOKEN_INVALID',
        '카카오 accessToken이 유효하지 않습니다.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!response.ok) {
      throw this.providerError(
        'PROVIDER_TOKEN_REJECTED',
        data.msg || data.message || '카카오 accessToken 검증에 실패했습니다.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!data.id) {
      throw this.providerError(
        'PROVIDER_TOKEN_INVALID',
        '카카오 사용자 정보를 확인할 수 없습니다.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const account = data.kakao_account ?? {};
    const profile = account.profile ?? {};
    const properties = data.properties ?? {};

    return {
      providerId: String(data.id),
      email: account.email ?? null,
      name: account.name ?? profile.nickname ?? properties.nickname ?? null,
      profileImage:
        profile.profile_image_url ?? properties.profile_image ?? null,
      rawProfile: data,
    };
  }

  private providerError(
    code: string,
    message: string,
    status: HttpStatus,
  ): HttpException {
    return new HttpException({ code, message }, status);
  }
}
