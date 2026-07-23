import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  Activity,
  Bell,
  BarChart3,
  GitCompare,
  Grid3x3,
  LayoutDashboard,
  Menu,
  Play,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../context/AppContext'
import { ReadinessBanner } from './ReadinessBanner'
import { pageVariants } from '../motion/presets'
import { ThemeToggle } from './ThemeToggle'
import { api } from '../api/client'

const CommandPalette = lazy(() =>
  import('./CommandPalette').then((m) => ({ default: m.CommandPalette })),
)
const OnboardingTour = lazy(() =>
  import('./OnboardingTour').then((m) => ({ default: m.OnboardingTour })),
)

const links = [
  { to: '/app/fleet', label: 'Fleet Overview', id: 'nav-fleet', icon: LayoutDashboard },
  { to: '/app/warnings', label: 'Warnings', id: 'nav-warnings', icon: Bell },
  { to: '/app/map', label: 'Cluster Map', id: 'nav-map', icon: Grid3x3 },
  { to: '/app/nodes', label: 'Node Explorer', id: 'nav-nodes', icon: Search },
  { to: '/app/placement', label: 'Job Placement', id: 'nav-placement', icon: Sparkles },
  { to: '/app/optimize', label: 'Cost Optimization', id: 'nav-optimize', icon: Wallet },
  { to: '/app/evidence', label: 'Model Evidence', id: 'nav-evidence', icon: BarChart3 },
  { to: '/app/compare', label: 'Compare Nodes', id: 'nav-compare', icon: GitCompare },
]

export function AppShell() {
  const {
    refresh,
    critical,
    watch,
    setCritical,
    setWatch,
    tourDone,
    seed,
    requestDemoRun,
    reloadHealth,
  } = useApp()
  const [busy, setBusy] = useState(false)
  const [showThresh, setShowThresh] = useState(false)
  const [warnCount, setWarnCount] = useState(0)
  const [navOpen, setNavOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    void reloadHealth()
    // Warm the default dashboard chunk while shell paints.
    void import('../pages/FleetPage')
  }, [reloadHealth])

  useEffect(() => {
    let cancelled = false
    api
      .warningsCounts(seed, critical, watch)
      .then((d) => {
        if (!cancelled) setWarnCount(d.counts.total)
      })
      .catch(() => {
        if (!cancelled) setWarnCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [seed, critical, watch])

  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!navOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false)
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [navOpen])

  return (
    <div className={`app-shell${navOpen ? ' nav-open' : ''}`}>
      <button
        type="button"
        className="nav-backdrop"
        aria-label="Close navigation"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />

      <aside className="app-nav" id="app-nav">
        <div className="nav-drawer-head">
          <div className="brand" onClick={() => navigate('/')}>
            <div className="brand-mark">
              <Activity size={16} strokeWidth={2.5} />
            </div>
            <span className="brand-word">
              Compute<span>Pulse</span>
            </span>
          </div>
          <button
            type="button"
            className="nav-close btn btn-ghost btn-sm"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="nav-scroll">
          <div className="nav-section-label">Workspace</div>
          <nav>
            {links.map((l) => {
              const Icon = l.icon
              const isActiveRoute = location.pathname === l.to

              return (
                <NavLink
                  key={l.to}
                  to={l.to}
                  id={l.id}
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' active' : ''}`
                  }
                >
                  {isActiveRoute && (
                    <motion.div
                      layoutId="activeNavPill"
                      className="nav-active-pill"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'var(--color-accent-soft)',
                        borderRadius: 'var(--radius-sm)',
                        zIndex: -1,
                      }}
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 30,
                      }}
                    />
                  )}
                  <Icon size={17} strokeWidth={2} />
                  <span className="nav-link-label">{l.label}</span>
                  {l.to === '/app/warnings' && warnCount > 0 ? (
                    <motion.span
                      className="nav-badge"
                      key={warnCount}
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                    >
                      {warnCount > 99 ? '99+' : warnCount}
                    </motion.span>
                  ) : null}
                </NavLink>
              )
            })}
          </nav>
        </div>

        <div className="nav-footer">
          <button
            className="btn btn-primary"
            id="refresh-btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await refresh()
              } finally {
                setBusy(false)
              }
            }}
          >
            <motion.span
              animate={busy ? { rotate: 360 } : { rotate: 0 }}
              transition={
                busy
                  ? { repeat: Infinity, duration: 0.85, ease: 'linear' }
                  : { duration: 0.2 }
              }
              style={{ display: 'inline-flex' }}
            >
              <RefreshCw size={15} />
            </motion.span>
            {busy ? 'Refreshing…' : 'Refresh snapshot'}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => setShowThresh((s) => !s)}
          >
            <Settings2 size={15} />
            Risk thresholds
          </button>
          {showThresh ? (
            <div className="thresh-panel">
              <label>
                Critical above {critical}
                <input
                  type="range"
                  min={50}
                  max={90}
                  value={critical}
                  onChange={(e) => setCritical(Number(e.target.value))}
                />
              </label>
              <label>
                Watch above {watch}
                <input
                  type="range"
                  min={20}
                  max={critical - 1}
                  value={watch}
                  onChange={(e) => setWatch(Number(e.target.value))}
                />
              </label>
            </div>
          ) : null}
          <p className="nav-hint">
            Press ⌘K to jump anywhere. Snapshot seed #{seed}.
          </p>
        </div>
      </aside>

      <main className="app-main">
        <div className="app-topbar">
          <div className="app-topbar-left">
            <button
              type="button"
              className="nav-toggle btn btn-ghost btn-sm"
              aria-label="Open menu"
              aria-expanded={navOpen}
              aria-controls="app-nav"
              onClick={() => setNavOpen(true)}
            >
              <Menu size={18} />
            </button>
            <button
              type="button"
              className="app-topbar-brand"
              onClick={() => navigate('/')}
              aria-label="ComputePulse home"
            >
              <span className="brand-mark" aria-hidden>
                <Activity size={14} strokeWidth={2.5} />
              </span>
              <span className="app-topbar-brand-name">
                Compute<span>Pulse</span>
              </span>
            </button>
            <div className="app-topbar-meta">
              <span className="meta-pill">
                <span className="dot" />
                Historical resample
              </span>
              <span className="meta-pill meta-pill-hide-sm">
                Alibaba GPU trace · 2020
              </span>
              <span className="meta-pill">Seed {seed}</span>
            </div>
          </div>
          <div className="app-topbar-actions">
            <span className="topbar-seed" title={`Snapshot seed ${seed}`}>
              #{seed}
            </span>
            <button
              className="btn btn-primary btn-sm"
              id="run-demo-btn"
              onClick={() => {
                if (location.pathname === '/app/demo') {
                  void requestDemoRun()
                } else {
                  navigate('/app/demo')
                }
              }}
            >
              <Play size={14} />
              <span className="btn-label-full">Run Demo</span>
              <span className="btn-label-short">Demo</span>
            </button>
            <ThemeToggle />
            <button
              className="btn btn-ghost btn-sm btn-landing"
              onClick={() => navigate('/')}
            >
              Landing
            </button>
          </div>
        </div>

        <ReadinessBanner />
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="page-motion"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      <Suspense fallback={null}>
        <CommandPalette />
        {!tourDone ? <OnboardingTour /> : null}
      </Suspense>
    </div>
  )
}


