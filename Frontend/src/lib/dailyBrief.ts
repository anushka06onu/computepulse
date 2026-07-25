/** Presentation helpers for Daily Action Brief (scoring stays on the API). */

import type { DailyBriefAction, DailyBriefResponse } from '../api/client'

export type BriefFilter = 'all' | 'conflicts'

export function filterBriefActions(
  actions: DailyBriefAction[],
  filter: BriefFilter,
): DailyBriefAction[] {
  if (filter === 'conflicts') return actions.filter((a) => a.has_conflict)
  return actions
}

export function briefSummaryText(data: DailyBriefResponse): string {
  const lines = [
    `ComputePulse Daily Action Brief — ${data.fleet_nodes ?? '?'} nodes scored`,
    `Actions: ${data.total_actions} · Conflicts: ${data.total_conflicts ?? data.conflicts.length} · Est. savings: $${Math.round(data.total_savings).toLocaleString()}`,
    '',
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
  if (data.caveat) lines.push(data.caveat)
  return lines.join('\n')
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
