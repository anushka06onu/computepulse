import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, Line, OrbitControls, Text } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState, memo } from 'react'
import * as THREE from 'three'
import type { InstancedMesh, Mesh } from 'three'
import { colorForRiskPct } from '../three/riskColors'
import { useInViewport } from '../../hooks/useInViewport'

const SCENE_BG = '#050a0d'
const FLOOR = 6.2
const HALF = FLOOR / 2

type Machine = {
  id: number
  risk: number
  cpu: number
  gpu: number
  position: THREE.Vector3
  height: number
}

type Band = 'healthy' | 'watch' | 'critical'

function seeded(i: number) {
  const x = Math.sin(i * 91.7 + 19.3) * 43758.5453
  return x - Math.floor(x)
}

function riskBand(risk: number): Band {
  if (risk >= 70) return 'critical'
  if (risk >= 40) return 'watch'
  return 'healthy'
}

function bandLabel(band: Band) {
  if (band === 'critical') return 'Avoid'
  if (band === 'watch') return 'Watch'
  return 'Prefer'
}

function bandCopy(band: Band) {
  if (band === 'critical') return 'High failure risk — do not place the next job here.'
  if (band === 'watch') return 'Elevated risk — monitor before scheduling.'
  return 'Low failure risk — safer landing zone for the next job.'
}

function buildFleet(n = 80): Machine[] {
  const out: Machine[] = []
  for (let i = 0; i < n; i++) {
    const risk01 = Math.min(
      0.97,
      Math.max(0.05, seeded(i) * 0.55 + seeded(i + 3) * 0.45),
    )
    const cpu = Math.min(
      97,
      Math.max(5, 12 + risk01 * 55 + (seeded(i + 7) - 0.5) * 26),
    )
    const gpu = Math.min(
      97,
      Math.max(5, 10 + risk01 * 52 + (seeded(i + 13) - 0.5) * 28),
    )
    const height = 0.3 + risk01 * 2.8
    const x = ((cpu / 100) - 0.5) * (FLOOR - 1.2)
    const z = ((gpu / 100) - 0.5) * (FLOOR - 1.2)
    out.push({
      id: 1000 + i,
      risk: risk01 * 100,
      cpu,
      gpu,
      height,
      position: new THREE.Vector3(
        x + (seeded(i + 21) - 0.5) * 0.06,
        height / 2,
        z + (seeded(i + 37) - 0.5) * 0.06,
      ),
    })
  }
  return out
}

function CameraIntro({ reduced }: { reduced: boolean }) {
  const { camera } = useThree()
  const done = useRef(reduced)
  const start = useRef(0)
  const from = useMemo(() => new THREE.Vector3(9, 7, 9), [])
  const to = useMemo(() => new THREE.Vector3(5.5, 4.2, 5.5), [])

  useEffect(() => {
    if (reduced) return
    camera.position.copy(from)
    camera.lookAt(0, 0.4, 0)
  }, [camera, reduced, from])

  useFrame((state) => {
    if (done.current) return
    if (!start.current) start.current = state.clock.elapsedTime
    const t = Math.min(1, (state.clock.elapsedTime - start.current) / 2.4)
    const e = 1 - Math.pow(1 - t, 3)
    camera.position.lerpVectors(from, to, e)
    camera.lookAt(0, 0.6, 0)
    if (t >= 1) done.current = true
  })

  return null
}

