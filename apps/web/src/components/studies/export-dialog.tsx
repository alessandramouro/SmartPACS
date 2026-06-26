'use client';

import type { Study, StorageDestination, ExportJob } from '@smartpacs/types';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, HardDrive } from 'lucide-react';
import { useState } from 'react';

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

interface ExportDialogProps {
  study: Study | null;
  onClose: () => void;
  onStarted: (jobId: string, studyId: string) => void;
}

export function ExportDialog({ study, onClose, onStarted }: ExportDialogProps) {
  const [destinationId, setDestinationId] = useState('');

  const { data: destinations, isLoading } = useQuery({
    queryKey: ['storage-destinations', study?.clinicId],
    queryFn: () =>
      api
        .get<{ data: StorageDestination[] }>(`/clinics/${study!.clinicId}/storage`)
        .then((r) => r.data.data.filter((d) => d.isActive && SUPPORTED_TYPES.includes(d.type))),
    enabled: !!study,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api
        .post<{ data: ExportJob }>(`/exports/studies/${study!.id}/destinations/${destinationId}`)
        .then((r) => r.data.data),
    onSuccess: (job) => {
      toast({ title: 'Exportação iniciada', description: 'Acompanhe o progresso na lista de estudos.' });
      onStarted(job.id, study!.id);
      setDestinationId('');
      onClose();
    },
    onError: () => {
      toast({ title: 'Falha ao iniciar exportação', variant: 'destructive' });
    },
  });

  return (
    <Dialog open={!!study} onOpenChange={(o) => { if (!o) { setDestinationId(''); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar estudo</DialogTitle>
          <DialogDescription>{study?.patientName || study?.patientId || 'Selecione o destino de exportação'}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          {isLoading ? (
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
            disabled={!destinationId || mutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Exportar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
