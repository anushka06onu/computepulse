import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState, memo } from 'react'
import * as THREE from 'three'
import type { InstancedMesh } from 'three'
import { colorForRiskPct, RISK_BG } from '../three/riskColors'
import { useInViewport } from '../../hooks/useInViewport'

type Machine = {
  id: number
  risk: number
  cpu: number
  gpu: number
  position: THREE.Vector3
}

function seeded(i: number) {
  const x = Math.sin(i * 91.7 + 19.3) * 43758.5453
  return x - Math.floor(x)
}

/** Continuous risk scatter (correlated CPU/GPU + noise) — no hard blobs. */
function buildFleet(n = 180): Machine[] {
  const out: Machine[] = []
  for (let i = 0; i < n; i++) {
    const risk01 = Math.min(
      0.97,
      Math.max(0.03, seeded(i) * 0.62 + seeded(i + 3) * 0.38),
    )
    const cpu = Math.min(
      98,
      Math.max(4, 12 + risk01 * 58 + (seeded(i + 7) - 0.5) * 34),
    )
    const gpu = Math.min(
      98,
      Math.max(3, 8 + risk01 * 54 + (seeded(i + 13) - 0.5) * 36),
    )
    out.push({
      id: 1000 + i,
      risk: risk01 * 100,
      cpu,
      gpu,
      position: new THREE.Vector3(
        (risk01 - 0.5) * 5.4 + (seeded(i + 21) - 0.5) * 0.18,
        (cpu / 100 - 0.5) * 3.8 + (seeded(i + 29) - 0.5) * 0.14,
        (gpu / 100 - 0.5) * 3.8 + (seeded(i + 37) - 0.5) * 0.14,
      ),
    })
  }
  return out
}

function healthLabel(risk: number) {
  if (risk >= 70) return 'Critical'
  if (risk >= 40) return 'Watch'
  return 'Healthy'
}

function CameraIntro({ reduced }: { reduced: boolean }) {
  const { camera } = useThree()
  const done = useRef(reduced)
  const start = useRef(0)
  const from = useMemo(() => new THREE.Vector3(7.6, 4.4, 8.2), [])
  const to = useMemo(() => new THREE.Vector3(4.8, 2.6, 5.6), [])

  useEffect(() => {
    if (reduced) return
    camera.position.copy(from)
    camera.lookAt(0, 0, 0)
  }, [camera, reduced, from])

  useFrame((state) => {
    if (done.current) return
    if (!start.current) start.current = state.clock.elapsedTime
    const t = Math.min(1, (state.clock.elapsedTime - start.current) / 1.8)
    const e = 1 - Math.pow(1 - t, 3)
    camera.position.lerpVectors(from, to, e)
    camera.lookAt(0, 0.1, 0)
    if (t >= 1) done.current = true
  })

  return null
}

function SceneFloor() {
  return (
    <group position={[0, -2.15, 0]}>
      <gridHelper args={[9, 18, '#1f5c56', '#122226']} />
      {/* faint square ground — not a disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[9, 9]} />
        <meshBasicMaterial
          color="#071214"
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>
      {/* axis ticks: Risk / CPU / GPU origin */}
      <Line
        points={[
          [-2.7, 0.02, 0],
          [2.7, 0.02, 0],
        ]}
        color="#5eead4"
        lineWidth={1.2}
        transparent
        opacity={0.35}
      />
      <Line
        points={[
          [0, 0.02, 0],
          [0, 2.4, 0],
        ]}
        color="#94a3b8"
        lineWidth={1.1}
        transparent
        opacity={0.28}
      />
      <Line
        points={[
          [0, 0.02, -2.4],
          [0, 0.02, 2.4],
        ]}
        color="#64748b"
        lineWidth={1.1}
        transparent
        opacity={0.28}
      />
    </group>
  )
}

const FleetCloud = memo(function FleetCloud({
  machines,
  reduced,
  activeId,
  onSelect,
}: {
  machines: Machine[]
  reduced: boolean
  activeId: number | null
  onSelect: (id: number | null) => void
}) {
  const mesh = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const pulse = useRef(0)
  const activeRef = useRef(activeId)
  activeRef.current = activeId

  const beams = useMemo(() => {
    const critical = [...machines]
      .filter((m) => m.risk >= 70)
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 7)
    const edges: [THREE.Vector3, THREE.Vector3][] = []
    for (let i = 0; i < critical.length; i++) {
      for (let j = i + 1; j < Math.min(critical.length, i + 3); j++) {
        edges.push([critical[i].position, critical[j].position])
      }
    }
    return edges.slice(0, 8)
  }, [machines])

  useEffect(() => {
    const m = mesh.current
    if (!m) return
    const selected = activeId
    machines.forEach((node, i) => {
      dummy.position.copy(node.position)
      const base = 0.11 + node.risk / 720
      dummy.scale.setScalar(selected === node.id ? base * 1.55 : base)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)

      colorForRiskPct(node.risk, color)
      if (selected != null && selected !== node.id) {
        color.multiplyScalar(0.38)
      } else if (node.risk >= 70) {
        color.offsetHSL(0, 0.04, 0.06)
      }
      m.setColorAt(i, color)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [machines, activeId, dummy, color])

  useFrame((_, delta) => {
    if (reduced || !mesh.current) return
    const selected = activeRef.current
    pulse.current += delta
    const boost = 1 + Math.sin(pulse.current * 2.2) * 0.12
    const m = mesh.current
    machines.forEach((node, i) => {
      if (node.risk < 70 && node.id !== selected) return
      dummy.position.copy(node.position)
      const base = 0.11 + node.risk / 720
      const s =
        node.id === selected
          ? base * 1.55
          : node.risk >= 70
            ? base * boost
            : base
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, machines.length]}
        frustumCulled={false}
        onClick={(e) => {
          e.stopPropagation()
          const idx = e.instanceId
          if (idx == null) return
          const id = machines[idx]?.id ?? null
          onSelect(id === activeRef.current ? null : id)
        }}
      >
        <sphereGeometry args={[1, 18, 18]} />
        <meshStandardMaterial
          roughness={0.28}
          metalness={0.22}
          envMapIntensity={0.6}
        />
      </instancedMesh>

      {beams.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color="#fb7185"
          lineWidth={1.25}
          transparent
          opacity={0.28}
        />
      ))}
    </group>
  )
})