function PlacementFloor() {
  const ink = '#4a7a74'
  const faint = '#1a2e32'

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[FLOOR + 1.6, FLOOR + 1.6]} />
        <meshStandardMaterial
          color="#060e11"
          roughness={0.96}
          metalness={0.04}
        />
      </mesh>

      <Grid
        position={[0, 0.003, 0]}
        args={[FLOOR + 1, FLOOR + 1]}
        cellSize={0.4}
        cellThickness={0.4}
        cellColor={faint}
        sectionSize={1.6}
        sectionThickness={0.9}
        sectionColor="#1e4040"
        fadeDistance={18}
        fadeStrength={1.4}
        infiniteGrid={false}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-1.5, 0.009, -1.5]}>
        <ringGeometry args={[0.85, 1.1, 64]} />
        <meshBasicMaterial color="#2dd4bf" transparent opacity={0.18} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.8, 0.009, 1.8]}>
        <ringGeometry args={[0.95, 1.2, 64]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.15} />
      </mesh>

      <Line
        points={[
          [-HALF - 0.2, 0.02, -HALF - 0.2],
          [HALF + 0.2, 0.02, -HALF - 0.2],
          [HALF + 0.2, 0.02, HALF + 0.2],
          [-HALF - 0.2, 0.02, HALF + 0.2],
          [-HALF - 0.2, 0.02, -HALF - 0.2],
        ]}
        color="#2a5250"
        lineWidth={1}
        transparent
        opacity={0.4}
      />

      <Line
        points={[[-HALF, 0.03, -HALF], [HALF, 0.03, -HALF]]}
        color={ink}
        lineWidth={1.8}
        transparent
        opacity={0.9}
      />
      <Line
        points={[[-HALF, 0.03, -HALF], [-HALF, 0.03, HALF]]}
        color="#6a9a94"
        lineWidth={1.6}
        transparent
        opacity={0.8}
      />
      <Line
        points={[[-HALF, 0.03, -HALF], [-HALF, 3.2, -HALF]]}
        color="#8ab5ae"
        lineWidth={1.4}
        transparent
        opacity={0.6}
      />

      <Text
        position={[0, 0.04, -HALF - 0.35]}
        fontSize={0.16}
        color="#5a9a92"
        anchorX="center"
        anchorY="middle"
      >
        CPU %
      </Text>
      <Text
        position={[-HALF - 0.35, 0.04, 0]}
        fontSize={0.16}
        color="#5a9a92"
        anchorX="center"
        anchorY="middle"
        rotation={[0, Math.PI / 2, 0]}
      >
        GPU %
      </Text>
      <Text
        position={[-HALF - 0.35, 1.6, -HALF - 0.1]}
        fontSize={0.16}
        color="#5a9a92"
        anchorX="center"
        anchorY="middle"
      >
        Risk
      </Text>

      <Text
        position={[-2.2, 0.06, -2.2]}
        fontSize={0.13}
        color="#2dd4bf"
        anchorX="center"
        anchorY="middle"
      >
        SAFE
      </Text>
      <Text
        position={[2.4, 0.06, 2.4]}
        fontSize={0.13}
        color="#ef4444"
        anchorX="center"
        anchorY="middle"
      >
        DANGER
      </Text>
    </group>
  )
}

function ScanLine() {
  const ref = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime
    const z = -HALF + ((t * 0.15) % 1) * FLOOR
    ref.current.position.z = z
    const mat = ref.current.material as THREE.MeshBasicMaterial
    mat.opacity = 0.08 + Math.sin(t * 2) * 0.03
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
      <planeGeometry args={[FLOOR, 0.02]} />
      <meshBasicMaterial color="#2dd4bf" transparent opacity={0.06} />
    </mesh>
  )
}

