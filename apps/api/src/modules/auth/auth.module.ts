import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { RolesModule } from '../roles/roles.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { PasswordService } from './password.service';
import { SsoController } from './sso/sso.controller';
import { GoogleStrategy } from './sso/google.strategy';
import { TokenService } from './token.service';

@Module({
  imports: [PassportModule, RolesModule],
  controllers: [AuthController, SsoController],
  providers: [
    AuthService,
    TokenService,
    PasswordService,
    EmailVerificationService,
    GoogleStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService, TokenService, PasswordService],
})
export class AuthModule {}
