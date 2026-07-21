import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useMemo, useRef, useState } from 'react'
import type { FleetNode } from '../../api/client'
import { RiskCloud, type RiskPoint } from './RiskCloud'
import { RISK_BG } from './riskColors'
import { useInViewport } from './useInViewport'

function toCloud(nodes: FleetNode[]): RiskPoint[] {
  return nodes.slice(0, 220).map((n) => {
    const risk01 = n.fused_risk / 100
    const cpu = (n.cpu_usage_pct ?? 50) / 100
    const gpu = (n.gpu_usage_pct ?? 50) / 100
    return {
      id: n.node_id,
      risk: n.fused_risk,
      x: (risk01 - 0.5) * 4.2,
      y: (cpu - 0.5) * 3.2,
      z: (gpu - 0.5) * 3.2,
    }
  })
}

export function FleetRiskLite({
  nodes,
  reduced = false,
  onSelect,
}: {
  nodes: FleetNode[]
  reduced?: boolean
  onSelect?: (id: number) => void
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const visible = useInViewport(wrap)
  const [hovered, setHovered] = useState<number | null>(null)
  const points = useMemo(() => toCloud(nodes), [nodes])
  const active = points.find((p) => p.id === hovered)

  return (
    <div className="fleet-lite-3d" ref={wrap}>
      <Canvas
        dpr={[1, 1.5]}
        frameloop={visible ? 'always' : 'never'}
        camera={{ position: [4.2, 2.4, 5], fov: 42 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => gl.setClearColor(RISK_BG, 1)}
      >
        <color attach="background" args={[RISK_BG]} />
        <fog attach="fog" args={[RISK_BG, 9, 18]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 2]} intensity={1.2} />
        <directionalLight position={[-3, 1, -2]} intensity={0.3} color="#fecdd3" />
        <RiskCloud
          points={points}
          reduced={reduced}
          rotate={!reduced}
          pointScale={0.9}
          highlighted={hovered}
          onHover={setHovered}
          onSelect={onSelect}
        />
        <OrbitControls
          makeDefault
          enablePan={false}
          minDistance={3}
          maxDistance={10}
          autoRotate={!reduced && hovered == null && visible}
          autoRotateSpeed={0.55}
        />
      </Canvas>

      <div className="fleet-lite-chrome" aria-hidden>
        <div className="fleet-lite-scale">
          <span>High</span>
          <div className="fleet-lite-scale-bar" />
          <span>Low</span>
        </div>
      </div>

      <div className="fleet-lite-caption">
        {active ? (
          <>
            <strong>Node {active.id}</strong>
            <span>Fused {active.risk.toFixed(1)}%</span>
          </>
        ) : (
          <span>Drag to orbit · click to open</span>
        )}
      </div>
    </div>
  )
}
