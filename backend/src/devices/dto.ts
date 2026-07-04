/**
 * Swagger documentation DTOs for the Devices endpoints (OpenAPI only —
 * controllers keep their existing typed bodies, behaviour unchanged).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class CreateDeviceDto {
  @ApiProperty({ example: 'MET-00:11:22:33:44:55', description: 'BLE MAC / identifier' })
  bleId!: string;

  @ApiProperty({ example: 'MET-LINK-001' })
  name!: string;

  @ApiProperty({ enum: ['MET-LINK', 'NEP-LINK'] })
  type!: 'MET-LINK' | 'NEP-LINK';

  @ApiPropertyOptional({ example: 'SN-MET-001' })
  serialNo?: string;

  @ApiPropertyOptional({ example: '2.1.4' })
  firmwareVersion?: string;

  @ApiPropertyOptional({ description: 'User-facing display name override' })
  customName?: string;
}

export class UpdateDeviceDto {
  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional()
  customName?: string;

  @ApiPropertyOptional()
  serialNo?: string;

  @ApiPropertyOptional()
  firmwareVersion?: string;
}

/** Partial device settings (send only changed keys). */
export class UpdateDeviceSettingsDto {
  @ApiPropertyOptional() qqEnabled?: boolean;
  @ApiPropertyOptional() qqGpsHeight?: boolean;
  @ApiPropertyOptional({ example: 15 }) qfeHeightM?: number;
  @ApiPropertyOptional({ example: 0 }) qnhHeightM?: number;
  @ApiPropertyOptional() dewPointEnabled?: boolean;
  @ApiPropertyOptional({ example: '1' }) windRoseUnit?: string;
  @ApiPropertyOptional({ example: '2' }) windRosePeriod?: string;
  @ApiPropertyOptional({ example: 'true' }) windRoseOrient?: string;
  @ApiPropertyOptional({ example: 'rose' }) graphicalType?: string;
  @ApiPropertyOptional() graphItem?: number;
  @ApiPropertyOptional({ example: 2 }) colorScheme?: number;
  @ApiPropertyOptional() pageLayout?: number;
  @ApiPropertyOptional({ example: 'km/h' }) unitWindSpeed?: string;
  @ApiPropertyOptional({ example: 'hPa' }) unitPressure?: string;
  @ApiPropertyOptional({ example: '°C' }) unitTemperature?: string;
  @ApiPropertyOptional({ example: 'm' }) unitAltitude?: string;
  @ApiPropertyOptional({ type: [Object], description: 'EnShow array' }) sensorShowPrefs?: unknown[];
  @ApiPropertyOptional({ type: [Object], description: 'EnLog array' }) sensorLogPrefs?: unknown[];
}

/** Set the org's expected latest firmware for a device type (Month 6). */
export class FirmwareTargetDto {
  @ApiProperty({ enum: ['MET-LINK', 'NEP-LINK'], example: 'NEP-LINK' })
  @IsIn(['MET-LINK', 'NEP-LINK'])
  deviceType!: 'MET-LINK' | 'NEP-LINK';

  @ApiProperty({ example: '2.2.0', description: 'Latest firmware version for this device type' })
  @IsString()
  @IsNotEmpty()
  version!: string;
}
