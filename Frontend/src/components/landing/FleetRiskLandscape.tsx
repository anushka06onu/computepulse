import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Line, OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import type { Group, InstancedMesh } from 'three'
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

function buildFleet(n = 160): Machine[] {
  const out: Machine[] = []
  for (let i = 0; i < n; i++) {
    const risk01 = Math.min(
      0.98,
      Math.max(0.02, seeded(i) * 0.55 + seeded(i + 3) * 0.45),
    )
    const cluster = risk01 > 0.55 ? 1 : 0
    const cpu = cluster ? 55 + seeded(i + 7) * 40 : 8 + seeded(i + 11) * 35
    const gpu = cluster ? 50 + seeded(i + 13) * 48 : 5 + seeded(i + 17) * 30
    out.push({
      id: 1000 + i,
      risk: risk01 * 100,
      cpu,
      gpu,
      position: new THREE.Vector3(
        (risk01 - 0.5) * 5.2,
        (cpu / 100 - 0.5) * 4.2,
        (gpu / 100 - 0.5) * 4.2,
      ),
    })
  }
  return out
}

function CameraIntro({ reduced }: { reduced: boolean }) {
  const { camera } = useThree()
  const done = useRef(reduced)
  const start = useRef(0)
  const from = useMemo(() => new THREE.Vector3(8.8, 5.2, 9.8), [])
  const to = useMemo(() => new THREE.Vector3(5.4, 3.0, 6.4), [])

  useEffect(() => {
    if (reduced) return
    camera.position.copy(from)
    camera.lookAt(0, 0, 0)
  }, [camera, reduced, from])

  useFrame((state) => {
    if (done.current) return
    if (!start.current) start.current = state.clock.elapsedTime
    const t = Math.min(1, (state.clock.elapsedTime - start.current) / 2.0)
    const e = 1 - Math.pow(1 - t, 3)
    camera.position.lerpVectors(from, to, e)
    camera.lookAt(0, 0.05, 0)
    if (t >= 1) done.current = true
  })

  return null
}

function FleetCloud({
  machines,
  reduced,
  hovered,
  setHovered,
}: {
  machines: Machine[]
  reduced: boolean
  hovered: number | null
  setHovered: (id: number | null) => void
}) {
  const group = useRef<Group>(null)
  const mesh = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const pulse = useRef(0)

  const beams = useMemo(() => {
    const critical = [...machines]
      .filter((m) => m.risk >= 70)
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 8)
    const edges: [THREE.Vector3, THREE.Vector3][] = []
    for (let i = 0; i < critical.length; i++) {
      for (let j = i + 1; j < Math.min(critical.length, i + 3); j++) {
        edges.push([critical[i].position, critical[j].position])
      }
    }
    return edges.slice(0, 10)
  }, [machines])

  useEffect(() => {
    const m = mesh.current
    if (!m) return
    machines.forEach((node, i) => {
      dummy.position.copy(node.position)
      dummy.scale.setScalar(0.14 + node.risk / 600)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, colorForRiskPct(node.risk, color))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [machines, dummy, color])

  useFrame((_, delta) => {
    if (!reduced && group.current && hovered == null) {
      group.current.rotation.y += delta * 0.1
    }
    if (reduced || !mesh.current) return
    pulse.current += delta
    const boost = 1 + Math.sin(pulse.current * 2.4) * 0.1
    const m = mesh.current
    machines.forEach((node, i) => {
      if (node.risk < 70 && node.id !== hovered) return
      dummy.position.copy(node.position)
      const base = 0.14 + node.risk / 600
      const s =
        node.id === hovered ? base * 1.18 : node.risk >= 70 ? base * boost : base
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <group ref={group}>
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, machines.length]}
        frustumCulled={false}
        onPointerMove={(e) => {
          e.stopPropagation()
          const id = e.instanceId
          if (id == null) return
          setHovered(machines[id]?.id ?? null)
        }}
        onPointerOut={() => setHovered(null)}
      >
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial
          roughness={0.28}
          metalness={0.22}
          toneMapped={false}
        />
      </instancedMesh>

      {beams.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color="#f87171"
          lineWidth={1.5}
          transparent
          opacity={0.4}
        />
      ))}

      <mesh position={[0, -2.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.8, 64]} />
        <meshStandardMaterial color="#0e1c1f" metalness={0.55} roughness={0.35} />
      </mesh>
      <gridHelper args={[7.5, 15, '#2a9d8f', '#1a3034']} position={[0, -2.34, 0]} />
      <ContactShadows
        position={[0, -2.33, 0]}
        opacity={0.4}
        scale={11}
        blur={2.2}
        far={5}
      />
    </group>
  )
}

class FxBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { error: boolean }
> {
  state = { error: false }
  static getDerivedStateFromError() {
    return { error: true }
  }
  render() {
    if (this.state.error) return this.props.fallback ?? null
    return this.props.children
  }
}

function PostFX({ intensity = 0.28 }: { intensity?: number }) {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom
        luminanceThreshold={0.78}
        luminanceSmoothing={0.5}
        intensity={intensity}
        mipmapBlur
      />
      <Vignette eskil={false} offset={0.32} darkness={0.35} />
    </EffectComposer>
  )
}

export function FleetRiskLandscape({ reduced = false }: { reduced?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null)
  const visible = useInViewport(wrap, 0.01)
  const machines = useMemo(() => buildFleet(160), [])
  const [hovered, setHovered] = useState<number | null>(null)
  const active = machines.find((m) => m.id === hovered)

  return (
    <div className="fleet-3d" ref={wrap}>
      <div className="fleet-3d-canvas">
        <Canvas
          dpr={[1, 1.75]}
          frameloop={visible ? 'always' : 'never'}
          camera={{ position: [5.4, 3.0, 6.4], fov: 42, near: 0.1, far: 80 }}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
          }}
          onCreated={({ gl }) => {
            gl.setClearColor(RISK_BG, 1)
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1.2
          }}
        >
          <color attach="background" args={[RISK_BG]} />
          <fog attach="fog" args={[RISK_BG, 11, 24]} />
          <ambientLight intensity={0.75} />
          <directionalLight position={[6, 10, 4]} intensity={1.45} />
          <directionalLight position={[-5, 2, -3]} intensity={0.4} color="#fecdd3" />
          <pointLight position={[0, 3, 0]} intensity={0.65} color="#5eead4" />

          <CameraIntro reduced={reduced} />
          <FleetCloud
            machines={machines}
            reduced={reduced}
            hovered={hovered}
            setHovered={setHovered}
          />
          {!reduced ? (
            <FxBoundary>
              <PostFX intensity={0.28} />
            </FxBoundary>
          ) : null}

          <OrbitControls
            makeDefault
            enablePan={false}
            enableZoom
            minDistance={3.8}
            maxDistance={14}
            target={[0, 0, 0]}
            autoRotate={!reduced && hovered == null && visible}
            autoRotateSpeed={0.55}
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
          <div className="fleet-3d-hud">
            <strong>Node {active.id}</strong>
            <span>Risk {active.risk.toFixed(1)}%</span>
            <span>CPU {active.cpu.toFixed(0)}%</span>
            <span>GPU {active.gpu.toFixed(0)}%</span>
          </div>
        ) : null}
      </div>
      <div className="fleet-3d-meta">
        {active ? (
          <p>
            Focused on node <strong>{active.id}</strong> — drag to orbit, scroll
            to zoom.
          </p>
        ) : (
          <p>
            Every point is one machine — risk vs CPU vs GPU. Drag to orbit,
            scroll to zoom.
          </p>
        )}
      </div>
    </div>
  )
}

