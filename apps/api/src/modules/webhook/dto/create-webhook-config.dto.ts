import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUrl, IsArray, ArrayMinSize, IsIn, IsOptional, IsUUID, IsInt, Min, Max } from 'class-validator';

import { WEBHOOK_EVENTS, WebhookEvent } from '../webhook-events';

export class CreateWebhookConfigDto {
  @ApiProperty({ example: 'Notificação de exportação' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'https://example.com/webhooks/smartpacs' })
  @IsUrl({ require_tld: false })
  url: string;

  @ApiProperty({ enum: WEBHOOK_EVENTS, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(WEBHOOK_EVENTS, { each: true })
  events: WebhookEvent[];

  @ApiPropertyOptional({ description: 'Restringe o webhook a uma clínica específica' })
  @IsOptional()
  @IsUUID('all')
  clinicId?: string;

  @ApiPropertyOptional({ default: 3, minimum: 0, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  retryAttempts?: number;

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 120 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  timeoutSeconds?: number;
}
