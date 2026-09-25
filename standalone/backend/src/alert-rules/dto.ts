import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NO_CONTROL_CHARS, noControlChars } from '../common/text';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

const CONDITIONS = ['gt', 'lt', 'gte', 'lte'];
const APP_TYPES = ['MET'];

export class CreateAlertRuleDto {
  @ApiProperty({ example: 'Strong wind' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '664a1f2e3c4d5e6f7a8b9c0f', description: 'Device ObjectId' })
  @IsMongoId()
  deviceId!: string;

  @ApiProperty({ enum: APP_TYPES, example: 'MET' })
  @IsIn(APP_TYPES)
  appType!: 'MET';

  @ApiProperty({ example: 'wind_speed', description: 'Sensor key: wind_speed|temperature|humidity|pressure|dew_point|wind_dir' })
  @IsString()
  @IsNotEmpty()
  sensor!: string;

  @ApiProperty({ enum: CONDITIONS, example: 'gt' })
  @IsIn(CONDITIONS)
  condition!: 'gt' | 'lt' | 'gte' | 'lte';

  @ApiProperty({ example: 300 })
  @IsNumber()
  threshold!: number;

  @ApiProperty({ example: 'NTU' })
  @IsString()
  unit!: string;

  @ApiPropertyOptional({ type: [String], description: 'User ObjectIds to notify (empty = whole org)' })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  notifyUserIds?: string[];

  @ApiPropertyOptional({ example: 60, description: 'Minutes between repeat alerts (default 60)' })
  @IsOptional()
  @IsNumber()
  cooldownMinutes?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAlertRuleDto {
  @ApiPropertyOptional({ example: 'Strong wind' })
  @IsOptional()
  @IsString()
  @Matches(NO_CONTROL_CHARS, noControlChars)
  name?: string;

  @ApiPropertyOptional({ example: 'wind_speed' })
  @IsOptional()
  @IsString()
  sensor?: string;

  @ApiPropertyOptional({ enum: CONDITIONS })
  @IsOptional()
  @IsIn(CONDITIONS)
  condition?: 'gt' | 'lt' | 'gte' | 'lte';

  @ApiPropertyOptional({ example: 350 })
  @IsOptional()
  @IsNumber()
  threshold?: number;

  @ApiPropertyOptional({ example: 'NTU' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  notifyUserIds?: string[];

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber()
  cooldownMinutes?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
