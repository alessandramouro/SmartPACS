import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class CreateEnrollmentTokenDto {
  @ApiProperty() @IsUUID('all') clinicId: string;
  @ApiProperty() @IsString() name: string;
}
