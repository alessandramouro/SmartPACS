import { SetMetadata } from '@nestjs/common';
import { UserRole, Permission } from '@smartpacs/types';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const IS_AGENT_ENDPOINT = 'isAgentEndpoint';
export const AgentEndpoint = () => SetMetadata(IS_AGENT_ENDPOINT, true);
