import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Line, Sparkles } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Group, InstancedMesh } from 'three'
import { colorForRisk01 } from '../three/riskColors'
import { useInViewport } from '../three/useInViewport'

type NodePt = {
  position: THREE.Vector3
  risk: number
  scale: number
}

function seeded(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function buildNodes(count: number): NodePt[] {
  const nodes: NodePt[] = []
  for (let i = 0; i < count; i++) {
    const u = seeded(i)
    const v = seeded(i + 17)
    const w = seeded(i + 41)
    const theta = u * Math.PI * 2
    const phi = Math.acos(2 * v - 1)
    const r = 1.55 + w * 1.85
    const risk = seeded(i + 99)
    nodes.push({
      position: new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi) * 0.85,
        r * Math.sin(phi) * Math.sin(theta),
      ),
      risk,
      scale: 0.075 + risk * 0.09,
    })
  }
  return nodes
}

function ClusterMesh({ reduced }: { reduced: boolean }) {
  const group = useRef<Group>(null)
  const mesh = useRef<InstancedMesh>(null)
  const nodes = useMemo(() => buildNodes(72), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])

  const links = useMemo(() => {
    const edges: [THREE.Vector3, THREE.Vector3][] = []
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[i].position.distanceToSquared(nodes[j].position) < 1.2) {
          edges.push([nodes[i].position, nodes[j].position])
        }
      }
    }
    return edges.slice(0, 80)
  }, [nodes])

  useEffect(() => {
    const m = mesh.current
    if (!m) return
    nodes.forEach((n, i) => {
      dummy.position.copy(n.position)
      dummy.scale.setScalar(n.scale)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, colorForRisk01(n.risk, color))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [nodes, dummy, color])

  useFrame((_, delta) => {
    if (reduced || !group.current) return
    group.current.rotation.y += delta * 0.09
    group.current.rotation.x = Math.sin(performance.now() * 0.00015) * 0.1
  })

  return (
    <group ref={group}>
      <instancedMesh ref={mesh} args={[undefined, undefined, nodes.length]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshPhysicalMaterial
          roughness={0.25}
          metalness={0.4}
          clearcoat={0.4}
          toneMapped={false}
        />
      </instancedMesh>

      {links.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color="#2dd4bf"
          lineWidth={1}
          transparent
          opacity={0.2}
        />
      ))}

      {!reduced ? (
        <Sparkles
          count={28}
          scale={6}
          size={1.6}
          speed={0.35}
          opacity={0.35}
          color="#5eead4"
        />
      ) : null}

      <Float
        speed={reduced ? 0 : 1.05}
        rotationIntensity={0.1}
        floatIntensity={0.3}
      >
        <mesh>
          <icosahedronGeometry args={[0.58, 1]} />
          <meshStandardMaterial
            color="#14b8a6"
            wireframe
            transparent
            opacity={0.32}
          />
        </mesh>
      </Float>
    </group>
  )
}

export function HeroClusterScene({ reduced = false }: { reduced?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null)
  const visible = useInViewport(wrap)

  return (
    <div className="hero-3d" aria-hidden ref={wrap}>
      <Canvas
        dpr={[1, 1.6]}
        frameloop={visible ? 'always' : 'never'}
        camera={{ position: [0, 0.35, 6.1], fov: 42 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[4, 6, 2]} intensity={1.25} color="#e8fffa" />
        <directionalLight position={[-3, -2, -4]} intensity={0.45} color="#fecaca" />
        <ClusterMesh reduced={reduced} />
      </Canvas>
      <div className="hero-3d-fade" />
    </div>
  )
}
