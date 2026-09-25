import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength , Matches} from 'class-validator';
import { NO_CONTROL_CHARS, noControlChars } from '../common/text';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane', description: 'New first name' })
  @IsOptional()
  @IsString()
  @Matches(NO_CONTROL_CHARS, noControlChars)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'New last name' })
  @IsOptional()
  @IsString()
  @Matches(NO_CONTROL_CHARS, noControlChars)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Current password — required when changing password' })
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ApiPropertyOptional({ minLength: 8, description: 'New password (min 8 chars) — requires currentPassword' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  newPassword?: string;
}
