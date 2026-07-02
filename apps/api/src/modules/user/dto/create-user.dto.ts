import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail, IsString, IsEnum, IsOptional,
  IsUUID, IsArray, MinLength, MaxLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(255) name: string;
  @ApiProperty({ enum: ['TENANT_ADMIN','CLINIC_ADMIN','OPERATOR','PHYSICIAN','READONLY'] })
  @IsEnum(['TENANT_ADMIN','CLINIC_ADMIN','OPERATOR','PHYSICIAN','READONLY'])
  role: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID('all') clinicId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() permissions?: string[];
}
