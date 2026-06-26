'use client';

import type { PaginatedResponse } from '@smartpacs/types';
import { useQuery } from '@tanstack/react-query';
import { FileText, Search, RefreshCw, ChevronLeft, ChevronRight, CheckCircle, XCircle, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';

import { api } from '@/lib/api';
import { exportToExcel } from '@/lib/export-excel';
import { cn, formatDateTime } from '@/lib/utils';

interface AuditLog {
  id: string;
  action: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  user?: { id: string; name: string; email: string };
  clinic?: { id: string; name: string };
  ipAddress?: string;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

const actionColors: Record<string, string> = {
  LOGIN: 'text-status-info bg-status-info/10 border-status-info/20',
  LOGOUT: 'text-muted-foreground bg-muted border-muted',
  LOGIN_FAILED: 'text-status-error bg-status-error/10 border-status-error/20',
  CREATE: 'text-status-success bg-status-success/10 border-status-success/20',
  UPDATE: 'text-status-warning bg-status-warning/10 border-status-warning/20',
  DELETE: 'text-status-error bg-status-error/10 border-status-error/20',
  EXPORT_STARTED: 'text-status-info bg-status-info/10 border-status-info/20',
  EXPORT_COMPLETED: 'text-status-success bg-status-success/10 border-status-success/20',
  EXPORT_FAILED: 'text-status-error bg-status-error/10 border-status-error/20',
  PASSWORD_RESET: 'text-status-warning bg-status-warning/10 border-status-warning/20',
  MFA_ENABLED: 'text-status-success bg-status-success/10 border-status-success/20',
};

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const handleExcelExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams({
        page: '1', limit: '5000',
        ...(search && { q: search }),
        ...(selectedAction && { action: selectedAction }),
        ...(dateFrom && { from: dateFrom }),
        ...(dateTo && { to: dateTo }),
      });
      const res = await api.get<{ data: PaginatedResponse<AuditLog> }>(`/audit/logs?${params}`);
      const all = res.data.data.data;
      exportToExcel(all, [
        { header: 'Data / Hora', key: (r) => formatDateTime(r.createdAt), width: 20 },
        { header: 'Ação', key: 'action', width: 20 },
        { header: 'Usuário', key: (r) => r.user?.name || r.userId || '', width: 25 },
        { header: 'Email', key: (r) => r.user?.email || '', width: 30 },
        { header: 'Entidade', key: (r) => r.entityType || '', width: 18 },
        { header: 'ID Entidade', key: (r) => r.entityId || '', width: 36 },
        { header: 'IP', key: (r) => r.ipAddress || '', width: 16 },
        { header: 'Resultado', key: (r) => r.success ? 'Sucesso' : 'Falhou', width: 12 },
        { header: 'Mensagem de Erro', key: (r) => r.errorMessage || '', width: 40 },
      ], 'auditoria', 'Auditoria');
    } finally {
      setIsExporting(false);
    }
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit', page, search, selectedAction, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams({
        page: page.toString(), limit: '25',
        ...(search && { q: search }),
        ...(selectedAction && { action: selectedAction }),
        ...(dateFrom && { from: dateFrom }),
        ...(dateTo && { to: dateTo }),
      });
      return api.get<{ data: PaginatedResponse<AuditLog> }>(`/audit/logs?${params}`).then((r) => r.data.data);
    },
    placeholderData: (prev) => prev,
    refetchInterval: 30000,
  });

  const logs = data?.data || [];
  const meta = data?.meta;

  const actions = [
    'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'CREATE', 'UPDATE', 'DELETE',
    'EXPORT_STARTED', 'EXPORT_COMPLETED', 'EXPORT_FAILED', 'PASSWORD_RESET',
    'MFA_ENABLED', 'MFA_DISABLED', 'STUDY_RECEIVED', 'STUDY_DELETED',
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Usuário, IP, entidade..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={selectedAction}
          onChange={(e) => { setSelectedAction(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground"
        >
          <option value="">Todas as ações</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground" />
        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground" />
        <button onClick={() => refetch()}
          className="p-2 rounded-lg border border-input bg-background text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
        {meta && (
          <span className="text-xs text-muted-foreground ml-auto">
            {meta.total.toLocaleString('pt-BR')} registros
          </span>
        )}
        <button
          onClick={handleExcelExport}
          disabled={isExporting || logs.length === 0}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-input bg-background text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Exportar para Excel"
        >
          <FileSpreadsheet size={14} className={isExporting ? 'animate-pulse' : ''} />
          {isExporting ? 'Exportando...' : 'Excel'}
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Data / Hora</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Ação</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Usuário</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Entidade</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">IP</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(12)].map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 skeleton rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    <FileText size={32} className="mx-auto mb-2 opacity-30" />
                    Nenhum registro de auditoria encontrado
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                        actionColors[log.action] || 'text-muted-foreground bg-muted border-muted',
                      )}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {log.user?.name || log.userId?.slice(0, 8) || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {log.entityType ? (
                        <span>{log.entityType}{log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ''}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                      {log.ipAddress || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {log.success ? (
                        <span className="flex items-center gap-1 text-xs text-status-success">
                          <CheckCircle size={12} /> OK
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-status-error" title={log.errorMessage}>
                          <XCircle size={12} /> Falhou
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Página {meta.page} de {meta.totalPages} ({meta.total.toLocaleString('pt-BR')} total)
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!meta.hasPreviousPage}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-40 transition-colors">
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={!meta.hasNextPage}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-40 transition-colors">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
