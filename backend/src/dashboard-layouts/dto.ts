/**
 * Swagger documentation DTOs for the Dashboard Layouts endpoints (OpenAPI only —
 * controllers keep their existing typed bodies, behaviour unchanged).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardTileDto {
  @ApiProperty({ example: 0, description: 'Tile position 0–7' })
  index!: number;

  @ApiProperty({ example: 'WIMWV', description: 'NMEA sentence key' })
  nmea!: string;

  @ApiProperty({ example: 'gauge' })
  type!: string;

  @ApiProperty({ example: 'km/h' })
  unit!: string;

  @ApiProperty({ example: 'Wind speed' })
  desc!: string;

  @ApiProperty({ example: 'Wind' })
  label!: string;
}

export class CreateLayoutDto {
  @ApiProperty({ description: 'Device ObjectId' })
  deviceId!: string;

  @ApiPropertyOptional({ example: 'My MET layout' })
  name?: string;

  @ApiProperty({ type: [DashboardTileDto], description: '8-tile grid configuration' })
  tiles!: DashboardTileDto[];

  @ApiPropertyOptional({ default: false })
  isDefault?: boolean;
}

export class UpdateLayoutDto {
  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional({ type: [DashboardTileDto] })
  tiles?: DashboardTileDto[];
}
