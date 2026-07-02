import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsBoolean, IsEnum, IsObject } from 'class-validator';

export class UpsertStorageDestinationDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID('all') id?: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: ['GOOGLE_DRIVE','ONEDRIVE','SMB','NFS','S3','LOCAL'] })
  @IsEnum(['GOOGLE_DRIVE','ONEDRIVE','SMB','NFS','S3','LOCAL'])
  type: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiProperty() @IsObject() config: Record<string, unknown>;
}
