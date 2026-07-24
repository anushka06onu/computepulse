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
import {
  api,
  type DemoPlacement,
  type DemoQueueItem,
  type DemoReservation,
  type DemoScenario,
  type HealthResponse,
} from '../api/client'

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
  demoHistory: DemoPlacement[]
  demoQueue: DemoQueueItem[]
  demoReservations: DemoReservation[]
  /** When set, Run Demo page shows this history row (replay only). */
  demoViewing: DemoPlacement | null
  demoAutoRunning: boolean
  demoBatchNote: string | null
  setCritical: (v: number) => void
  setWatch: (v: number) => void
  refresh: () => Promise<void>
  setSeed: (s: number) => void
  completeTour: () => void
  reloadHealth: () => Promise<void>
  /** Place next queued job (nav Run Demo / Place next). */
  requestDemoRun: () => Promise<void>
  placeNextJob: () => Promise<DemoScenario>
  /** Place entire queue instantly (exclusive hosts). */
  placeAllAtOnce: () => Promise<{ placed: number; stopped?: string | null }>
  /** Auto-place queue one-by-one; caller waits for playback between steps. */
  runQueueAuto: (
    waitPlayback: () => Promise<void>,
  ) => Promise<{ placed: number; stopped?: string | null }>
  stopDemoAuto: () => void
  addJobs: (n: number) => void
  viewDemoHistory: (placement: DemoPlacement | null) => void
  /** Replay current (or viewing) scenario animation only. */
  requestDemoReplay: () => void
  ensureDemoScenario: (forSeed?: number, forRank?: number) => Promise<DemoScenario>
  clearDemoBatchNote: () => void
}

const Ctx = createContext<AppState | null>(null)

const TOUR_KEY = 'computepulse-tour-done'
const DEMO_CACHE_PREFIX = 'computepulse-demo-scenario-v9:'
const DEMO_RANK_KEY = 'computepulse-demo-rank-v3'
const DEMO_SESSION_KEY = 'computepulse-demo-session-v1'

type StoredSession = {
  seed: number
  rank: number
  history: DemoPlacement[]
  queue: DemoQueueItem[]
  reservations: DemoReservation[]
  current: DemoScenario | null
}

function cacheKey(seed: number, rank: number) {
  return `${DEMO_CACHE_PREFIX}${seed}:${rank}`
}

function reservationFromScenario(s: DemoScenario): DemoReservation {
  const gpus = s.job.gpu_count ?? 1
  return {
    node_id: s.to.node_id,
    cpu_delta: Math.min(28, 6 + gpus * 4),
    gpu_delta: Math.min(35, 8 + gpus * 5),
    mem_delta: Math.min(0.18, 0.04 + gpus * 0.02),
    job_id: s.job.id,
  }
}

function jobPreviewFromRank(seed: number, rank: number): { id: number; label: string } {
  // Mirror backend _job_for_rank templates (4 templates).
  const names = [
    'LLM fine-tune',
    'Vision batch infer',
    'Recommend model train',
    'ETL feature build',
  ]
  const idx = (seed + rank) % 4
  const jobId = 5100 + idx * 17 + (rank % 17)
  return { id: jobId, label: `${names[idx]} · Job ${jobId}` }
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

function readStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(DEMO_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed || typeof parsed.seed !== 'number') return null
    return {
      seed: parsed.seed,
      rank: parsed.rank ?? 0,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      queue: Array.isArray(parsed.queue) ? parsed.queue : [],
      reservations: Array.isArray(parsed.reservations) ? parsed.reservations : [],
      current: parsed.current ?? null,
    }
  } catch {
    return null
  }
}

function writeStoredSession(session: StoredSession) {
  try {
    sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session))
  } catch {
    /* ignore */
  }
}

