import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const RESOURCE_TYPES = ['nepSession', 'metRecord'];

export class CreateShareDto {
  @ApiProperty({ enum: RESOURCE_TYPES, example: 'nepSession' })
  @IsIn(RESOURCE_TYPES)
  resourceType!: 'nepSession' | 'metRecord';

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'NEP session UUID or MET record _id' })
  @IsString()
  @IsNotEmpty()
  resourceId!: string;

  @ApiPropertyOptional({ example: '2026-08-01T00:00:00.000Z', description: 'ISO expiry. Defaults to +30 days when omitted.' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
