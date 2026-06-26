import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, HttpCode, HttpStatus, ParseUUIDPipe, NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtPayload } from '@smartpacs/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import { AuthService } from '../auth/auth.service';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserService } from './user.service';

@ApiTags('users')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'users', version: '1' })
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'List users (tenant-scoped)' })
  findAll(@Query() query: UserQueryDto, @CurrentUser() user: JwtPayload) {
    return this.userService.findAll(query, user);
  }

  @Get(':id')
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.userService.findById(id, user);
  }

  @Post()
  @RequirePermissions('users:write')
  @ApiOperation({ summary: 'Create user and optionally send invite email' })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtPayload) {
    return this.userService.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('users:write')
  @ApiOperation({ summary: 'Update user role, permissions, status' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.userService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('users:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete user' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.userService.remove(id, user);
  }

  @Post(':id/send-reset')
  @RequirePermissions('users:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Send password reset email to user (admin action)' })
  async sendPasswordReset(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    const user = await this.userService.findById(id, currentUser);
    if (!user) throw new NotFoundException('User not found');
    await this.authService.requestPasswordReset((user as any).email);
  }

  @Post(':id/reset-password')
  @RequirePermissions('users:write')
  @ApiOperation({ summary: 'Set a new temporary password directly, shown once (no email)' })
  async resetPasswordDirect(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.userService.resetPasswordDirect(id, currentUser);
  }
}
