import { Canvas } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { InstancedMesh } from 'three'
import type { FleetNode } from '../../api/client'
import { RiskCloud, type RiskPoint } from './RiskCloud'
import { RISK_BG } from './riskColors'
import { useInViewport } from '../../hooks/useInViewport'

function layoutPoints(nodes: FleetNode[]): RiskPoint[] {
  const n = Math.max(1, nodes.length)
  const cols = Math.ceil(Math.sqrt(n))
  const spacing = 0.42
  const offset = ((cols - 1) * spacing) / 2
  return nodes.map((node, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const height = (node.fused_risk / 100) * 2.8
    return {
      id: node.node_id,
      risk: node.fused_risk,
      x: col * spacing - offset,
      y: height * 0.5,
      z: row * spacing - offset,
      meta: {
        fused: node.fused_risk,
        risk: node.risk_score,
        anomaly: node.anomaly_score,
        health: node.health,
      },
    }
  })
}

function RiskPillars({ points }: { points: RiskPoint[] }) {
  const mesh = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])

  useEffect(() => {
    const m = mesh.current
    if (!m) return
    points.forEach((p, i) => {
      const h = Math.max(0.08, (p.risk / 100) * 2.8)
      dummy.position.set(p.x, h / 2, p.z)
      dummy.scale.set(0.14, h, 0.14)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      if (p.risk >= 70) color.set('#c44b3c')
      else if (p.risk >= 40) color.set('#d97706')
      else color.set('#2a9d8f')
      m.setColorAt(i, color)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [points, dummy, color])

  if (!points.length) return null
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, points.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        roughness={0.35}
        metalness={0.25}
        transparent
        opacity={0.55}
        toneMapped={false}
      />
    </instancedMesh>
  )
}

export function ClusterTopology3D({
  nodes,
  reduced = false,
  onSelect,
}: {
  nodes: FleetNode[]
  reduced?: boolean
  onSelect: (id: number) => void
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const visible = useInViewport(wrap)
  const [hovered, setHovered] = useState<number | null>(null)
  const points = useMemo(() => layoutPoints(nodes.slice(0, 900)), [nodes])
  const active = points.find((p) => p.id === hovered)

  return (
    <div className="map-3d" ref={wrap}>
      <Canvas
        dpr={[1, 1.6]}
        frameloop={visible ? 'always' : 'never'}
        camera={{ position: [8, 7, 10], fov: 42, near: 0.1, far: 120 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => gl.setClearColor(RISK_BG, 1)}
      >
        <color attach="background" args={[RISK_BG]} />
        <fog attach="fog" args={[RISK_BG, 18, 42]} />
        <ambientLight intensity={0.45} />
        <directionalLight position={[8, 12, 4]} intensity={1.2} />
        <directionalLight position={[-4, 3, -6]} intensity={0.35} color="#fecdd3" />
        <RiskPillars points={points} />
        <RiskCloud
          points={points}
          reduced={reduced}
          rotate={false}
          pointScale={0.55}
          highlighted={hovered}
          onHover={setHovered}
          onSelect={onSelect}
        />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
          <planeGeometry args={[28, 28]} />
          <meshStandardMaterial color="#0e1c1f" metalness={0.4} roughness={0.5} />
        </mesh>
        <ContactShadows position={[0, 0, 0]} opacity={0.35} scale={30} blur={2} far={8} />
        <OrbitControls
          makeDefault
          enablePan
          minDistance={4}
          maxDistance={28}
          maxPolarAngle={Math.PI / 2.05}
          target={[0, 0.8, 0]}
          autoRotate={!reduced && hovered == null && visible}
          autoRotateSpeed={0.35}
        />
      </Canvas>
      {active ? (
        <div className="map-3d-hud">
          <strong>Node {active.id}</strong>
          <span>Fused {Number(active.meta?.fused ?? active.risk).toFixed(1)}%</span>
          <span>{String(active.meta?.health ?? '')}</span>
          <em>Click to inspect</em>
        </div>
      ) : (
        <div className="map-3d-hud muted">
          Drag to orbit · height = fused risk · click a node
        </div>
      )}
    </div>
  )
}

