import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

const CONDITIONS = ['gt', 'lt', 'gte', 'lte'];
const APP_TYPES = ['MET', 'NEP'];

export class CreateAlertRuleDto {
  @ApiProperty({ example: 'High turbidity' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '664a1f2e3c4d5e6f7a8b9c0f', description: 'Device ObjectId' })
  @IsMongoId()
  deviceId!: string;

  @ApiProperty({ enum: APP_TYPES, example: 'NEP' })
  @IsIn(APP_TYPES)
  appType!: 'MET' | 'NEP';

  @ApiProperty({ example: 'turbidity', description: 'Sensor key (NEP: turbidity|temperature; MET: wind_speed|temperature|humidity|pressure|dew_point|wind_dir)' })
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
  @ApiPropertyOptional({ example: 'High turbidity' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'turbidity' })
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