export function FleetRiskLandscape({ reduced = false }: { reduced?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null)
  const visible = useInViewport(wrap, 0.01)
  const machines = useMemo(() => buildFleet(180), [])
  const [activeId, setActiveId] = useState<number | null>(null)
  const active = useMemo(
    () => machines.find((m) => m.id === activeId) ?? null,
    [machines, activeId],
  )

  return (
    <div className="fleet-3d" ref={wrap}>
      <div className="fleet-3d-canvas">
        <Canvas
          dpr={[1, 1.75]}
          frameloop={visible ? 'always' : 'demand'}
          camera={{ position: [4.8, 2.6, 5.6], fov: 40, near: 0.1, far: 60 }}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
          }}
          onCreated={({ gl }) => {
            gl.setClearColor(RISK_BG, 1)
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1.15
            gl.outputColorSpace = THREE.SRGBColorSpace
          }}
          onPointerMissed={() => setActiveId(null)}
        >
          <color attach="background" args={[RISK_BG]} />
          <fog attach="fog" args={[RISK_BG, 10, 22]} />

          <hemisphereLight
            args={['#9fd9d0', '#0a1214', 0.55]}
          />
          <ambientLight intensity={0.35} />
          <directionalLight position={[5, 8, 3]} intensity={1.35} color="#f8fafc" />
          <directionalLight
            position={[-4, 1.5, -2]}
            intensity={0.45}
            color="#fda4af"
          />
          <pointLight position={[1.2, 2.4, 1]} intensity={0.7} color="#5eead4" distance={14} />

          <CameraIntro reduced={reduced} />
          <SceneFloor />
          <FleetCloud
            machines={machines}
            reduced={reduced}
            activeId={activeId}
            onSelect={setActiveId}
          />

          <OrbitControls
            makeDefault
            enablePan={false}
            enableZoom
            minDistance={3.6}
            maxDistance={12}
            minPolarAngle={0.35}
            maxPolarAngle={Math.PI * 0.48}
            target={[0, 0.15, 0]}
            autoRotate={!reduced && activeId == null && visible}
            autoRotateSpeed={0.4}
            enableDamping
            dampingFactor={0.08}
            mouseButtons={{
              LEFT: THREE.MOUSE.ROTATE,
              MIDDLE: THREE.MOUSE.DOLLY,
              RIGHT: THREE.MOUSE.PAN,
            }}
          />
        </Canvas>

        <div className="fleet-3d-chrome" aria-hidden>
          <div className="fleet-3d-pill">Live risk · CPU · GPU</div>
          <div className="fleet-3d-axis-overlay">
            <span>Risk →</span>
            <span>CPU ↑</span>
            <span>GPU →</span>
          </div>
          <div className="fleet-3d-scale">
            <span>High</span>
            <div className="fleet-3d-scale-bar" />
            <span>Low</span>
            <em>Risk</em>
          </div>
        </div>

        {active ? (
          <div
            className={`fleet-3d-info fleet-3d-info-${healthLabel(active.risk).toLowerCase()}`}
            role="status"
          >
            <div className="fleet-3d-info-top">
              <div>
                <span className="fleet-3d-info-kicker">Selected machine</span>
                <strong>Node {active.id}</strong>
              </div>
              <button
                type="button"
                className="fleet-3d-info-close"
                aria-label="Clear selection"
                onClick={() => setActiveId(null)}
              >
                ✕
              </button>
            </div>
            <div className="fleet-3d-info-grid">
              <div>
                <span>Status</span>
                <em>{healthLabel(active.risk)}</em>
              </div>
              <div>
                <span>Risk</span>
                <em>{active.risk.toFixed(1)}%</em>
              </div>
              <div>
                <span>CPU</span>
                <em>{active.cpu.toFixed(0)}%</em>
              </div>
              <div>
                <span>GPU</span>
                <em>{active.gpu.toFixed(0)}%</em>
              </div>
            </div>
            <p className="fleet-3d-info-hint">
              Click empty space or ✕ to clear · drag to orbit
            </p>
          </div>
        ) : (
          <div className="fleet-3d-hint" aria-hidden>
            Click a node for details
          </div>
        )}
      </div>
    </div>
  )
}
