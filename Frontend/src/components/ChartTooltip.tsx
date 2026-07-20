type TooltipEntry = {
  name?: string | number
  value?: string | number
  color?: string
}

type ChartTooltipProps = {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
}

export function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div
      style={{
        background: 'var(--color-glass, var(--panel))',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--color-border, var(--border))',
        borderRadius: 'var(--radius-sm)',
        padding: '12px 16px',
        boxShadow: 'var(--shadow-md)',
        color: 'var(--ink)',
      }}
    >
      {label != null ? (
        <p
          style={{
            margin: '0 0 8px 0',
            fontSize: '0.8rem',
            fontWeight: 600,
            color: 'var(--ink-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {label}
        </p>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {payload.map((entry, index) => (
          <div
            key={index}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: entry.color,
              }}
            />
            <span
              style={{ fontSize: '0.85rem', color: 'var(--ink-secondary)' }}
            >
              {entry.name}:
            </span>
            <span
              style={{
                fontSize: '0.9rem',
                fontWeight: 650,
                fontFamily: 'var(--font-display)',
                color: 'var(--ink)',
              }}
            >
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
