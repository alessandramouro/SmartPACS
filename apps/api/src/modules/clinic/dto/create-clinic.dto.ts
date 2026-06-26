import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsBoolean, IsNumber, IsEmail,
  MinLength, MaxLength, Min, Max, IsUUID,
} from 'class-validator';

export class CreateClinicDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(255) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?: string;
  @ApiPropertyOptional({ description: 'Super Admin: create clinic in a specific tenant' })
  @IsOptional() @IsUUID() _tenantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cnpj?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cnes?: string;

  @ApiProperty() @IsString() @MaxLength(100) addressCity: string;
  @ApiProperty() @IsString() @MaxLength(2) addressState: string;
  @ApiPropertyOptional() @IsOptional() @IsString() addressStreet?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() addressNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() addressComplement?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() addressNeighborhood?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() addressZipCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() addressCountry?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() contactEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactWebsite?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactResponsible?: string;

  @ApiPropertyOptional({ default: 'SMARTPACS' }) @IsOptional() @IsString() @MaxLength(16) dicomAeTitle?: string;
  @ApiPropertyOptional({ default: 104 }) @IsOptional() @IsNumber() @Min(1024) @Max(65535) dicomPort?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoExportEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() exportOnComplete?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() worklistEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() worklistHisUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(16) worklistAeTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() anonymizeOnExport?: boolean;
}
