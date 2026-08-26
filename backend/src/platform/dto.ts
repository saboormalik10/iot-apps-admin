import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * NOTE: the global ValidationPipe runs with `whitelist: true`, so a property
 * with no class-validator decorator is silently STRIPPED. Every field read by
 * the service must carry one — this is how `POST /auth/switch-org` shipped as a
 * silent no-op before it was caught.
 */
export class CustomerAdminDto {
  @ApiProperty({ example: 'ops@acme.example' })
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @ApiProperty({ example: 'a strong passphrase', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  // Both REQUIRED: `User` requires them at the model level (an empty string
  // fails Mongoose's `required` check), and the name appears in audit entries
  // and alert emails, so a placeholder would be worse than asking.
  @ApiProperty({ example: 'Dana' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ example: 'Galbraith' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;
}

export class CreateCustomerDto {
  @ApiProperty({ example: 'Acme Marine Services' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'accounts@acme.example', description: 'Defaults to the administrator email.' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  contactEmail?: string;

  @ApiPropertyOptional({ example: 'AU' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  country?: string;

  @ApiPropertyOptional({ example: 'Australia/Sydney' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({
    example: 'Acme Marine',
    description: 'Single folder name under the SFTP upload root. Defaults to the customer name.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  uploadFolder?: string;

  @ApiProperty({ type: CustomerAdminDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CustomerAdminDto)
  admin!: CustomerAdminDto;
}
