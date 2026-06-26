import { Controller, Get, Post, Patch, Delete, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtPayload } from '@smartpacs/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/roles.decorator';

import { CreateWebhookConfigDto } from './dto/create-webhook-config.dto';
import { UpdateWebhookConfigDto } from './dto/update-webhook-config.dto';
import { WebhookService } from './webhook.service';

/**
 * Permission reuse note: there's no dedicated `webhooks:*` permission in the shared
 * Permission enum. Webhooks are a tenant-level integration config in the same vein as
 * StorageDestination, so this reuses `storage:read`/`storage:configure` rather than
 * extending the enum for one new resource.
 */
@ApiTags('webhooks')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'webhooks', version: '1' })
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Get()
  @RequirePermissions('storage:read')
  findAll(@CurrentUser() user: JwtPayload) {
    return this.webhookService.findAll(user);
  }

  @Post()
  @RequirePermissions('storage:configure')
  create(@Body() dto: CreateWebhookConfigDto, @CurrentUser() user: JwtPayload) {
    return this.webhookService.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('storage:configure')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookConfigDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.webhookService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('storage:configure')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.webhookService.remove(id, user);
  }

  @Post(':id/rotate-secret')
  @RequirePermissions('storage:configure')
  rotateSecret(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.webhookService.rotateSecret(id, user);
  }
}
