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

export class ResetPasswordDto {
  @ApiProperty({ description: 'Raw reset token from the email link' })
  token!: string;

  @ApiProperty({ minLength: 8, description: 'New password (min 8 chars)' })
  newPassword!: string;
}
