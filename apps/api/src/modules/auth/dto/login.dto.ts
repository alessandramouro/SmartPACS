import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsOptional, IsBoolean, Length } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@smartpacs.com' })
  @IsEmail({}, { message: 'Invalid email address' })
  email: string;

  @ApiProperty({ example: 'Admin@123456!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ description: 'TOTP 6-digit code for MFA', example: '123456' })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  mfaCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
