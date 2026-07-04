import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const PLATFORMS = ['ios', 'android'];

export class RegisterTokenDto {
  @ApiProperty({ enum: PLATFORMS, example: 'android' })
  @IsIn(PLATFORMS)
  platform!: 'ios' | 'android';

  @ApiProperty({ example: 'fcm_abc123def456', description: 'FCM (Android) / APNs (iOS) device token' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ example: 'com.observator.neplink', description: 'App bundle / package id' })
  @IsString()
  @IsNotEmpty()
  appId!: string;

  @ApiPropertyOptional({ example: 'Pixel 8' })
  @IsOptional()
  @IsString()
  deviceModel?: string;
}

export class UnregisterTokenDto {
  @ApiProperty({ example: 'fcm_abc123def456' })
  @IsString()
  @IsNotEmpty()
  token!: string;
}
