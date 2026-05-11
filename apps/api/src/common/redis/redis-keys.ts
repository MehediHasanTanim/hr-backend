export const RedisKeys = {
  refreshToken: (hash: string) => `auth:refresh:${hash}`,
  passwordResetToken: (hash: string) => `auth:pwd-reset:${hash}`,
  emailOtp: (userId: string) => `auth:email-otp:${userId}`,
  inviteToken: (hash: string) => `auth:invite:${hash}`,
  ssoState: (state: string) => `auth:sso-state:${state}`,
  rolePermissions: (companyId: string) => `rbac:company:${companyId}:perms`,
  userRoles: (userId: string) => `rbac:user:${userId}:roles`,
  throttle: (ip: string, route: string) => `throttle:${ip}:${route}`,
} as const;
