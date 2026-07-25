/** Presentation helpers for Daily Action Brief (scoring stays on the API). */

import type {
  DailyBriefAction,
  DailyBriefConflict,
  DailyBriefResponse,
} from '../api/client'

export type BriefFilter = 'all' | 'conflicts'

export function filterBriefActions(
  actions: DailyBriefAction[],
  filter: BriefFilter,
): DailyBriefAction[] {
  // "All actions" = today's top-5 (exactly one conflict card).
  // "Conflicts only" is rendered from data.conflicts — not this filter.
  if (filter === 'conflicts') return actions.filter((a) => a.has_conflict)
  return actions
}

export function briefSummaryText(data: DailyBriefResponse): string {
  const lines = [
    `ComputePulse Daily Action Brief — ${data.fleet_nodes ?? '?'} nodes scored`,
    `Top actions: ${data.total_actions} · Fleet conflicts: ${data.total_conflicts ?? data.conflicts.length} · Est. savings: $${Math.round(data.total_savings).toLocaleString()}`,
    '',
    '— Top 5 today —',
  ]
  for (const a of data.actions) {
    lines.push(
      `#${a.rank} Node ${a.node_id}${a.has_conflict ? ' [CONFLICT]' : ''}`,
    )
    lines.push(`  ${a.action_text}`)
    lines.push(
      `  Risk ${a.risk_score.toFixed(0)}% · Hist fail ${a.avg_risk_score.toFixed(0)}% · GPU ${a.gpu_usage_pct.toFixed(0)}%`,
    )
    lines.push(`  Reason: ${a.reason}`)
    if (a.conflict) {
      lines.push(`  ${a.conflict.model_a}: ${a.conflict.model_a_says}`)
      lines.push(`  ${a.conflict.model_b}: ${a.conflict.model_b_says}`)
    }
    lines.push('')
  }
  if (data.conflicts.length) {
    lines.push(`— All fleet conflicts (${data.conflicts.length}) —`)
    for (const c of data.conflicts) {
      lines.push(`Node ${c.node_id} — ${c.type}`)
      lines.push(`  ${c.model_a}: ${c.model_a_says}`)
      lines.push(`  ${c.model_b}: ${c.model_b_says}`)
      lines.push('')
    }
  }
  if (data.caveat) lines.push(data.caveat)
  return lines.join('\n')
}

export function conflictToAction(c: DailyBriefConflict, rank: number): DailyBriefAction {
  return {
    node_id: c.node_id,
    rank,
    action_text: `Resolve conflict on Node-${c.node_id} — ${c.type}`,
    reason: `${c.model_a} vs ${c.model_b}: models disagree on this node.`,
    risk_score: c.risk_score ?? 0,
    avg_risk_score: c.avg_risk_score ?? 0,
    is_underutilized: c.is_underutilized ?? false,
    estimated_savings_usd: c.estimated_savings_usd ?? 0,
    gpu_usage_pct: c.gpu_usage_pct ?? 0,
    has_conflict: true,
    conflict: c,
    conflicts: [c],
    priority_score: c.priority_score,
    severity: 'conflict',
    severity_tone: 'watch',
  }
}

export function primaryCtas(action: DailyBriefAction): {
  label: string
  to: string
  tone: 'primary' | 'secondary'
}[] {
  const ctas: { label: string; to: string; tone: 'primary' | 'secondary' }[] = [
    { label: 'Inspect node', to: `/app/nodes/${action.node_id}`, tone: 'primary' },
  ]
  if (action.has_conflict) {
    ctas.push({
      label: 'Open warnings',
      to: '/app/warnings',
      tone: 'secondary',
    })
  }
  if (action.is_underutilized) {
    ctas.push({
      label: 'View optimize',
      to: '/app/optimize',
      tone: 'secondary',
    })
  } else if (action.risk_score <= 40) {
    ctas.push({
      label: 'Placement',
      to: '/app/placement',
      tone: 'secondary',
    })
  }
  ctas.push({
    label: 'Compare',
    to: `/app/compare?nodes=${action.node_id}`,
    tone: 'secondary',
  })
  return ctas
}

