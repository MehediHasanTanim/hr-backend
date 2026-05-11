import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '@hr/shared';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { ForgotPasswordBody, type ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginBody, type LoginDto } from './dto/login.dto';
import { RegisterBody, type RegisterDto } from './dto/register.dto';
import { AcceptInviteBody, type AcceptInviteDto, ResetPasswordBody, type ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailBody, type VerifyEmailDto } from './dto/refresh.dto';

@Controller('auth')
@Throttle({ default: { ttl: 60_000, limit: 10 } })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
  ) {}

  @Post('register')
  @Public()
  @Throttle({ default: { ttl: 3_600_000, limit: 3 } })
  register(@Body() dto: RegisterBody) {
    return this.authService.register(dto as RegisterDto);
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  async login(
    @Body() dto: LoginBody,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { accessToken, refreshToken } = await this.authService.login(dto as LoginDto);
    this.tokenService.setRefreshTokenCookie(reply, refreshToken);
    return { accessToken };
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  async refresh(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ accessToken: string }> {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const rawToken = cookies?.['__Secure-rt'];
    if (!rawToken) throw new UnauthorizedError('No refresh token');

    const sessionId = this.authService.extractSessionIdFromExpiredToken(req.headers.authorization);
    const { accessToken, refreshToken } = await this.tokenService.rotateRefreshToken(rawToken, sessionId);
    this.tokenService.setRefreshTokenCookie(reply, refreshToken);
    return { accessToken };
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  forgotPassword(@Body() dto: ForgotPasswordBody) {
    return this.authService.forgotPassword(dto as ForgotPasswordDto);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordBody) {
    return this.authService.resetPassword(dto as ResetPasswordDto);
  }

  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@CurrentUser() user: RequestContext, @Body() dto: VerifyEmailBody) {
    return this.authService.verifyEmail(user.userId, (dto as VerifyEmailDto).otp);
  }

  @Post('resend-verification')
  @HttpCode(200)
  @Throttle({ default: { ttl: 3_600_000, limit: 3 } })
  resendVerification(@CurrentUser() user: RequestContext) {
    return this.authService.resendVerification(user.userId);
  }

  @Post('accept-invite')
  @Public()
  @HttpCode(200)
  async acceptInvite(
    @Body() dto: AcceptInviteBody,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { accessToken, refreshToken } = await this.authService.acceptInvite(dto as AcceptInviteDto);
    this.tokenService.setRefreshTokenCookie(reply, refreshToken);
    return { accessToken };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentUser() user: RequestContext,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.tokenService.revokeSession(user.sessionId);
    this.tokenService.clearRefreshTokenCookie(reply);
  }
}
