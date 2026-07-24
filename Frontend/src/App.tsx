import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { LandingPage } from './pages/LandingPage'
import { AppShell } from './components/AppShell'
import { RouteSkeleton } from './components/RouteSkeleton'

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

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteSkeleton />}>{children}</Suspense>
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
                <LazyPage>
                  <FleetPage />
                </LazyPage>
              }
            />
            <Route
              path="map"
              element={
                <LazyPage>
                  <ClusterMapPage />
                </LazyPage>
              }
            />
            <Route
              path="demo"
              element={
                <LazyPage>
                  <RunDemoPage />
                </LazyPage>
              }
            />
            <Route
              path="warnings"
              element={
                <LazyPage>
                  <WarningsPage />
                </LazyPage>
              }
            />
            <Route
              path="nodes"
              element={
                <LazyPage>
                  <NodePage />
                </LazyPage>
              }
            />
            <Route
              path="nodes/:nodeId"
              element={
                <LazyPage>
                  <NodePage />
                </LazyPage>
              }
            />
            <Route
              path="placement"
              element={
                <LazyPage>
                  <PlacementPage />
                </LazyPage>
              }
            />
            <Route
              path="optimize"
              element={
                <LazyPage>
                  <OptimizePage />
                </LazyPage>
              }
            />
            <Route
              path="evidence"
              element={
                <LazyPage>
                  <EvidencePage />
                </LazyPage>
              }
            />
            <Route
              path="compare"
              element={
                <LazyPage>
                  <ComparePage />
                </LazyPage>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
