import type { Company, User } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  companyId: string;
  email: string;
  roles: string[];
  sessionId: string;
}

export interface LoginResult {
  accessToken: string;
}

export interface LoginWithRefreshResult extends LoginResult {
  refreshToken: string;
}

export interface LoginMfaRequiredResult {
  mfaRequired: true;
  mfaToken: string;
}

export type LoginResultWithMfa = LoginWithRefreshResult | LoginMfaRequiredResult;

export interface RegisterResult {
  company: Pick<Company, 'id' | 'name' | 'slug' | 'country' | 'timezone' | 'currency'>;
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'isActive'>;
}

export interface SsoProfile {
  provider: 'google';
  providerId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}
