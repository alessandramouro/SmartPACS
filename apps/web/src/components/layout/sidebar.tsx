'use client';

import type { Permission } from '@smartpacs/types';
import {
  Activity, LayoutDashboard, Image, Users, Building,
  Server, HardDrive, FileText, LogOut, ChevronLeft,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { usePermission } from '@/hooks/use-permission';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';


interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  permission?: Permission;
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tenants', label: 'Tenants', icon: Building, permission: 'tenants:read' },
  { href: '/studies', label: 'Estudos', icon: Image, permission: 'studies:read' },
  { href: '/users', label: 'Usuários', icon: Users, permission: 'users:read' },
  { href: '/agents', label: 'Agentes Edge', icon: Server },
  { href: '/storage', label: 'Storage', icon: HardDrive, permission: 'storage:read' },
  { href: '/audit', label: 'Auditoria', icon: FileText, permission: 'audit:read' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { can } = usePermission();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border bg-card transition-all duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
          <Activity className="w-4 h-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <span className="font-bold text-foreground text-sm truncate">SmartPACS</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'ml-auto p-1 rounded hover:bg-muted text-muted-foreground transition-transform',
            collapsed && 'rotate-180',
          )}
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <ul className="space-y-1">
          {navItems.map((item) => {
            if (item.permission && !can(item.permission)) return null;
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                    collapsed && 'justify-center px-2',
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User footer */}
      <div className="border-t border-border p-3">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-primary">
                {user?.name?.charAt(0)?.toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.role}</p>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
              title="Sair"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={logout}
            className="w-full flex items-center justify-center p-2 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
          >
            <LogOut size={14} />
          </button>
        )}
      </div>
    </aside>
  );
}
