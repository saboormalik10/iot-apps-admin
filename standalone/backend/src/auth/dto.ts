/**
 * Request DTOs for the Auth endpoints.
 *
 * These were originally Swagger-only — the header here used to say the
 * controllers "keep their existing typed bodies, so request validation is
 * unchanged". That was the bug (M24 W1). The controllers bound INTERFACES
 * (`LoginInput`), which erase at runtime, so `ValidationPipe` had no metatype to
 * work with and passed the raw body straight through unvalidated.
 *
 * Measured: `POST /auth/login` with `{"email":{"$ne":null}}` reached
 * `input.email.toLowerCase()` and returned a 500 leaking that internal message to
 * an unauthenticated caller. The Mongo operator never reached a query — but only
 * because of an incidental `.toLowerCase()`, not because anything checked it.
 *
 * This is the same shape as the M19 `SwitchOrgDto` defect, where a decorator-less
 * DTO meant `whitelist: true` silently stripped every field and the endpoint
 * became a no-op. A DTO without class-validator decorators is not validation.
 * `dto-binding.e2e-spec.ts` now fails the build on a body bound to an interface.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@observator.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  // Deliberately NOT @MinLength here. This is the login door, not the signup
  // door: rejecting a short password before checking it tells an attacker the
  // policy, and would 400 any legacy account whose password predates the rule.
  @ApiProperty({ example: 'Admin@1234' })
  @IsString()
  @MaxLength(200)
  password!: string;
}

export class RefreshDto {
  @ApiPropertyOptional({ description: 'Raw refresh token. Optional — falls back to the httpOnly cookie.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  refreshToken?: string;
}

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Raw refresh token. Optional — falls back to the httpOnly cookie.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  refreshToken?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@observator.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class VerifyResetCodeDto {
  @ApiProperty({ example: 'admin@observator.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: '123456', description: '6-digit code from the reset email' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Single-use reset token returned by /auth/verify-reset-code' })
  @IsString()
  @MaxLength(512)
  resetToken!: string;

  // The "min 8 chars" in the description above was documented but enforced
  // NOWHERE: `auth.service.resetPassword` hashes whatever it is given, so the
  // reset flow could set a one-character password while `changePassword` and
  // customer creation both required 8. This is where that rule becomes real.
  @ApiProperty({ minLength: 8, description: 'New password (min 8 chars)' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword!: string;
}

/** Create your own account (only when the site allows it). */
export class SignupDto {
  @ApiProperty({ example: 'sam@site.local' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ example: 'Sam' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Lee' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;
}
