import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, type HealthResponse } from '../api/client'

interface AppState {
  seed: number
  critical: number
  watch: number
  health: HealthResponse | null
  healthLoading: boolean
  tourDone: boolean
  setCritical: (v: number) => void
  setWatch: (v: number) => void
  refresh: () => Promise<void>
  setSeed: (s: number) => void
  completeTour: () => void
  reloadHealth: () => Promise<void>
}

const Ctx = createContext<AppState | null>(null)

const TOUR_KEY = 'computepulse-tour-done'

export function AppProvider({ children }: { children: ReactNode }) {
  const [seed, setSeed] = useState(0)
  const [critical, setCritical] = useState(70)
  const [watch, setWatch] = useState(40)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [tourDone, setTourDone] = useState(
    () => localStorage.getItem(TOUR_KEY) === '1',
  )

  const reloadHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      const h = await api.health()
      setHealth(h)
    } catch {
      setHealth({
        ready: false,
        missing: [{ file: 'api', command: 'uvicorn api.main:app --reload' }],
        root: '',
      })
    } finally {
      setHealthLoading(false)
    }
  }, [])

  useEffect(() => {
    void reloadHealth()
  }, [reloadHealth])

  const refresh = useCallback(async () => {
    const res = await api.refresh()
    setSeed(res.seed)
  }, [])

  const completeTour = useCallback(() => {
    localStorage.setItem(TOUR_KEY, '1')
    setTourDone(true)
  }, [])

  const value = useMemo(
    () => ({
      seed,
      critical,
      watch,
      health,
      healthLoading,
      tourDone,
      setCritical,
      setWatch,
      refresh,
      setSeed,
      completeTour,
      reloadHealth,
    }),
    [
      seed,
      critical,
      watch,
      health,
      healthLoading,
      tourDone,
      refresh,
      completeTour,
      reloadHealth,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
