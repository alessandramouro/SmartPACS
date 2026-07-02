import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsObject, IsOptional } from 'class-validator';

export class RegisterAgentDto {
  @ApiProperty() @IsUUID('all') clinicId: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() version: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hostname?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() platform?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() osVersion?: string;
  @ApiProperty() @IsObject() dicomConfig: {
    aeTitle: string;
    port: number;
    allowedCallingAeTitles: string[];
    receiveDirectory: string;
    processedDirectory: string;
    failedDirectory: string;
  };
}
