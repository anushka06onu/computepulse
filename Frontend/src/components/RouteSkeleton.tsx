export function RouteSkeleton() {
  return (
    <div className="route-skeleton" aria-busy="true" aria-label="Loading page">
      <div className="skeleton" style={{ height: 18, width: 120, marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 32, width: '40%', marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 16, width: '55%', marginBottom: 24 }} />
      <div className="kpi-row route-skeleton-kpis">
        <div className="skeleton" style={{ height: 88 }} />
        <div className="skeleton" style={{ height: 88 }} />
        <div className="skeleton" style={{ height: 88 }} />
      </div>
      <div className="skeleton" style={{ height: 280, marginTop: 16 }} />
    </div>
  )
}
