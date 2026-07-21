import { Canvas, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Mesh } from 'three'
import { useInViewport } from '../../hooks/useInViewport'

function Ring({
  reduced,
  radius,
  speed,
  color,
}: {
  reduced: boolean
  radius: number
  speed: number
  color: string
}) {
  const ref = useRef<Mesh>(null)
  useFrame((_, d) => {
    if (reduced || !ref.current) return
    ref.current.rotation.z += d * speed
    ref.current.rotation.x = 0.55
  })
  return (
    <mesh ref={ref}>
      <torusGeometry args={[radius, 0.02, 12, 72]} />
      <meshPhysicalMaterial
        color={color}
        transparent
        opacity={0.6}
        metalness={0.45}
        roughness={0.25}
        clearcoat={0.5}
      />
    </mesh>
  )
}

function Core({ reduced }: { reduced: boolean }) {
  const ref = useRef<Mesh>(null)
  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.elapsedTime
    ref.current.scale.setScalar(reduced ? 1 : 1 + Math.sin(t * 2.2) * 0.07)
    ref.current.rotation.y = t * 0.35
  })
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[0.34, 0]} />
      <meshPhysicalMaterial
        color="#2a9d8f"
        flatShading
        metalness={0.4}
        roughness={0.32}
        clearcoat={0.4}
        emissive="#0f766e"
        emissiveIntensity={0.25}
      />
    </mesh>
  )
}

export function PulseCoreMini({ reduced = false }: { reduced?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null)
  const visible = useInViewport(wrap)

  return (
    <div className="pulse-core-mini" aria-hidden ref={wrap}>
      <Canvas
        dpr={[1, 1.5]}
        frameloop={visible ? 'always' : 'never'}
        camera={{ position: [0, 0, 2.4], fov: 40 }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[2, 3, 2]} intensity={1.05} />
        <pointLight position={[0, 0, 1.2]} intensity={0.4} color="#5eead4" />
        <Core reduced={reduced} />
        <Ring reduced={reduced} radius={0.55} speed={0.55} color="#2a9d8f" />
        <Ring reduced={reduced} radius={0.78} speed={-0.32} color="#c44b3c" />
      </Canvas>
    </div>
  )
}