function clearStoredSession() {
  try {
    sessionStorage.removeItem(DEMO_SESSION_KEY)
  } catch {
    /* ignore */
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const stored = useMemo(() => readStoredSession(), [])
  const [seed, setSeed] = useState(0)
  const [critical, setCritical] = useState(70)
  const [watch, setWatch] = useState(40)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [tourDone, setTourDone] = useState(
    () => localStorage.getItem(TOUR_KEY) === '1',
  )
  const [demoRank, setDemoRank] = useState(
    () => stored?.rank ?? readStoredRank(),
  )
  const [demoReplayAt, setDemoReplayAt] = useState(0)
  const [demoScenario, setDemoScenario] = useState<DemoScenario | null>(
    () => stored?.current ?? readCachedDemo(0, stored?.rank ?? readStoredRank()),
  )
  const [demoHistory, setDemoHistory] = useState<DemoPlacement[]>(
    () => stored?.history ?? [],
  )
  const [demoQueue, setDemoQueue] = useState<DemoQueueItem[]>(
    () => stored?.queue ?? [],
  )
  const [demoReservations, setDemoReservations] = useState<DemoReservation[]>(
    () => stored?.reservations ?? [],
  )
  const [demoViewing, setDemoViewing] = useState<DemoPlacement | null>(null)
  const [demoAutoRunning, setDemoAutoRunning] = useState(false)
  const [demoBatchNote, setDemoBatchNote] = useState<string | null>(null)

  const inflight = useRef<Promise<DemoScenario> | null>(null)
  const placeLockRef = useRef(false)
  const autoStopRef = useRef(false)
  const autoRunningRef = useRef(false)
  const scenarioRef = useRef<DemoScenario | null>(demoScenario)
  scenarioRef.current = demoScenario
  const historyRef = useRef(demoHistory)
  historyRef.current = demoHistory
  const queueRef = useRef(demoQueue)
  queueRef.current = demoQueue
  const reservationsRef = useRef(demoReservations)
  reservationsRef.current = demoReservations
  const criticalRef = useRef(critical)
  const watchRef = useRef(watch)
  const seedRef = useRef(seed)
  const rankRef = useRef(demoRank)
  const seededQueueRef = useRef(false)
  criticalRef.current = critical
  watchRef.current = watch
  seedRef.current = seed
  rankRef.current = demoRank

  const persistSession = useCallback(
    (partial?: Partial<StoredSession>) => {
      writeStoredSession({
        seed: partial?.seed ?? seedRef.current,
        rank: partial?.rank ?? rankRef.current,
        history: partial?.history ?? historyRef.current,
        queue: partial?.queue ?? queueRef.current,
        reservations: partial?.reservations ?? reservationsRef.current,
        current:
          partial && 'current' in partial
            ? (partial.current ?? null)
            : scenarioRef.current,
      })
    },
    [],
  )

  const reloadHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      const h = await api.health()
      setHealth(h)
    } catch {
      setHealth({
        ready: false,
        missing: [
          {
            file: 'api',
            command: 'cd backend && uvicorn api.main:app --reload',
          },
        ],
        root: '',
      })
    } finally {
      setHealthLoading(false)
    }
  }, [])

  useEffect(() => {
    if (stored && stored.seed !== 0 && seed === 0) return
    const cached = readCachedDemo(seed, demoRank)
    setDemoScenario((prev) => {
      if (prev && prev.seed === seed && (prev.rank ?? 0) === demoRank) return prev
      return cached
    })
  }, [seed, demoRank, stored])

  // When fleet seed becomes known, drop a stale session from another seed.
  useEffect(() => {
    if (!seed) return
    const s = readStoredSession()
    if (s && s.seed !== 0 && s.seed !== seed) {
      clearStoredSession()
      setDemoHistory([])
      setDemoQueue([])
      setDemoReservations([])
      setDemoViewing(null)
      setDemoRank(0)
      writeStoredRank(0)
      rankRef.current = 0
      seededQueueRef.current = false
      scenarioRef.current = null
      setDemoScenario(null)
    }
  }, [seed])

  const clearDemoSession = useCallback(() => {
    setDemoHistory([])
    setDemoQueue([])
    setDemoReservations([])
    setDemoViewing(null)
    historyRef.current = []
    queueRef.current = []
    reservationsRef.current = []
    seededQueueRef.current = false
    clearStoredSession()
  }, [])

  const refresh = useCallback(async () => {
    const res = await api.refresh()
    setDemoRank(0)
    writeStoredRank(0)
    rankRef.current = 0
    scenarioRef.current = null
    setDemoScenario(null)
    clearDemoSession()
    setSeed(res.seed)
  }, [clearDemoSession])

  const completeTour = useCallback(() => {
    localStorage.setItem(TOUR_KEY, '1')
    setTourDone(true)
  }, [])

  const fetchScenario = useCallback(
    async (
      target: number,
      rank: number,
      reservations: DemoReservation[],
      sessionIndex?: number,
    ) => {
      if (reservations.length === 0 && sessionIndex == null) {
        const cached = readCachedDemo(target, rank)
        if (cached && cached.seed === target) return cached
        return api.demo(target, criticalRef.current, watchRef.current, rank)
      }
      return api.demoPlace({
        seed: target,
        critical: criticalRef.current,
        watch: watchRef.current,
        rank,
        reservations,
        session_index: sessionIndex,
      })
    },
    [],
  )

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

      if (inflight.current) return inflight.current

      const req = fetchScenario(target, rank, reservationsRef.current)
        .then((d) => {
          if (reservationsRef.current.length === 0) {
            writeCachedDemo(target, rank, d)
          }
          scenarioRef.current = d
          setDemoScenario(d)
          persistSession({ current: d, rank, seed: target })
          return d
        })
        .finally(() => {
          inflight.current = null
        })
      inflight.current = req
      return req
    },
    [fetchScenario, persistSession],
  )

  const addJobs = useCallback(
    (n: number) => {
      const pool = Math.max(
        scenarioRef.current?.pool_size ?? 10,
        historyRef.current.length + 1,
        1,
      )
      const used = new Set<number>()
      if (scenarioRef.current) used.add(scenarioRef.current.rank ?? rankRef.current)
      for (const h of historyRef.current) used.add(h.rank ?? 0)
      for (const q of queueRef.current) used.add(q.rank)

      const next: DemoQueueItem[] = []
      let cursor = rankRef.current
      let guard = 0
      while (next.length < n && guard < pool * 2) {
        cursor = (cursor + 1) % pool
        guard += 1
        if (used.has(cursor)) continue
        used.add(cursor)
        next.push({
          rank: cursor,
          job_preview: jobPreviewFromRank(seedRef.current, cursor),
        })
      }
      if (!next.length) return
      const merged = [...queueRef.current, ...next]
      queueRef.current = merged
      setDemoQueue(merged)
      persistSession({ queue: merged })
    },
    [persistSession],
  )

  const placeNextJob = useCallback(async () => {
    if (placeLockRef.current) {
      throw new Error('A placement is already in progress')
    }
    placeLockRef.current = true
    setDemoViewing(null)
    setDemoBatchNote(null)
    try {
      const current = scenarioRef.current
      let nextReservations = reservationsRef.current
      let nextHistory = historyRef.current

      if (current?.to && current.job) {
        const alreadyPlaced = nextHistory.some(
          (h) =>
            h.job.id === current.job.id &&
            h.to.node_id === current.to.node_id &&
            (h.rank ?? 0) === (current.rank ?? 0),
        )
        if (!alreadyPlaced) {
          const alreadyReserved = nextReservations.some(
            (r) => r.node_id === current.to.node_id,
          )
          const placement: DemoPlacement = {
            ...current,
            placed_at: Date.now(),
            session_index: nextHistory.length,
          }
          nextHistory = [...nextHistory, placement]
          if (!alreadyReserved) {
            nextReservations = [
              ...nextReservations,
              reservationFromScenario(current),
            ]
          }
          historyRef.current = nextHistory
          reservationsRef.current = nextReservations
          setDemoHistory(nextHistory)
          setDemoReservations(nextReservations)
        }
      }

      let nextRank: number
      const q = queueRef.current
      if (q.length > 0) {
        const [head, ...rest] = q
        nextRank = head.rank
        queueRef.current = rest
        setDemoQueue(rest)
      } else {
        const pool = Math.max(current?.pool_size ?? 10, 1)
        nextRank = (rankRef.current + 1) % pool
      }

      rankRef.current = nextRank
      setDemoRank(nextRank)
      writeStoredRank(nextRank)
      scenarioRef.current = null
      inflight.current = null

      const sessionIndex = nextHistory.length
      const d = await fetchScenario(
        seedRef.current,
        nextRank,
        nextReservations,
        sessionIndex,
      )

      // Client-side exclusive check (belt + suspenders).
      if (
        nextReservations.some((r) => r.node_id === d.to.node_id)
      ) {
        throw new Error(
          `Exclusive host conflict: Node ${d.to.node_id} already has a session job`,
        )
      }

      scenarioRef.current = d
      setDemoScenario(d)
      persistSession({
        current: d,
        rank: nextRank,
        history: nextHistory,
        reservations: nextReservations,
        queue: queueRef.current,
      })
      setDemoReplayAt(Date.now())
      return d
    } finally {
      placeLockRef.current = false
    }
  }, [fetchScenario, persistSession])

  const placeAllAtOnce = useCallback(async () => {
    if (placeLockRef.current) {
      throw new Error('A placement is already in progress')
    }
    const queue = queueRef.current
    if (!queue.length) {
      throw new Error('Queue is empty — Add jobs first, then Place all at once')
    }

    placeLockRef.current = true
    setDemoViewing(null)
    setDemoBatchNote(null)
    autoStopRef.current = false
    autoRunningRef.current = true
    setDemoAutoRunning(true)

    try {
      let nextReservations = [...reservationsRef.current]
      let nextHistory = [...historyRef.current]
      const current = scenarioRef.current

      // Commit active placement before batching the queue.
      if (current?.to && current.job) {
        const already = nextReservations.some(
          (r) => r.node_id === current.to.node_id,
        )
        nextHistory = [
          ...nextHistory,
          {
            ...current,
            placed_at: Date.now(),
            session_index: nextHistory.length,
          },
        ]
        if (!already) {
          nextReservations = [
            ...nextReservations,
            reservationFromScenario(current),
          ]
        }
      }

      const ranks = queue.map((q) => q.rank)
      const batch = await api.demoPlaceBatch({
        seed: seedRef.current,
        critical: criticalRef.current,
        watch: watchRef.current,
        ranks,
        reservations: nextReservations,
        session_index_start: nextHistory.length,
      })

      const seen = new Set(nextReservations.map((r) => r.node_id))
      const accepted: DemoPlacement[] = []
      for (const p of batch.placements) {
        if (seen.has(p.to.node_id)) {
          // Skip any accidental duplicate host (should not happen server-side).
          continue
        }
        seen.add(p.to.node_id)
        accepted.push({
          ...p,
          placed_at: Date.now(),
          session_index: nextHistory.length + accepted.length,
        })
      }

      nextHistory = [...nextHistory, ...accepted]
      nextReservations = batch.reservations

      const last = accepted[accepted.length - 1] ?? current
      queueRef.current = []
      historyRef.current = nextHistory
      reservationsRef.current = nextReservations
      setDemoQueue([])
      setDemoHistory(nextHistory)
      setDemoReservations(nextReservations)

      if (last) {
        const {
          placed_at: _pa,
          session_index: _si,
          ...live
        } = last as DemoPlacement & DemoScenario
        scenarioRef.current = live
        setDemoScenario(live)
        rankRef.current = live.rank ?? rankRef.current
        setDemoRank(rankRef.current)
        writeStoredRank(rankRef.current)
        persistSession({
          current: live,
          rank: rankRef.current,
          history: nextHistory,
          reservations: nextReservations,
          queue: [],
        })
        setDemoReplayAt(Date.now())
      }

      const noteParts = [
        `Placed ${accepted.length} job${accepted.length === 1 ? '' : 's'} at once`,
        'exclusive hosts (one job per node)',
      ]
      if (batch.stopped_reason) noteParts.push(batch.stopped_reason)
      setDemoBatchNote(noteParts.join(' · '))

      return {
        placed: accepted.length,
        stopped: batch.stopped_reason,
      }
    } finally {
      placeLockRef.current = false
      autoRunningRef.current = false
      setDemoAutoRunning(false)
    }
  }, [persistSession])

  const stopDemoAuto = useCallback(() => {
    autoStopRef.current = true
  }, [])

  const runQueueAuto = useCallback(
    async (waitPlayback: () => Promise<void>) => {
      if (placeLockRef.current || autoRunningRef.current) {
        throw new Error('A placement is already in progress')
      }
      const initial = queueRef.current.length
      if (initial === 0) {
        throw new Error('Queue is empty — Add jobs first, then Run auto')
      }

      autoStopRef.current = false
      autoRunningRef.current = true
      setDemoAutoRunning(true)
      setDemoBatchNote(null)
      let placed = 0
      let stopped: string | null = null

      try {
        for (let i = 0; i < initial; i += 1) {
          if (autoStopRef.current) {
            stopped = 'Stopped by operator'
            break
          }
          try {
            await placeNextJob()
            placed += 1
          } catch (e) {
            stopped =
              e instanceof Error ? e.message : 'Placement failed — queue stopped'
            break
          }
          if (autoStopRef.current) {
            stopped = 'Stopped by operator'
            break
          }
          await waitPlayback()
        }
        setDemoBatchNote(
          stopped
            ? `Auto-run placed ${placed}/${initial} · ${stopped}`
            : `Auto-run complete · ${placed} job${placed === 1 ? '' : 's'} placed · exclusive hosts`,
        )
        return { placed, stopped }
      } finally {
        autoRunningRef.current = false
        setDemoAutoRunning(false)
        autoStopRef.current = false
      }
    },
    [placeNextJob],
  )

  const requestDemoRun = useCallback(async () => {
    await placeNextJob()
  }, [placeNextJob])

  const requestDemoReplay = useCallback(() => {
    setDemoReplayAt(Date.now())
  }, [])

  const viewDemoHistory = useCallback((placement: DemoPlacement | null) => {
    setDemoViewing(placement)
    if (placement) setDemoReplayAt(Date.now())
  }, [])

  const clearDemoBatchNote = useCallback(() => setDemoBatchNote(null), [])

  // Seed first queue when empty so UI has upcoming jobs to show.
  useEffect(() => {
    if (!demoScenario || demoQueue.length > 0 || demoHistory.length > 0) return
    if (seededQueueRef.current) return
    seededQueueRef.current = true
    addJobs(2)
  }, [demoScenario, demoQueue.length, demoHistory.length, addJobs])

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
      demoHistory,
      demoQueue,
      demoReservations,
      demoViewing,
      demoAutoRunning,
      demoBatchNote,
      setCritical,
      setWatch,
      refresh,
      setSeed,
      completeTour,
      reloadHealth,
      requestDemoRun,
      placeNextJob,
      placeAllAtOnce,
      runQueueAuto,
      stopDemoAuto,
      addJobs,
      viewDemoHistory,
      requestDemoReplay,
      ensureDemoScenario,
      clearDemoBatchNote,
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
      demoHistory,
      demoQueue,
      demoReservations,
      demoViewing,
      demoAutoRunning,
      demoBatchNote,
      refresh,
      completeTour,
      reloadHealth,
      requestDemoRun,
      placeNextJob,
      placeAllAtOnce,
      runQueueAuto,
      stopDemoAuto,
      addJobs,
      viewDemoHistory,
      requestDemoReplay,
      ensureDemoScenario,
      clearDemoBatchNote,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
