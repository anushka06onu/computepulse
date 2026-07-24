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
  anomaly_score: number
  fused_risk: number
  risk_percentile: number
  fleet_rank: number
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
    fusion?: { w_risk: number; w_anomaly: number }
    model_version?: string
    feature_set?: string[]
    trained_at?: string | null
  }
  drift?: {
    psi: number
    high: boolean
    threshold: number
    message: string | null
  }
  nodes: FleetNode[]
  caption: string
}

export interface TimelinePoint {
  index: number
  risk_score: number | null
  fused_risk?: number | null
  forecast_risk?: number | null
  cpu_usage_pct: number | null
  gpu_usage_pct: number | null
  status: string
}

export interface ShapItem {
  feature: string
  impact: number
}

export interface NodeDetail {
  node_id: number
  risk_score: number
  anomaly_score: number
  fused_risk: number
  risk_percentile: number
  fleet_rank: number
  health: Health
  instance_count: number
  historical_failure_rate: number
  model_version?: string
  trained_at?: string | null
  fusion?: { w_risk: number; w_anomaly: number }
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

export interface DemoJobRequirements {
  max_fused_risk_pct: number
  max_cpu_usage_pct: number
  max_gpu_usage_pct: number
  max_mem_pressure: number
  max_anomaly_score: number
}

export interface DemoFitCheck {
  key: string
  label: string
  required: string
  actual: string
  met: boolean
  why: string
}

export interface DemoFit {
  meets_all: boolean
  met_count: number
  total: number
  summary: string
  checks: DemoFitCheck[]
}

export interface DemoNodeMetrics {
  cpu_usage_pct: number
  gpu_usage_pct: number
  mem_pressure: number
  anomaly_score: number
  fused_risk: number
  risk_score: number
}

export interface DemoCandidate {
  rank: number
  node_id: number
  placement_score: number
  fused_risk: number
  risk_score: number
  components?: {
    safety: number
    normality: number
    history: number
  }
  meets_requirements?: boolean
  selected: boolean
  reserved?: boolean
}

export interface DemoCostSavings {
  estimated_usd: number
  risk_reduction_pp: number
  probability_avoided: number
  assumed_job_gpu_hours: number
  assumed_cost_per_gpu_hour: number
  assumed_incident_overhead_usd: number
  formula: string
  caveat: string
}

export interface DemoReservation {
  node_id: number
  cpu_delta: number
  gpu_delta: number
  mem_delta: number
  job_id: number
}

export interface DemoScenario {
  seed: number
  rank?: number
  pool_size?: number
  stable?: boolean
  job: {
    id: number
    label: string
    workload?: string
    duration_hours?: number
    gpu_count?: number
    requirements?: DemoJobRequirements
    locked?: boolean
  }
  from: {
    node_id: number
    risk_score: number
    anomaly_score?: number
    fused_risk?: number
    placement_score?: number
    health: number
    reasons: string[]
    metrics?: DemoNodeMetrics
    fit?: DemoFit
  }
  to: {
    node_id: number
    risk_score: number
    anomaly_score?: number
    fused_risk?: number
    placement_score?: number
    health: number
    actual_failure_rate: number | null
    metrics?: DemoNodeMetrics
    fit?: DemoFit
  }
  candidates?: DemoCandidate[]
  cost_savings?: DemoCostSavings
  health_before: number
  health_after: number
  placement_delta?: number
  fusion?: { w_risk: number; w_anomaly: number }
  model_version?: string
  caveat: string
  steps: string[]
  fit_headline?: {
    assign_fails: string[]
    recommend_meets: string[]
  }
  critical_threshold?: number
  source?: string
  session_note?: string | null
  constrained?: boolean
  reservations_applied?: number
}

export interface DemoPlacement extends DemoScenario {
  placed_at: number
  session_index: number
}

export interface DemoQueueItem {
  rank: number
  job_preview?: { id: number; label: string }
}

export interface ChatLink {
  label: string
  path: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatResponse {
  reply: string
  intent: string
  node_id: number | null
  health: string | null
  links: ChatLink[]
  recommendation: {
    target_node_ids: number[]
    why: string
    candidates?: Array<{
      node_id: number
      placement_score: number
      fused_risk: number
      why: string
    }>
  } | null
  sources: string[]
  providers: { llm: string | null; embeddings: string | null }
  llm_used: boolean
  caveat: string
  context_error?: string | null
}

export interface PlacementRow {
  node_id: number
  risk_score: number
  anomaly_score?: number
  fused_risk?: number
  score?: number
  components?: {
    safety: number
    normality: number
    history: number
  }
  cpu_usage_pct: number
  gpu_usage_pct: number
  actual_failure_rate: number | null
}

export interface PlacementResponse {
  policy?: string
  correlation: number
  n: number
  recommended: PlacementRow[]
  avoid: PlacementRow[]
  top_pick: PlacementRow | null
  lift?: {
    fail_rate_risk_only: number
    fail_rate_risk_anomaly_v2: number
    relative_reduction_vs_risk_only: number
  } | null
}

export interface OptimizeResponse {
  policy?: string
  summary: {
    total_machines_analyzed: number
    underutilized_machines: number
    total_estimated_savings_usd: number
    underutilized_threshold_pct: number
    assumed_cost_per_gpu_hour: number
    reclaim_count?: number
    investigate_count?: number
    watch_threshold?: number
  }
  opportunities: Array<{
    node_id: number
    avg_gpu_usage_pct: number
    avg_cpu_usage_pct: number
    total_hours_observed: number
    estimated_idle_hours: number
    estimated_savings_usd: number
    fused_risk?: number | null
    action?: 'reclaim' | 'investigate'
  }>
  caveat?: string
}

export interface MetricsResponse {
  baseline: Record<string, number>
  model: Record<string, number>
  cv: { auc_mean: number; auc_std: number }
  eval?: {
    pr_auc: number
    roc_auc: number
    ece: number
    brier: number
    top5_recall: number
    top10_recall: number
    node_top5_recall: number
    n_rows: number
    n_test: number
    provenance?: string
    computed_at?: string
    split?: { test_size: number; random_state: number; stratify: string }
  }
  provenance?: {
    real: boolean
    source: string
    dataset: string
    n_rows: number
    n_test: number
    split?: { test_size: number; random_state: number; stratify: string }
    baseline: string
    model: string
    note: string
    computed_at?: string
  }
  fusion?: { w_risk: number; w_anomaly: number }
  model_version?: string
  trained_at?: string | null
  placement_lift?: {
    fail_rate_risk_only: number
    fail_rate_risk_anomaly_v2: number
    relative_reduction_vs_risk_only: number
  } | null
  confusion: {
    true_negative: number
    false_positive: number
    false_negative: number
    true_positive: number
    failures_caught: number
  }
  feature_importance: Array<{ feature: string; importance: number; raw?: number }>
  comparison: Array<{ metric: string; baseline: number; model: number }>
}

export interface ExplainResponse {
  summary: string
  shap_reasons: string[]
  neighbors: Array<{
    node_id: number
    risk_score: number
    historical_failure_rate: number
  }>
  caveat: string
  llm_used: boolean
  embedding_used: boolean
  providers: { llm: string | null; embeddings: string | null }
}

export type WarningType =
  | 'node_critical'
  | 'node_watch'
  | 'forecast_rising'
  | 'drift_high'
  | 'unsafe_reclaim'
  | 'model_trust'

export type WarningSeverity = 'high' | 'medium' | 'low'

export interface WarningAlert {
  id: string
  type: WarningType
  severity: WarningSeverity
  node_id: number | null
  scores: Record<string, number | null | undefined>
  title: string
  summary: string
  reasons: string[]
  neighbors: Array<{
    node_id: number
    risk_score: number
    historical_failure_rate: number
  }>
  recommendation: {
    kind: string
    target_node_id: number | null
    placement_score: number | null
    caveat: string
  } | null
  providers: { llm: string | null; embeddings: string | null }
  model_version: string
  llm_used: boolean
  embedding_used: boolean
  caveat: string
}

export interface WarningsResponse {
  seed: number
  critical: number
  watch: number
  counts: {
    total: number
    high: number
    medium: number
    low: number
    by_type: Record<string, number>
  }
  drift?: {
    psi: number
    high: boolean
    threshold: number
    message: string | null
  }
  model_version: string
  fusion?: { w_risk: number; w_anomaly: number }
  explain_budget: number
  alerts: WarningAlert[]
  caveat: string
}

const BASE = (
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  (import.meta.env.VITE_API_URL as string | undefined) ??
  ''
).replace(/\/$/, '')

const requestCache = new Map<string, Promise<unknown>>()

async function readApiError(res: Response): Promise<string> {
  const detail = await res.text()
  if (!detail) return res.statusText || `HTTP ${res.status}`
  try {
    const parsed = JSON.parse(detail) as { detail?: unknown }
    if (typeof parsed.detail === 'string') return parsed.detail
  } catch {
    /* plain text */
  }
  return detail
}

async function get<T>(path: string, noCache = false): Promise<T> {
  if (!noCache && requestCache.has(path)) {
    return requestCache.get(path) as Promise<T>
  }

  const promise = fetch(`${BASE}${path}`)
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(await readApiError(res))
      }
      return res.json() as Promise<T>
    })
    .catch((err) => {
      requestCache.delete(path)
      throw err
    })

  if (!noCache) {
    requestCache.set(path, promise)
  }
  return promise
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    throw new Error(await readApiError(res))
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => get<HealthResponse>('/api/health', true),
  fleet: (seed?: number, critical = 70, watch = 40) =>
    get<FleetSnapshot>(
      `/api/fleet/snapshot?critical=${critical}&watch=${watch}${seed != null ? `&seed=${seed}` : ''}`,
    ),
  refresh: () => post<{ seed: number }>('/api/fleet/refresh'),
  nodes: (seed?: number) =>
    get<{ node_ids: number[]; count: number }>(
      seed != null ? `/api/nodes/?seed=${seed}` : '/api/nodes/',
    ),
  node: (
    id: number,
    seed?: number,
    critical = 70,
    watch = 40,
    opts?: { light?: boolean; forecast?: boolean },
  ) => {
    const light = opts?.light ? '&light=true' : ''
    const forecast = opts?.forecast === false ? '&forecast=false' : ''
    return get<NodeDetail>(
      `/api/nodes/${id}?critical=${critical}&watch=${watch}${seed != null ? `&seed=${seed}` : ''}${light}${forecast}`,
    )
  },
  compare: (nodeIds: number[], seed?: number, critical = 70, watch = 40) =>
    post<{ nodes: NodeDetail[] }>(
      `/api/nodes/compare?critical=${critical}&watch=${watch}${seed != null ? `&seed=${seed}` : ''}`,
      { node_ids: nodeIds },
    ),
  placement: (n = 5, seed?: number) =>
    get<PlacementResponse>(
      `/api/placement/?n=${n}${seed != null ? `&seed=${seed}` : ''}`,
    ),
  optimize: (seed?: number, watch = 40) =>
    get<OptimizeResponse>(
      `/api/optimize?watch=${watch}${seed != null ? `&seed=${seed}` : ''}`,
    ),
  metrics: () => get<MetricsResponse>('/api/metrics'),
  demo: (seed?: number, critical = 70, watch = 40, rank = 0) =>
    get<DemoScenario>(
      `/api/demo/scenario?critical=${critical}&watch=${watch}&rank=${rank}${
        seed != null ? `&seed=${seed}` : ''
      }`,
    ),
  demoPlace: (body: {
    seed?: number
    critical?: number
    watch?: number
    rank?: number
    reservations?: DemoReservation[]
    session_index?: number
  }) => post<DemoScenario>('/api/demo/session/place', body),
  demoPlaceBatch: (body: {
    seed?: number
    critical?: number
    watch?: number
    ranks: number[]
    reservations?: DemoReservation[]
    session_index_start?: number
  }) =>
    post<{
      seed: number
      placements: DemoScenario[]
      reservations: DemoReservation[]
      placed_count: number
      requested_count: number
      stopped_reason: string | null
    }>('/api/demo/session/place-batch', body),
  chat: (body: {
    message: string
    history?: ChatMessage[]
    seed?: number
    critical?: number
    watch?: number
    node_id?: number | null
  }) => post<ChatResponse>('/api/chat', body),
  explain: (nodeId: number, seed?: number, critical = 70, watch = 40) =>
    post<ExplainResponse>('/api/explain', {
      node_id: nodeId,
      seed: seed ?? null,
      critical,
      watch,
    }),
  warnings: (seed?: number, critical = 70, watch = 40, explainBudget = 0) =>
    get<WarningsResponse>(
      `/api/warnings?critical=${critical}&watch=${watch}&explain_budget=${explainBudget}${seed != null ? `&seed=${seed}` : ''}`,
    ),
  warningsCounts: (seed?: number, critical = 70, watch = 40) =>
    get<{
      seed: number
      counts: WarningsResponse['counts']
      model_version: string
    }>(
      `/api/warnings/counts?critical=${critical}&watch=${watch}${seed != null ? `&seed=${seed}` : ''}`,
    ),
  warningsRun: (seed?: number, critical = 70, watch = 40, explainBudget = 0) =>
    post<WarningsResponse>(
      `/api/warnings/run?critical=${critical}&watch=${watch}&explain_budget=${explainBudget}${seed != null ? `&seed=${seed}` : ''}`,
    ),
  warning: (alertId: string, seed?: number, critical = 70, watch = 40) =>
    get<WarningAlert & { seed?: number; fleet_caveat?: string }>(
      `/api/warnings/${encodeURIComponent(alertId)}?critical=${critical}&watch=${watch}${seed != null ? `&seed=${seed}` : ''}`,
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