function SelectMarker({
  position,
  height,
  risk,
}: {
  position: THREE.Vector3
  height: number
  risk: number
}) {
  const ring = useRef<Mesh>(null)
  const color = useMemo(() => {
    const c = new THREE.Color()
    colorForRiskPct(risk, c)
    return c
  }, [risk])

  useFrame((_, delta) => {
    if (!ring.current) return
    ring.current.rotation.z += delta * 0.8
    const s = 1 + Math.sin(performance.now() * 0.003) * 0.07
    ring.current.scale.setScalar(s)
  })

  return (
    <group position={[position.x, 0, position.z]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <torusGeometry args={[0.32, 0.014, 12, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} />
      </mesh>
      <mesh position={[0, height + 0.22, 0]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Line
        points={[[0, height + 0.06, 0], [0, height + 0.17, 0]]}
        color={color}
        lineWidth={1.4}
        transparent
        opacity={0.7}
      />
    </group>
  )
}

const FleetTowers = memo(function FleetTowers({
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
  const glow = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const pulse = useRef(0)
  const activeRef = useRef(activeId)
  activeRef.current = activeId

  const active = useMemo(
    () => machines.find((m) => m.id === activeId) ?? null,
    [machines, activeId],
  )

  useEffect(() => {
    const m = mesh.current
    if (!m) return
    machines.forEach((node, i) => {
      dummy.position.set(node.position.x, node.height / 2, node.position.z)
      const selected = activeId === node.id
      const dim = activeId != null && !selected
      const r = selected ? 0.11 : 0.085
      dummy.scale.set(r, node.height, r)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)

      colorForRiskPct(node.risk, color)
      if (dim) {
        color.multiplyScalar(0.22)
        color.offsetHSL(0, -0.12, -0.04)
      } else if (selected) {
        color.offsetHSL(0, 0.08, 0.1)
      }
      m.setColorAt(i, color)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [machines, activeId, dummy, color])

  useEffect(() => {
    const g = glow.current
    if (!g) return
    machines.forEach((node, i) => {
      dummy.position.set(node.position.x, node.height + 0.06, node.position.z)
      const isSelected = activeId === node.id
      const r = isSelected ? 0.18 : 0.14
      dummy.scale.set(r, 0.03, r)
      dummy.updateMatrix()
      g.setMatrixAt(i, dummy.matrix)

      colorForRiskPct(node.risk, color)
      const glowOpacity = node.risk >= 60 ? 0.25 : 0.08
      color.multiplyScalar(glowOpacity)
      if (activeId != null && !isSelected) color.multiplyScalar(0.15)
      g.setColorAt(i, color)
    })
    g.instanceMatrix.needsUpdate = true
    if (g.instanceColor) g.instanceColor.needsUpdate = true
  }, [machines, activeId, dummy, color])

  useFrame((_, delta) => {
    if (reduced || !mesh.current) return
    pulse.current += delta
    const breath = 1 + Math.sin(pulse.current * 1.6) * 0.05
    const m = mesh.current
    const selected = activeRef.current
    let dirty = false
    machines.forEach((node, i) => {
      if (node.risk < 65 && node.id !== selected) return
      dirty = true
      dummy.position.set(node.position.x, node.height / 2, node.position.z)
      const baseR = node.id === selected ? 0.11 : 0.085
      const r = node.risk >= 65 && node.id !== selected ? baseR * breath : baseR
      dummy.scale.set(r, node.height, r)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    if (dirty) m.instanceMatrix.needsUpdate = true
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
        onPointerOver={() => { document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { document.body.style.cursor = 'auto' }}
      >
        <cylinderGeometry args={[1, 1, 1, 20]} />
        <meshStandardMaterial
          color="#ffffff"
          roughness={0.32}
          metalness={0.22}
          emissive="#ffffff"
          emissiveIntensity={0.05}
        />
      </instancedMesh>

      <instancedMesh
        ref={glow}
        args={[undefined, undefined, machines.length]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.12} />
      </instancedMesh>

      {active ? (
        <SelectMarker
          position={active.position}
          height={active.height}
          risk={active.risk}
        />
      ) : null}
    </group>
  )
})

function AxisArrows() {
  return (
    <group>
      <mesh position={[HALF + 0.08, 0.03, -HALF]}>
        <coneGeometry args={[0.04, 0.1, 8]} />
        <meshBasicMaterial color="#4a7a74" />
      </mesh>
      <mesh position={[-HALF, 0.03, HALF + 0.08]} rotation={[0, Math.PI / 2, 0]}>
        <coneGeometry args={[0.04, 0.1, 8]} />
        <meshBasicMaterial color="#6a9a94" />
      </mesh>
      <mesh position={[-HALF, 3.3, -HALF]} rotation={[0, 0, 0]}>
        <coneGeometry args={[0.04, 0.1, 8]} />
        <meshBasicMaterial color="#8ab5ae" />
      </mesh>
    </group>
  )
}

export function FleetRiskLandscape({ reduced = false }: { reduced?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null)
  const visible = useInViewport(wrap, 0.01)
  const machines = useMemo(() => buildFleet(80), [])
  const [activeId, setActiveId] = useState<number | null>(null)
  const active = useMemo(
    () => machines.find((m) => m.id === activeId) ?? null,
    [machines, activeId],
  )

  const counts = useMemo(() => {
    let healthy = 0, watch = 0, critical = 0
    for (const m of machines) {
      const b = riskBand(m.risk)
      if (b === 'critical') critical += 1
      else if (b === 'watch') watch += 1
      else healthy += 1
    }
    return { healthy, watch, critical }
  }, [machines])

  useEffect(() => {
    return () => { document.body.style.cursor = 'auto' }
  }, [])

  const activeBand = active ? riskBand(active.risk) : null

  return (
    <div className="fleet-3d" ref={wrap}>
      <div className="fleet-3d-canvas">
        <Canvas
          dpr={[1, 1.75]}
          frameloop={visible ? 'always' : 'demand'}
          camera={{ position: [5.5, 4.2, 5.5], fov: 34, near: 0.1, far: 60 }}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
          }}
          onCreated={({ gl }) => {
            gl.setClearColor(SCENE_BG, 1)
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1.35
            gl.outputColorSpace = THREE.SRGBColorSpace
          }}
          onPointerMissed={() => setActiveId(null)}
        >
          <color attach="background" args={[SCENE_BG]} />

          <hemisphereLight args={['#d0eae6', '#0a1214', 0.6]} />
          <ambientLight intensity={0.55} />
          <directionalLight position={[6, 10, 4]} intensity={1.8} color="#f0f8f6" />
          <directionalLight position={[-5, 4, -4]} intensity={0.45} color="#a0ccc6" />
          <pointLight position={[0, 4, 0]} intensity={0.3} color="#2dd4bf" distance={12} />

          <CameraIntro reduced={reduced} />
          <PlacementFloor />
          <AxisArrows />
          {!reduced && visible && <ScanLine />}
          <FleetTowers
            machines={machines}
            reduced={reduced}
            activeId={activeId}
            onSelect={setActiveId}
          />

          <OrbitControls
            makeDefault
            enablePan={false}
            enableZoom
            minDistance={4.5}
            maxDistance={13}
            minPolarAngle={0.3}
            maxPolarAngle={Math.PI * 0.44}
            target={[0, 0.65, 0]}
            autoRotate={!reduced && activeId == null && visible}
            autoRotateSpeed={0.18}
            enableDamping
            dampingFactor={0.06}
            mouseButtons={{
              LEFT: THREE.MOUSE.ROTATE,
              MIDDLE: THREE.MOUSE.DOLLY,
              RIGHT: THREE.MOUSE.PAN,
            }}
          />
        </Canvas>

        <div className="fleet-3d-chrome" aria-hidden>
          <div className="fleet-3d-plaque">
            <span className="fleet-3d-live" />
            <div>
              <strong>Cluster Risk Landscape</strong>
              <em>Each tower = one GPU machine</em>
            </div>
          </div>

          <div className="fleet-3d-legend">
            <div className="fleet-3d-legend-title">How to read</div>
            <div className="fleet-3d-legend-row">
              <span className="fleet-3d-dot fleet-3d-dot-ok" />
              Short + teal = safe
              <b>{counts.healthy}</b>
            </div>
            <div className="fleet-3d-legend-row">
              <span className="fleet-3d-dot fleet-3d-dot-watch" />
              Medium + amber = caution
              <b>{counts.watch}</b>
            </div>
            <div className="fleet-3d-legend-row">
              <span className="fleet-3d-dot fleet-3d-dot-crit" />
              Tall + red = avoid
              <b>{counts.critical}</b>
            </div>
          </div>

          <div className="fleet-3d-readout">
            <div className="fleet-3d-readout-row">
              <span className="fleet-3d-readout-icon">↕</span>
              <span><strong>Height</strong> = failure risk</span>
            </div>
            <div className="fleet-3d-readout-row">
              <span className="fleet-3d-readout-icon">↔</span>
              <span><strong>Floor X/Z</strong> = CPU × GPU</span>
            </div>
          </div>
        </div>

        {active && activeBand ? (
          <div
            className={`fleet-3d-info fleet-3d-info-${activeBand}`}
            role="status"
          >
            <div className="fleet-3d-info-top">
              <div>
                <span className="fleet-3d-info-kicker">
                  {bandLabel(activeBand)} for next job
                </span>
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
            <p className="fleet-3d-info-verdict">{bandCopy(activeBand)}</p>
            <div className="fleet-3d-info-meter">
              <div
                className="fleet-3d-info-meter-fill"
                style={{ width: `${active.risk}%` }}
              />
              <span className="fleet-3d-info-meter-label">{active.risk.toFixed(0)}%</span>
            </div>
            <div className="fleet-3d-info-grid">
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
              Click empty space to clear · drag to orbit
            </p>
          </div>
        ) : (
          <div className="fleet-3d-hint">
            Click a tower to inspect · drag to orbit
          </div>
        )}
      </div>
    </div>
  )
}

