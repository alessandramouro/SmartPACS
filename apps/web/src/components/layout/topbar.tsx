'use client';

import { Bell, Search, Moon, Sun } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';

import { useAuthStore } from '@/stores/auth.store';

const routeTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/studies': 'Estudos DICOM',
  '/clinics': 'Clínicas',
  '/users': 'Usuários',
  '/agents': 'Agentes Edge',
  '/storage': 'Configuração de Storage',
  '/audit': 'Auditoria',
  '/settings': 'Configurações',
  '/profile': 'Minha Conta',
};

export function TopBar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { user } = useAuthStore();

  const title = Object.entries(routeTitles).find(([key]) =>
    pathname === key || pathname.startsWith(key + '/'),
  )?.[1] || 'SmartPACS';

  return (
    <header className="h-14 border-b border-border bg-card flex items-center px-6 gap-4">
      <h1 className="font-semibold text-foreground text-sm">{title}</h1>

      {/* Search */}
      <div className="flex-1 max-w-sm ml-4 relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar estudos, pacientes..."
          className="w-full pl-9 pr-3 py-1.5 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
        />
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-destructive rounded-full" />
        </button>

        {/* User avatar */}
        <Link
          href="/profile"
          title="Minha Conta"
          className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center ml-1 hover:ring-2 hover:ring-primary/40 transition-all"
        >
          <span className="text-xs font-bold text-primary">
            {user?.name?.charAt(0)?.toUpperCase()}
          </span>
        </Link>
      </div>
    </header>
  );
}
