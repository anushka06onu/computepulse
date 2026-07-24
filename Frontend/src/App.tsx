import { Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { LandingPage } from './pages/LandingPage'
import { AppShell } from './components/AppShell'

import { FleetPage } from './pages/FleetPage'
import { NodePage } from './pages/NodePage'
import { PlacementPage } from './pages/PlacementPage'
import { OptimizePage } from './pages/OptimizePage'
import { EvidencePage } from './pages/EvidencePage'
import { ComparePage } from './pages/ComparePage'
import { ClusterMapPage } from './pages/ClusterMapPage'
import { RunDemoPage } from './pages/RunDemoPage'
import { WarningsPage } from './pages/WarningsPage'

function RouteFallback() {
  return (
    <div className="route-fallback" aria-busy="true" aria-label="Loading">
      <div className="route-fallback-pulse" />
    </div>
  )
}


export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Navigate to="fleet" replace />} />
            <Route path="fleet" element={<FleetPage />} />
            <Route path="map" element={<ClusterMapPage />} />
            <Route path="demo" element={<RunDemoPage />} />
            <Route path="warnings" element={<WarningsPage />} />
            <Route path="nodes" element={<NodePage />} />
            <Route path="nodes/:nodeId" element={<NodePage />} />
            <Route path="placement" element={<PlacementPage />} />
            <Route path="optimize" element={<OptimizePage />} />
            <Route path="evidence" element={<EvidencePage />} />
            <Route path="compare" element={<ComparePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
