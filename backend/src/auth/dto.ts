/**
 * Swagger documentation DTOs for the Auth endpoints.
 * These are referenced via @ApiBody for OpenAPI only — the controllers keep their
 * existing typed bodies, so request validation/behaviour is unchanged.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Observator Instruments AU' })
  orgName!: string;

  @ApiProperty({ example: 'admin@observator.com' })
  email!: string;

  @ApiProperty({ minLength: 8, example: 'Admin@1234' })
  password!: string;

  @ApiProperty({ example: 'Dana' })
  firstName!: string;

  @ApiProperty({ example: 'Galbraith' })
  lastName!: string;

  @ApiProperty({ example: 'AU' })
  country!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'admin@observator.com' })
  email!: string;

  @ApiProperty({ example: 'Admin@1234' })
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
  refreshToken?: string;
}

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Raw refresh token. Optional — falls back to the httpOnly cookie.' })
  refreshToken?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@observator.com' })
  email!: string;
}

export class VerifyResetCodeDto {
  @ApiProperty({ example: 'admin@observator.com' })
  email!: string;

  @ApiProperty({ example: '123456', description: '6-digit code from the reset email' })
  code!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Single-use reset token returned by /auth/verify-reset-code' })
  resetToken!: string;

  @ApiProperty({ minLength: 8, description: 'New password (min 8 chars)' })
  newPassword!: string;
}
