import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { LandingPage } from './pages/LandingPage'
import { AppShell } from './components/AppShell'

const FleetPage = lazy(() =>
  import('./pages/FleetPage').then((m) => ({ default: m.FleetPage })),
)
const NodePage = lazy(() =>
  import('./pages/NodePage').then((m) => ({ default: m.NodePage })),
)
const PlacementPage = lazy(() =>
  import('./pages/PlacementPage').then((m) => ({ default: m.PlacementPage })),
)
const OptimizePage = lazy(() =>
  import('./pages/OptimizePage').then((m) => ({ default: m.OptimizePage })),
)
const EvidencePage = lazy(() =>
  import('./pages/EvidencePage').then((m) => ({ default: m.EvidencePage })),
)
const ComparePage = lazy(() =>
  import('./pages/ComparePage').then((m) => ({ default: m.ComparePage })),
)
const ClusterMapPage = lazy(() =>
  import('./pages/ClusterMapPage').then((m) => ({ default: m.ClusterMapPage })),
)
const RunDemoPage = lazy(() =>
  import('./pages/RunDemoPage').then((m) => ({ default: m.RunDemoPage })),
)
const WarningsPage = lazy(() =>
  import('./pages/WarningsPage').then((m) => ({ default: m.WarningsPage })),
)

function RouteFallback() {
  return (
    <div className="route-fallback" aria-busy="true" aria-label="Loading">
      <div className="route-fallback-pulse" />
    </div>
  )
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Navigate to="fleet" replace />} />
            <Route
              path="fleet"
              element={
                <Lazy>
                  <FleetPage />
                </Lazy>
              }
            />
            <Route
              path="map"
              element={
                <Lazy>
                  <ClusterMapPage />
                </Lazy>
              }
            />
            <Route
              path="demo"
              element={
                <Lazy>
                  <RunDemoPage />
                </Lazy>
              }
            />
            <Route
              path="warnings"
              element={
                <Lazy>
                  <WarningsPage />
                </Lazy>
              }
            />
            <Route
              path="nodes"
              element={
                <Lazy>
                  <NodePage />
                </Lazy>
              }
            />
            <Route
              path="nodes/:nodeId"
              element={
                <Lazy>
                  <NodePage />
                </Lazy>
              }
            />
            <Route
              path="placement"
              element={
                <Lazy>
                  <PlacementPage />
                </Lazy>
              }
            />
            <Route
              path="optimize"
              element={
                <Lazy>
                  <OptimizePage />
                </Lazy>
              }
            />
            <Route
              path="evidence"
              element={
                <Lazy>
                  <EvidencePage />
                </Lazy>
              }
            />
            <Route
              path="compare"
              element={
                <Lazy>
                  <ComparePage />
                </Lazy>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
