'use client';

import type { Study, StorageDestination } from '@smartpacs/types';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, HardDrive, AlertTriangle } from 'lucide-react';
import { useState, useMemo } from 'react';

import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';


const SUPPORTED_TYPES = ['GOOGLE_DRIVE', 'ONEDRIVE', 'SMB'];

const typeLabels: Record<string, string> = {
  GOOGLE_DRIVE: 'Google Drive',
  ONEDRIVE: 'OneDrive',
  SMB: 'SMB / Compartilhamento de rede',
};

interface BulkExportResult {
  studyId: string;
  jobId?: string;
  error?: string;
}

interface BulkExportDialogProps {
  studies: Study[];
  onClose: () => void;
  onStarted: (results: Array<{ jobId: string; studyId: string }>) => void;
}

export function BulkExportDialog({ studies, onClose, onStarted }: BulkExportDialogProps) {
  const [destinationId, setDestinationId] = useState('');
  const open = studies.length > 0;

  const clinicIds = useMemo(() => Array.from(new Set(studies.map((s) => s.clinicId))), [studies]);
  const singleClinicId = clinicIds.length === 1 ? clinicIds[0] : null;

  const { data: destinations, isLoading } = useQuery({
    queryKey: ['storage-destinations', singleClinicId],
    queryFn: () =>
      api
        .get<{ data: StorageDestination[] }>(`/clinics/${singleClinicId}/storage`)
        .then((r) => r.data.data.filter((d) => d.isActive && SUPPORTED_TYPES.includes(d.type))),
    enabled: !!singleClinicId,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api
        .post<{ data: BulkExportResult[] }>('/exports/bulk', {
          studyIds: studies.map((s) => s.id),
          destinationId,
        })
        .then((r) => r.data.data),
    onSuccess: (results) => {
      const ok = results.filter((r) => r.jobId);
      const failed = results.filter((r) => r.error);

      if (failed.length === 0) {
        toast({ title: `${ok.length} exportações iniciadas`, description: 'Acompanhe o progresso na lista de estudos.' });
      } else {
        toast({
          title: `${ok.length} de ${results.length} exportações iniciadas`,
          description: `${failed.length} estudo(s) não puderam ser exportados.`,
          variant: ok.length > 0 ? 'default' : 'destructive',
        });
      }

      onStarted(ok.map((r) => ({ jobId: r.jobId!, studyId: r.studyId })));
      setDestinationId('');
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: 'Falha ao iniciar exportação em lote',
        description: err?.response?.data?.message,
        variant: 'destructive',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setDestinationId(''); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar {studies.length} estudos</DialogTitle>
          <DialogDescription>Selecione o destino de exportação para todos os estudos selecionados</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          {clinicIds.length > 1 ? (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <p>
                Os estudos selecionados pertencem a clínicas diferentes. Selecione apenas estudos de uma
                mesma clínica para exportar em lote.
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 size={14} className="animate-spin" /> Carregando destinos...
            </div>
          ) : !destinations || destinations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nenhum destino de armazenamento compatível (Google Drive, OneDrive ou SMB) está configurado para esta clínica.
            </p>
          ) : (
            <div className="space-y-2">
              {destinations.map((d) => (
                <label
                  key={d.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                    destinationId === d.id ? 'border-primary bg-primary/5' : 'border-input hover:bg-muted/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="destination"
                    value={d.id}
                    checked={destinationId === d.id}
                    onChange={() => setDestinationId(d.id)}
                    className="accent-primary"
                  />
                  <HardDrive size={14} className="text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{typeLabels[d.type] || d.type}</p>
                  </div>
                  {d.isDefault && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Padrão</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!destinationId || mutation.isPending || clinicIds.length > 1}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Exportar {studies.length} estudos
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
