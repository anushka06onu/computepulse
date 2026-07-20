export type Health = 'critical' | 'watch' | 'healthy'

export interface MissingArtifact {
  file: string
  command: string
}

export interface HealthResponse {
  ready: boolean
  missing: MissingArtifact[]
  root: string
}

export interface FleetNode {
  node_id: number
  risk_score: number
  cpu_usage_pct: number
  gpu_usage_pct: number
  mem_pressure: number
  duration_hours: number
  status: string
  health: Health
}

export type Grade = 'Excellent' | 'Good' | 'Fair' | 'Poor'

export interface FleetSnapshot {
  seed: number
  summary: {
    total_machines: number
    critical: number
    watch: number
    healthy: number
    health_score: number
    grade: Grade
  }
  nodes: FleetNode[]
  caption: string
}

export interface TimelinePoint {
  index: number
  risk_score: number
  cpu_usage_pct: number
  gpu_usage_pct: number
  status: string
}

export interface ShapItem {
  feature: string
  impact: number
}

export interface NodeDetail {
  node_id: number
  risk_score: number
  health: Health
  instance_count: number
  historical_failure_rate: number
  snapshot: {
    cpu_usage_pct: number
    gpu_usage_pct: number
    mem_pressure: number
    gpu_mem_pressure: number
    io_ops_total: number
    duration_hours: number | null
    status: string
  }
  shap: ShapItem[]
  timeline: TimelinePoint[]
  history: Array<{
    cpu_usage_pct: number
    gpu_usage_pct: number
    mem_pressure: number
    duration_hours: number
    status: string
  }>
}

export interface DemoScenario {
  seed: number
  job: { id: number; label: string }
  from: {
    node_id: number
    risk_score: number
    health: number
    reasons: string[]
  }
  to: {
    node_id: number
    risk_score: number
    health: number
    actual_failure_rate: number | null
  }
  health_before: number
  health_after: number
  caveat: string
  steps: string[]
}

export interface PlacementResponse {
  correlation: number
  n: number
  recommended: Array<{
    node_id: number
    risk_score: number
    cpu_usage_pct: number
    gpu_usage_pct: number
    actual_failure_rate: number | null
  }>
  avoid: Array<{
    node_id: number
    risk_score: number
    cpu_usage_pct: number
    gpu_usage_pct: number
    actual_failure_rate: number | null
  }>
  top_pick: {
    node_id: number
    risk_score: number
    actual_failure_rate: number | null
  } | null
}

export interface OptimizeResponse {
  summary: {
    total_machines_analyzed: number
    underutilized_machines: number
    total_estimated_savings_usd: number
    underutilized_threshold_pct: number
    assumed_cost_per_gpu_hour: number
  }
  opportunities: Array<{
    node_id: number
    avg_gpu_usage_pct: number
    avg_cpu_usage_pct: number
    total_hours_observed: number
    estimated_idle_hours: number
    estimated_savings_usd: number
  }>
}

export interface MetricsResponse {
  baseline: Record<string, number>
  model: Record<string, number>
  cv: { auc_mean: number; auc_std: number }
  confusion: {
    true_negative: number
    false_positive: number
    false_negative: number
    true_positive: number
    failures_caught: number
  }
  feature_importance: Array<{ feature: string; importance: number }>
  comparison: Array<{ metric: string; baseline: number; model: number }>
}

const BASE = ''

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(detail || res.statusText)
  }
  return res.json() as Promise<T>
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(detail || res.statusText)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => get<HealthResponse>('/api/health'),
  fleet: (seed?: number, critical = 70, watch = 40) =>
    get<FleetSnapshot>(
      `/api/fleet/snapshot?critical=${critical}&watch=${watch}${seed != null ? `&seed=${seed}` : ''}`,
    ),
  refresh: () => post<{ seed: number }>('/api/fleet/refresh'),
  nodes: (seed?: number) =>
    get<{ node_ids: number[]; count: number }>(
      seed != null ? `/api/nodes/?seed=${seed}` : '/api/nodes/',
    ),
  node: (id: number, seed?: number, critical = 70, watch = 40) =>
    get<NodeDetail>(
      `/api/nodes/${id}?critical=${critical}&watch=${watch}${seed != null ? `&seed=${seed}` : ''}`,
    ),
  compare: (nodeIds: number[], seed?: number, critical = 70, watch = 40) =>
    post<{ nodes: NodeDetail[] }>(
      `/api/nodes/compare?critical=${critical}&watch=${watch}${seed != null ? `&seed=${seed}` : ''}`,
      { node_ids: nodeIds },
    ),
  placement: (n = 5, seed?: number) =>
    get<PlacementResponse>(
      `/api/placement/?n=${n}${seed != null ? `&seed=${seed}` : ''}`,
    ),
  optimize: () => get<OptimizeResponse>('/api/optimize'),
  metrics: () => get<MetricsResponse>('/api/metrics'),
  demo: (seed?: number, critical = 70, watch = 40) =>
    get<DemoScenario>(
      `/api/demo/scenario?critical=${critical}&watch=${watch}${seed != null ? `&seed=${seed}` : ''}`,
    ),
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const keys = Object.keys(rows[0])
  const lines = [
    keys.join(','),
    ...rows.map((r) =>
      keys.map((k) => JSON.stringify(r[k] ?? '')).join(','),
    ),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
