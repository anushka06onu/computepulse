import type { Health } from '../api/client'

export function StatusBadge({ health }: { health: Health }) {
  const label =
    health === 'critical' ? 'Critical' : health === 'watch' ? 'Watch' : 'Healthy'
  return (
    <span className={`status ${health}`}>
      <span className="status-dot" />
      {label}
    </span>
  )
}
