import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api, type DemoScenario, type HealthResponse } from '../api/client'

interface AppState {
  seed: number
  critical: number
  watch: number
  health: HealthResponse | null
  healthLoading: boolean
  tourDone: boolean
  demoRank: number
  /** Bumps when Run Demo / Replay should restart the animation. */
  demoReplayAt: number
  demoScenario: DemoScenario | null
  setCritical: (v: number) => void
  setWatch: (v: number) => void
  refresh: () => Promise<void>
  setSeed: (s: number) => void
  completeTour: () => void
  reloadHealth: () => Promise<void>
  /** Advance to next critical rank and load scenario (nav Run Demo). */
  requestDemoRun: () => Promise<void>
  /** Replay current scenario animation only. */
  requestDemoReplay: () => void
  ensureDemoScenario: (forSeed?: number, forRank?: number) => Promise<DemoScenario>
}

const Ctx = createContext<AppState | null>(null)

const TOUR_KEY = 'computepulse-tour-done'
const DEMO_CACHE_PREFIX = 'computepulse-demo-scenario-v8:'
const DEMO_RANK_KEY = 'computepulse-demo-rank-v3'

function cacheKey(seed: number, rank: number) {
  return `${DEMO_CACHE_PREFIX}${seed}:${rank}`
}

function readCachedDemo(seed: number, rank: number): DemoScenario | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(seed, rank))
    if (!raw) return null
    const parsed = JSON.parse(raw) as DemoScenario
    if (
      !parsed.candidates?.length ||
      !parsed.cost_savings ||
      !parsed.job?.requirements ||
      parsed.job.locked === true ||
      !parsed.from?.fit ||
      !parsed.to?.fit ||
      parsed.source !== 'warnings_node_critical'
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeCachedDemo(seed: number, rank: number, scenario: DemoScenario) {
  try {
    sessionStorage.setItem(cacheKey(seed, rank), JSON.stringify(scenario))
  } catch {
    /* ignore quota */
  }
}

function readStoredRank(): number {
  try {
    const n = Number(sessionStorage.getItem(DEMO_RANK_KEY) ?? '0')
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
  } catch {
    return 0
  }
}

function writeStoredRank(rank: number) {
  try {
    sessionStorage.setItem(DEMO_RANK_KEY, String(rank))
  } catch {
    /* ignore */
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [seed, setSeed] = useState(0)
  const [critical, setCritical] = useState(70)
  const [watch, setWatch] = useState(40)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [tourDone, setTourDone] = useState(
    () => localStorage.getItem(TOUR_KEY) === '1',
  )
  const [demoRank, setDemoRank] = useState(() => readStoredRank())
  const [demoReplayAt, setDemoReplayAt] = useState(0)
  const [demoScenario, setDemoScenario] = useState<DemoScenario | null>(() =>
    readCachedDemo(0, readStoredRank()),
  )
  const inflight = useRef<Promise<DemoScenario> | null>(null)
  const scenarioRef = useRef<DemoScenario | null>(demoScenario)
  scenarioRef.current = demoScenario
  const criticalRef = useRef(critical)
  const watchRef = useRef(watch)
  const seedRef = useRef(seed)
  const rankRef = useRef(demoRank)
  criticalRef.current = critical
  watchRef.current = watch
  seedRef.current = seed
  rankRef.current = demoRank

  const reloadHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      const h = await api.health()
      setHealth(h)
    } catch {
      setHealth({
        ready: false,
        missing: [{ file: 'api', command: 'cd backend && uvicorn api.main:app --reload' }],
        root: '',
      })
    } finally {
      setHealthLoading(false)
    }
  }, [])

  // Health is booted from AppShell so the landing page stays free of API wait.

  useEffect(() => {
    const cached = readCachedDemo(seed, demoRank)
    setDemoScenario((prev) => {
      if (prev && prev.seed === seed && (prev.rank ?? 0) === demoRank) return prev
      return cached
    })
  }, [seed, demoRank])

  const refresh = useCallback(async () => {
    const res = await api.refresh()
    setDemoRank(0)
    writeStoredRank(0)
    rankRef.current = 0
    scenarioRef.current = null
    setDemoScenario(null)
    setSeed(res.seed)
  }, [])

  const completeTour = useCallback(() => {
    localStorage.setItem(TOUR_KEY, '1')
    setTourDone(true)
  }, [])

  const ensureDemoScenario = useCallback(
    async (forSeed?: number, forRank?: number) => {
      const target = forSeed ?? seedRef.current
      const rank = forRank ?? rankRef.current
      const existing = scenarioRef.current
      if (
        existing &&
        existing.seed === target &&
        (existing.rank ?? 0) === rank &&
        existing.candidates?.length &&
        existing.cost_savings &&
        existing.job?.requirements &&
        existing.job.locked !== true &&
        existing.from?.fit &&
        existing.to?.fit &&
        existing.source === 'warnings_node_critical'
      ) {
        return existing
      }

      const cached = readCachedDemo(target, rank)
      if (cached && cached.seed === target) {
        scenarioRef.current = cached
        setDemoScenario(cached)
        return cached
      }

      if (inflight.current) return inflight.current

      const req = api
        .demo(target, criticalRef.current, watchRef.current, rank)
        .then((d) => {
          writeCachedDemo(target, rank, d)
          scenarioRef.current = d
          setDemoScenario(d)
          return d
        })
        .finally(() => {
          inflight.current = null
        })
      inflight.current = req
      return req
    },
    [],
  )

  const requestDemoRun = useCallback(async () => {
    const pool = scenarioRef.current?.pool_size ?? 10
    const nextRank = (rankRef.current + 1) % Math.max(pool, 1)
    rankRef.current = nextRank
    setDemoRank(nextRank)
    writeStoredRank(nextRank)
    scenarioRef.current = null
    inflight.current = null

    await ensureDemoScenario(seedRef.current, nextRank)
    setDemoReplayAt(Date.now())
  }, [ensureDemoScenario])

  const requestDemoReplay = useCallback(() => {
    setDemoReplayAt(Date.now())
  }, [])

  const value = useMemo(
    () => ({
      seed,
      critical,
      watch,
      health,
      healthLoading,
      tourDone,
      demoRank,
      demoReplayAt,
      demoScenario,
      setCritical,
      setWatch,
      refresh,
      setSeed,
      completeTour,
      reloadHealth,
      requestDemoRun,
      requestDemoReplay,
      ensureDemoScenario,
    }),
    [
      seed,
      critical,
      watch,
      health,
      healthLoading,
      tourDone,
      demoRank,
      demoReplayAt,
      demoScenario,
      refresh,
      completeTour,
      reloadHealth,
      requestDemoRun,
      requestDemoReplay,
      ensureDemoScenario,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}



