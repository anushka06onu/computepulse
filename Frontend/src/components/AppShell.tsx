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
  ClipboardList
} from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../context/AppContext'
import { ReadinessBanner } from './ReadinessBanner'
import { pageVariants } from '../motion/presets'
import { ThemeToggle } from './ThemeToggle'
import { api, clearRequestCache } from '../api/client'

const CommandPalette = lazy(() =>
  import('./CommandPalette').then((m) => ({ default: m.CommandPalette })),
)
const OnboardingTour = lazy(() =>
  import('./OnboardingTour').then((m) => ({ default: m.OnboardingTour })),
)
const ChatDock = lazy(() =>
  import('./ChatDock').then((m) => ({ default: m.ChatDock })),
)

const links = [
  { to: '/app/brief', label: 'Action Brief', id: 'nav-brief', icon: ClipboardList, prefetch: () => import('../pages/BriefPage') },
  { to: '/app/fleet', label: 'Fleet Overview', id: 'nav-fleet', icon: LayoutDashboard, prefetch: () => import('../pages/FleetPage') },
  { to: '/app/warnings', label: 'Warnings', id: 'nav-warnings', icon: Bell, prefetch: () => import('../pages/WarningsPage') },
  { to: '/app/map', label: 'Cluster Map', id: 'nav-map', icon: Grid3x3, prefetch: () => import('../pages/ClusterMapPage') },
  { to: '/app/nodes', label: 'Node Explorer', id: 'nav-nodes', icon: Search, prefetch: () => import('../pages/NodePage') },
  { to: '/app/placement', label: 'Job Placement', id: 'nav-placement', icon: Sparkles, prefetch: () => import('../pages/PlacementPage') },
  { to: '/app/optimize', label: 'Cost Optimization', id: 'nav-optimize', icon: Wallet, prefetch: () => import('../pages/OptimizePage') },
  { to: '/app/evidence', label: 'System Accuracy', id: 'nav-evidence', icon: BarChart3, prefetch: () => import('../pages/EvidencePage') },
  { to: '/app/compare', label: 'Compare Nodes', id: 'nav-compare', icon: GitCompare, prefetch: () => import('../pages/ComparePage') },
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
    placeNextJob,
    reloadHealth,
  } = useApp()
  const [busy, setBusy] = useState(false)
  const [showThresh, setShowThresh] = useState(false)
  const [warnCount, setWarnCount] = useState(0)
  const [navOpen, setNavOpen] = useState(false)
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(false)
  const [chatReady, setChatReady] = useState(false)
  const [draftCritical, setDraftCritical] = useState(critical)
  const [draftWatch, setDraftWatch] = useState(watch)
  const navigate = useNavigate()
  const location = useLocation()
  const threshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void reloadHealth()
  }, [reloadHealth])

  useEffect(() => {
    setDraftCritical(critical)
    setDraftWatch(watch)
  }, [critical, watch])

  useEffect(() => {
    let cancelled = false
    const t = window.setTimeout(() => {
      api
        .warningsCounts(seed, critical, watch)
        .then((d) => {
          if (!cancelled) setWarnCount(d.counts.total)
        })
        .catch(() => {
          if (!cancelled) setWarnCount(0)
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(t)
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

  useEffect(() => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }).requestIdleCallback
    const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
    if (typeof ric === 'function') {
      const id = ric(() => setChatReady(true), { timeout: 2000 })
      return () => {
        if (typeof cic === 'function') cic(id)
      }
    }
    const t = window.setTimeout(() => setChatReady(true), 800)
    return () => window.clearTimeout(t)
  }, [])

  const scheduleThresholdCommit = (nextCritical: number, nextWatch: number) => {
    setDraftCritical(nextCritical)
    setDraftWatch(nextWatch)
    if (threshTimer.current) clearTimeout(threshTimer.current)
    threshTimer.current = setTimeout(() => {
      clearRequestCache()
      setCritical(nextCritical)
      setWatch(nextWatch)
    }, 250)
  }

  return (
    <div className={`app-shell${navOpen ? ' nav-open' : ''}${desktopNavCollapsed ? ' desktop-nav-collapsed' : ''}`}>
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
                  onMouseEnter={() => {
                    void l.prefetch()
                  }}
                  onFocus={() => {
                    void l.prefetch()
                  }}
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
            {busy ? 'Loading…' : 'Load new scenario'}
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
                Critical above {draftCritical}
                <input
                  type="range"
                  min={50}
                  max={90}
                  value={draftCritical}
                  onChange={(e) =>
                    scheduleThresholdCommit(Number(e.target.value), draftWatch)
                  }
                />
              </label>
              <label>
                Watch above {draftWatch}
                <input
                  type="range"
                  min={20}
                  max={Math.max(21, draftCritical - 1)}
                  value={draftWatch}
                  onChange={(e) =>
                    scheduleThresholdCommit(draftCritical, Number(e.target.value))
                  }
                />
              </label>
            </div>
          ) : null}
          <p className="nav-hint">
            Press ⌘K to jump anywhere.
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
              onClick={() => {
                if (window.innerWidth <= 1024) {
                  setNavOpen(true)
                } else {
                  setDesktopNavCollapsed(!desktopNavCollapsed)
                }
              }}
            >
              <motion.div
                animate={desktopNavCollapsed ? { rotate: 0 } : { rotate: 90 }}
                transition={{ duration: 0.2 }}
                style={{ display: 'flex' }}
              >
                <Menu size={18} />
              </motion.div>
            </button>
            <button
              type="button"
              className="app-topbar-brand"
              onClick={() => { window.location.href = '/' }}
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
                Live Demo Data
              </span>
              <span className="meta-pill meta-pill-hide-sm">
                Sample GPU Server Fleet
              </span>
            </div>
          </div>
          <div className="app-topbar-actions">
            <button
              className="btn btn-primary btn-sm"
              id="run-demo-btn"
              onClick={() => {
                if (location.pathname === '/app/demo') {
                  void placeNextJob()
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
        <AnimatePresence initial={false}>
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            className="page-motion"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      <Suspense fallback={null}>
        <CommandPalette />
        {!tourDone ? <OnboardingTour /> : null}
        {chatReady ? <ChatDock /> : null}
      </Suspense>
    </div>
  )
}
