'use client';

import type { Permission, UserRole } from '@smartpacs/types';

import { useAuthStore } from '@/stores/auth.store';

export function usePermission() {
  const user = useAuthStore((s) => s.user);

  const can = (...permissions: Permission[]): boolean => {
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true;
    return permissions.every((p) => user.permissions.includes(p));
  };

  const canAny = (...permissions: Permission[]): boolean => {
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true;
    return permissions.some((p) => user.permissions.includes(p));
  };

  const is = (...roles: UserRole[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return { can, canAny, is, user, role: user?.role };
}
