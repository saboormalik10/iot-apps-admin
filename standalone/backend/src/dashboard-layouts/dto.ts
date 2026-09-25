/**
 * Request DTOs for the Dashboard Layouts endpoints.
 *
 * These used to be OpenAPI-only, with the controller binding an interface and an
 * inline object literal — both of which erase at runtime, so nothing here was
 * ever enforced (M24 W1). `tiles` in particular is persisted straight into the
 * document, so an unvalidated body wrote arbitrary caller-supplied shapes into
 * the layout.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class DashboardTileDto {
  @ApiProperty({ example: 0, description: 'Tile position 0–7' })
  @IsInt()
  @Min(0)
  @Max(7)
  index!: number;

  @ApiProperty({ example: 'WIMWV', description: 'NMEA sentence key' })
  @IsString()
  @MaxLength(100)
  nmea!: string;

  @ApiProperty({ example: 'gauge' })
  @IsString()
  @MaxLength(100)
  type!: string;

  @ApiProperty({ example: 'km/h' })
  @IsString()
  @MaxLength(100)
  unit!: string;

  @ApiProperty({ example: 'Wind speed' })
  @IsString()
  @MaxLength(100)
  desc!: string;

  @ApiProperty({ example: 'Wind' })
  @IsString()
  @MaxLength(100)
  label!: string;
}

export class CreateLayoutDto {
  @ApiProperty({ description: 'Device ObjectId' })
  @IsMongoId()
  deviceId!: string;

  @ApiPropertyOptional({ example: 'My MET layout' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  // The grid is 8 tiles; bounding it here stops an unbounded array being
  // persisted into a single document.
  @ApiProperty({ type: [DashboardTileDto], description: '8-tile grid configuration' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => DashboardTileDto)
  tiles!: DashboardTileDto[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateLayoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ type: [DashboardTileDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => DashboardTileDto)
  tiles?: DashboardTileDto[];
}
