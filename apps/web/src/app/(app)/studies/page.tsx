'use client';

import type { PaginatedResponse, Study, ExportProgressEvent, ExportResultEvent } from '@smartpacs/types';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Filter, Download, RefreshCw, ChevronLeft, ChevronRight, FileSpreadsheet,
  Loader2, CheckCircle2, XCircle,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

import { BulkExportDialog } from '@/components/studies/bulk-export-dialog';
import { ExportDialog } from '@/components/studies/export-dialog';
import { usePermission } from '@/hooks/use-permission';
import { api } from '@/lib/api';
import { exportToExcel } from '@/lib/export-excel';
import { getSocket } from '@/lib/socket';
import { cn, formatDate, formatBytes, timeAgo, statusColors, modalityLabels } from '@/lib/utils';

const MODALITIES = ['US', 'CT', 'MR', 'XR', 'CR', 'NM', 'MG'];
const STATUSES = ['RECEIVED', 'EXPORTED', 'EXPORT_FAILED', 'QUEUED_EXPORT', 'PROCESSING'];

type ExportRowState =
  | { status: 'started' | 'running'; progressPercent: number }
  | { status: 'completed' }
  | { status: 'failed'; error?: string };

export default function StudiesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedModality, setSelectedModality] = useState('');
  const { can } = usePermission();
  const [selectedStatus, setSelectedStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [exportStudy, setExportStudy] = useState<Study | null>(null);
  const [exportProgress, setExportProgress] = useState<Record<string, ExportRowState>>({});
  const jobToStudy = useRef<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkExportOpen, setBulkExportOpen] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onStarted = (payload: { jobId: string }) => {
      const studyId = jobToStudy.current[payload.jobId];
      if (studyId) setExportProgress((prev) => ({ ...prev, [studyId]: { status: 'started', progressPercent: 0 } }));
    };
    const onProgress = (payload: ExportProgressEvent) => {
      const studyId = jobToStudy.current[payload.jobId];
      if (studyId) setExportProgress((prev) => ({ ...prev, [studyId]: { status: 'running', progressPercent: payload.progressPercent } }));
    };
    const onCompleted = (payload: ExportResultEvent) => {
      const studyId = jobToStudy.current[payload.jobId];
      if (!studyId) return;
      setExportProgress((prev) => ({ ...prev, [studyId]: { status: 'completed' } }));
      setTimeout(() => setExportProgress((prev) => { const next = { ...prev }; delete next[studyId]; return next; }), 4000);
    };
    const onFailed = (payload: ExportResultEvent) => {
      const studyId = jobToStudy.current[payload.jobId];
      if (studyId) setExportProgress((prev) => ({ ...prev, [studyId]: { status: 'failed', error: payload.error } }));
    };

    socket.on('export:started', onStarted);
    socket.on('export:progress', onProgress);
    socket.on('export:completed', onCompleted);
    socket.on('export:failed', onFailed);

    return () => {
      socket.off('export:started', onStarted);
      socket.off('export:progress', onProgress);
      socket.off('export:completed', onCompleted);
      socket.off('export:failed', onFailed);
    };
  }, []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['studies', page, search, selectedModality, selectedStatus, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(search && { q: search }),
        ...(selectedModality && { modality: selectedModality }),
        ...(selectedStatus && { status: selectedStatus }),
        ...(dateFrom && { from: dateFrom }),
        ...(dateTo && { to: dateTo }),
      });
      return api
        .get<{ data: PaginatedResponse<Study> }>(`/studies?${params}`)
        .then((r) => r.data.data);
    },
    placeholderData: (prev) => prev,
  });

  const studies = data?.data || [];
  const meta = data?.meta;

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, search, selectedModality, selectedStatus, dateFrom, dateTo]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allOnPageSelected = studies.length > 0 && studies.every((s) => selectedIds.has(s.id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allOnPageSelected) {
        const next = new Set(prev);
        studies.forEach((s) => next.delete(s.id));
        return next;
      }
      const next = new Set(prev);
      studies.forEach((s) => next.add(s.id));
      return next;
    });
  };

  const selectedStudies = studies.filter((s) => selectedIds.has(s.id));

  const [isExporting, setIsExporting] = useState(false);

  const handleExcelExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams({
        page: '1', limit: '5000',
        ...(search && { q: search }),
        ...(selectedModality && { modality: selectedModality }),
        ...(selectedStatus && { status: selectedStatus }),
        ...(dateFrom && { from: dateFrom }),
        ...(dateTo && { to: dateTo }),
      });
      const res = await api.get<{ data: PaginatedResponse<Study> }>(`/studies?${params}`);
      const allStudies = res.data.data.data;
      exportToExcel(allStudies, [
        { header: 'Paciente', key: 'patientName', width: 30 },
        { header: 'ID Paciente', key: 'patientId', width: 20 },
        { header: 'Accession', key: 'accessionNumber', width: 20 },
        { header: 'Modalidades', key: (r) => r.modalities?.join(', '), width: 15 },
        { header: 'Data do Estudo', key: (r) => formatDate(r.studyDate), width: 16 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Arquivos', key: 'fileCount', width: 10 },
        { header: 'Tamanho', key: (r) => formatBytes(r.totalSizeBytes || 0), width: 14 },
        { header: 'Recebido em', key: (r) => formatDate(r.createdAt), width: 16 },
      ], 'estudos_dicom', 'Estudos DICOM');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Paciente, accession, UID..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors',
            showFilters
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-input hover:text-foreground',
          )}
        >
          <Filter size={14} />
          Filtros
        </button>

        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg border border-input bg-background text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>

        {meta && (
          <span className="text-sm text-muted-foreground ml-auto">
            {meta.total.toLocaleString('pt-BR')} estudos
          </span>
        )}

        <button
          onClick={handleExcelExport}
          disabled={isExporting || studies.length === 0}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-input bg-background text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Exportar para Excel"
        >
          <FileSpreadsheet size={14} className={isExporting ? 'animate-pulse' : ''} />
          {isExporting ? 'Exportando...' : 'Excel'}
        </button>
      </div>

      {/* Bulk selection bar */}
      {can('studies:export') && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-xl">
          <span className="text-sm text-foreground font-medium">
            {selectedIds.size} estudo{selectedIds.size > 1 ? 's' : ''} selecionado{selectedIds.size > 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setBulkExportOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Download size={14} />
            Exportar selecionados
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors ml-auto"
          >
            Limpar seleção
          </button>
        </div>
      )}

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-card border border-border rounded-xl p-4 animate-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Modalidade</label>
              <select
                value={selectedModality}
                onChange={(e) => { setSelectedModality(e.target.value); setPage(1); }}
                className="w-full px-2 py-1.5 bg-background border border-input rounded-lg text-sm text-foreground"
              >
                <option value="">Todas</option>
                {MODALITIES.map((m) => (
                  <option key={m} value={m}>{modalityLabels[m] || m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
                className="w-full px-2 py-1.5 bg-background border border-input rounded-lg text-sm text-foreground"
              >
                <option value="">Todos</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Data inicial</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="w-full px-2 py-1.5 bg-background border border-input rounded-lg text-sm text-foreground"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Data final</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="w-full px-2 py-1.5 bg-background border border-input rounded-lg text-sm text-foreground"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => {
                setSelectedModality(''); setSelectedStatus('');
                setDateFrom(''); setDateTo(''); setPage(1);
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Limpar filtros
            </button>
          </div>
        </div>
      )}

      {/* Studies Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {can('studies:export') && (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAll}
                      className="accent-primary"
                      disabled={studies.length === 0}
                    />
                  </th>
                )}
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Paciente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Accession</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Modalidade</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Data do Estudo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Tamanho</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Recebido</th>
                {can('studies:export') && <th className="px-4 py-3 w-10" />}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {[...Array(9)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 skeleton rounded" style={{ width: `${60 + Math.random() * 40}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : studies.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    Nenhum estudo encontrado
                  </td>
                </tr>
              ) : (
                studies.map((study) => (
                  <tr
                    key={study.id}
                    className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => window.location.href = `/studies/${study.id}`}
                  >
                    {can('studies:export') && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(study.id)}
                          onChange={() => toggleSelected(study.id)}
                          className="accent-primary"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{study.patientName || '—'}</p>
                      <p className="text-xs text-muted-foreground">{study.patientId || ''}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {study.accessionNumber || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {study.modalities?.map((m) => (
                          <span key={m} className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded font-medium">
                            {m}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {formatDate(study.studyDate)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {formatBytes(study.totalSizeBytes || 0)}
                      <span className="ml-1 text-muted-foreground/60">({study.fileCount} arq.)</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                        statusColors[study.status] || 'text-muted-foreground bg-muted border-muted',
                      )}>
                        {study.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {timeAgo(study.createdAt)}
                    </td>
                    {can('studies:export') && (
                      <td className="px-4 py-3">
                        {(() => {
                          const progress = exportProgress[study.id];
                          if (progress?.status === 'started' || progress?.status === 'running') {
                            return (
                              <div className="flex items-center gap-1.5 text-xs text-primary" title="Exportando...">
                                <Loader2 size={14} className="animate-spin" />
                                {progress.progressPercent}%
                              </div>
                            );
                          }
                          if (progress?.status === 'completed') {
                            return <CheckCircle2 size={14} className="text-green-600" />;
                          }
                          if (progress?.status === 'failed') {
                            return (
                              <span title={progress.error || 'Falha na exportação'}>
                                <XCircle size={14} className="text-destructive" />
                              </span>
                            );
                          }
                          return (
                            <button
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              onClick={(e) => { e.stopPropagation(); setExportStudy(study); }}
                              title="Exportar"
                            >
                              <Download size={14} />
                            </button>
                          );
                        })()}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Página {meta.page} de {meta.totalPages} ({meta.total.toLocaleString('pt-BR')} total)
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!meta.hasPreviousPage}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              {[...Array(Math.min(5, meta.totalPages))].map((_, i) => {
                const pageNum = Math.max(1, Math.min(meta.page - 2 + i, meta.totalPages - 4 + i));
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={cn(
                      'w-7 h-7 rounded text-xs transition-colors',
                      pageNum === meta.page
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted text-muted-foreground',
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={!meta.hasNextPage}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <ExportDialog
        study={exportStudy}
        onClose={() => setExportStudy(null)}
        onStarted={(jobId, studyId) => {
          jobToStudy.current[jobId] = studyId;
          setExportProgress((prev) => ({ ...prev, [studyId]: { status: 'started', progressPercent: 0 } }));
        }}
      />

      {bulkExportOpen && (
        <BulkExportDialog
          studies={selectedStudies}
          onClose={() => setBulkExportOpen(false)}
          onStarted={(results) => {
            setExportProgress((prev) => {
              const next = { ...prev };
              for (const { jobId, studyId } of results) {
                jobToStudy.current[jobId] = studyId;
                next[studyId] = { status: 'started', progressPercent: 0 };
              }
              return next;
            });
            setSelectedIds(new Set());
          }}
        />
      )}
    </div>
  );
}
