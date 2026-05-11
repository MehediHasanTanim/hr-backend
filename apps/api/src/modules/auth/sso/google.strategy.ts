import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { UnauthorizedError } from '@hr/shared';
import { AppConfigService } from '../../../config/config.service';
import type { SsoProfile } from '../auth.types';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(@Inject(AppConfigService) config: AppConfigService) {
    super({
      clientID: config.get('sso').google.clientId ?? 'disabled-google-client-id',
      clientSecret: config.get('sso').google.clientSecret ?? 'disabled-google-client-secret',
      callbackURL: `${config.get('app').apiBaseUrl}/api/v1/auth/sso/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile): SsoProfile {
    const email = profile.emails?.[0]?.value;
    if (!email) throw new UnauthorizedError('Google account has no email');

    return {
      provider: 'google',
      providerId: profile.id,
      email,
      firstName: profile.name?.givenName ?? '',
      lastName: profile.name?.familyName ?? '',
      avatarUrl: profile.photos?.[0]?.value,
    };
  }
}
