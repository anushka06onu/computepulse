import { useApp } from '../context/AppContext'

export function ReadinessBanner() {
  const { health, healthLoading, reloadHealth } = useApp()
  if (healthLoading || !health || health.ready) return null

  return (
    <div className="banner">
      <strong>Pipeline artifacts missing</strong>
      <p style={{ marginTop: 8 }}>
        Run these scripts from the repo root, then reload:
      </p>
      <ul>
        {health.missing.map((m) => (
          <li key={m.file}>
            <code>{m.file}</code> — run <code>{m.command}</code>
          </li>
        ))}
      </ul>
      <button className="btn btn-ghost" onClick={() => void reloadHealth()}>
        Recheck readiness
      </button>
    </div>
  )
}
