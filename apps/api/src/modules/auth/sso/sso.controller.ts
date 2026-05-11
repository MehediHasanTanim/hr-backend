import { Controller, Get, Inject, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { FastifyReply, FastifyRequest } from 'fastify';
import * as crypto from 'node:crypto';
import { UnauthorizedError } from '@hr/shared';
import { AppConfigService } from '../../../config/config.service';
import { RedisKeys } from '../../../common/redis/redis-keys';
import { RedisService } from '../../../common/redis/redis.service';
import { Public } from '../decorators/public.decorator';
import type { SsoProfile } from '../auth.types';
import { AuthService } from '../auth.service';
import { TokenService } from '../token.service';

@Controller('auth/sso')
export class SsoController {
  constructor(
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(TokenService) private readonly tokenService: TokenService,
  ) {}

  @Get(':provider')
  @Public()
  async redirect(@Param('provider') provider: string, @Res() reply: FastifyReply): Promise<void> {
    if (provider !== 'google') throw new UnauthorizedError('Unsupported SSO provider');
    const sso = this.config.get('sso');
    const app = this.config.get('app');
    const state = crypto.randomBytes(16).toString('hex');
    await this.redis.set(RedisKeys.ssoState(state), '1', 600);

    const params = new URLSearchParams({
      client_id: sso.google.clientId ?? '',
      redirect_uri: `${app.apiBaseUrl}/api/v1/auth/sso/google/callback`,
      response_type: 'code',
      scope: 'email profile',
      state,
    });
    void reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  }

  @Get('google/callback')
  @Public()
  @UseGuards(AuthGuard('google'))
  async callback(
    @Req() req: FastifyRequest & { user?: SsoProfile },
    @Res() reply: FastifyReply,
    @Query('state') state: string,
  ): Promise<void> {
    const valid = state ? await this.redis.exists(RedisKeys.ssoState(state)) : false;
    if (!valid) throw new UnauthorizedError('Invalid SSO state');
    await this.redis.del(RedisKeys.ssoState(state));

    const profile = req.user;
    if (!profile) throw new UnauthorizedError('SSO profile unavailable');
    const { accessToken, refreshToken } = await this.authService.loginWithSsoProfile(profile);
    this.tokenService.setRefreshTokenCookie(reply, refreshToken);
    const baseUrl = this.config.get('app').webBaseUrl ?? '';
    void reply.redirect(`${baseUrl}/sso/callback#accessToken=${encodeURIComponent(accessToken)}`);
  }
}
