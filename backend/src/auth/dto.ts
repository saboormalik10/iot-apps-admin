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

export class RegisterDto {
  @ApiProperty({ example: 'Observator Instruments AU' })
  @IsString()
  @MaxLength(200)
  orgName!: string;

  @ApiProperty({ example: 'admin@observator.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  // 8 was already the rule in `CreateCustomerDto` and in `users.service`'s
  // change-password path. Registration was the one door with no policy at all,
  // so a one-character password was accepted here and nowhere else.
  @ApiProperty({ minLength: 8, example: 'Admin@1234' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @ApiProperty({ example: 'Dana' })
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Galbraith' })
  @IsString()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: 'AU' })
  @IsString()
  @MaxLength(100)
  country!: string;
}

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

export class MobileSignupDto {
  @ApiProperty({ example: 'field.tech@observator.com' })
  email!: string;

  @ApiProperty({ minLength: 8, example: 'Field@1234' })
  password!: string;

  @ApiProperty({ example: 'Sam' })
  firstName!: string;

  @ApiProperty({ example: 'Rivers' })
  lastName!: string;

  @ApiPropertyOptional({
    enum: ['MET-LINK', 'NEP-LINK'],
    example: 'NEP-LINK',
    description:
      'Which app the user signed up from. Send your app\'s name so the admin panel can list the user under "MET users" or "NEP users".',
  })
  appType?: 'MET-LINK' | 'NEP-LINK';
}

export class MobileRefreshDto {
  @ApiProperty({ description: 'Raw refresh token returned by mobile login/signup.' })
  refreshToken!: string;
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

/**
 * Body for `POST /auth/switch-org`.
 *
 * `organizationId: null` (or omitted) means "switch back to my own", so the UI
 * needs no separate endpoint to leave a customer.
 */
/**
 * CARRIES REAL VALIDATORS, unlike the Swagger-only DTOs above.
 *
 * Those are safe because their handlers type the body inline
 * (`@Body() body: { refreshToken?: string }`), which the pipe leaves alone.
 * The moment a handler is annotated with a DTO CLASS, the global ValidationPipe
 * (`whitelist: true`) strips every property that has no class-validator
 * decorator — which silently emptied both fields here and made every switch
 * behave as "switch back to my own organisation".
 */
export class SwitchOrgDto {
  @ApiPropertyOptional({ example: '664a1f2e3c4d5e6f7a8b9c0e', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  organizationId?: string | null;

  @ApiPropertyOptional({ description: 'Raw refresh token; falls back to the httpOnly cookie.' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  refreshToken?: string;
}
