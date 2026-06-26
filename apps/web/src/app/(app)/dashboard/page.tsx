'use client';

import { StudyStats, EdgeAgent } from '@smartpacs/types';
import { useQuery } from '@tanstack/react-query';
import {
  Image, Activity, CheckCircle,
  TrendingUp, HardDrive, Server, Clock,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

import { api } from '@/lib/api';
import { formatBytes, formatNumber, timeAgo, statusColors, cn } from '@/lib/utils';

function StatCard({
  title, value, subtitle, icon: Icon, trend, color = 'text-foreground',
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: { value: number; label: string };
  color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-muted-foreground font-medium">{title}</p>
        <div className="p-2 bg-muted rounded-lg">
          <Icon size={16} className="text-muted-foreground" />
        </div>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      {trend && (
        <div className="flex items-center gap-1 mt-2">
          <TrendingUp size={12} className={trend.value >= 0 ? 'text-status-success' : 'text-status-error'} />
          <span className={`text-xs ${trend.value >= 0 ? 'text-status-success' : 'text-status-error'}`}>
            {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
          </span>
        </div>
      )}
    </div>
  );
}

function AgentStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
      statusColors[status] || 'text-muted-foreground bg-muted border-muted',
    )}>
      <span className={cn(
        'w-1.5 h-1.5 rounded-full',
        status === 'ONLINE' ? 'bg-status-online animate-pulse-slow' : 'bg-current',
      )} />
      {status}
    </span>
  );
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['study-stats'],
    queryFn: () => api.get<{ data: StudyStats }>('/studies/stats').then((r) => r.data.data),
    refetchInterval: 30000,
  });

  const { data: agentsData, isLoading: agentsLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get<{ data: { data: EdgeAgent[] } }>('/agents?limit=6').then((r) => r.data.data.data),
    refetchInterval: 15000,
  });

  const chartData = [
    { name: 'Seg', estudos: 12, exports: 10 },
    { name: 'Ter', estudos: 19, exports: 17 },
    { name: 'Qua', estudos: 8, exports: 7 },
    { name: 'Qui', estudos: 25, exports: 23 },
    { name: 'Sex', estudos: 31, exports: 28 },
    { name: 'Sáb', estudos: 14, exports: 12 },
    { name: 'Dom', estudos: 6, exports: 5 },
  ];

  const byStatusData = stats?.byStatus
    ? Object.entries(stats.byStatus).map(([status, count]) => ({ status, count }))
    : [];

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Estudos Hoje"
          value={statsLoading ? '—' : formatNumber(stats?.today || 0)}
          subtitle={`${formatNumber(stats?.thisWeek || 0)} esta semana`}
          icon={Image}
          trend={{ value: 12, label: 'vs. ontem' }}
        />
        <StatCard
          title="Total de Estudos"
          value={statsLoading ? '—' : formatNumber(stats?.total || 0)}
          subtitle={`${formatNumber(stats?.thisMonth || 0)} este mês`}
          icon={Activity}
        />
        <StatCard
          title="Taxa de Exportação"
          value={statsLoading ? '—' : `${((stats?.exportSuccessRate || 0) * 100).toFixed(1)}%`}
          subtitle="Sucesso nas últimas 24h"
          icon={CheckCircle}
          color={stats?.exportSuccessRate && stats.exportSuccessRate > 0.95 ? 'text-status-success' : 'text-status-warning'}
        />
        <StatCard
          title="Armazenamento Total"
          value={statsLoading ? '—' : formatBytes(stats?.totalSizeBytes || 0)}
          subtitle={`Média: ${formatBytes(stats?.averageSizeBytes || 0)}/estudo`}
          icon={HardDrive}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Activity Chart */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground text-sm">Atividade Semanal</h2>
            <span className="text-xs text-muted-foreground">Últimos 7 dias</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="estudosGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="exportsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Area type="monotone" dataKey="estudos" name="Estudos" stroke="#3b82f6" fill="url(#estudosGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="exports" name="Exportações" stroke="#22c55e" fill="url(#exportsGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* By Status */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground text-sm mb-4">Por Status</h2>
          {statsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-8 skeleton" />
              ))}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byStatusData} layout="vertical" margin={{ left: -10 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="status" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                />
                <Bar dataKey="count" name="Quantidade" radius={[0, 4, 4, 0]}>
                  {byStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill="#3b82f6" opacity={0.7 + (index * 0.05)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Agents Status */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <Server size={16} />
            Agentes Edge
          </h2>
          <a href="/agents" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Ver todos →
          </a>
        </div>

        {agentsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-24 skeleton rounded-lg" />)}
          </div>
        ) : agentsData?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Nenhum agente registrado
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {agentsData?.map((agent) => (
              <div
                key={agent.id}
                className="border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-medium text-foreground truncate">{agent.name}</p>
                  <AgentStatusBadge status={agent.status} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{agent.hostname || 'Hostname desconhecido'}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock size={10} />
                    <span>{timeAgo(agent.lastHeartbeatAt)}</span>
                  </div>
                </div>
                {agent.metrics && (
                  <div className="flex gap-3 mt-3 text-xs">
                    <div className="flex-1">
                      <p className="text-muted-foreground">CPU</p>
                      <div className="h-1 bg-muted rounded-full mt-1">
                        <div
                          className="h-1 bg-status-info rounded-full"
                          style={{ width: `${Math.min(agent.metrics.cpuUsagePercent || 0, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-muted-foreground">RAM</p>
                      <div className="h-1 bg-muted rounded-full mt-1">
                        <div
                          className="h-1 bg-status-warning rounded-full"
                          style={{
                            width: `${Math.min(
                              ((agent.metrics.memoryUsedMB || 0) / (agent.metrics.memoryTotalMB || 1)) * 100,
                              100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
