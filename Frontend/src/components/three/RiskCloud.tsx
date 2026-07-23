import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Group, InstancedMesh } from 'three'
import { colorForRiskPct } from './riskColors'

export type RiskPoint = {
  id: number
  risk: number
  x: number
  y: number
  z: number
  meta?: Record<string, string | number>
}

type Props = {
  points: RiskPoint[]
  reduced?: boolean
  rotate?: boolean
  onHover?: (id: number | null) => void
  onSelect?: (id: number) => void
  highlighted?: number | null
  showBeams?: boolean
  maxBeams?: number
  pointScale?: number
}

export function RiskCloud({
  points,
  reduced = false,
  rotate = true,
  onHover,
  onSelect,
  highlighted = null,
  showBeams = false,
  maxBeams = 8,
  pointScale = 1,
}: Props) {
  const group = useRef<Group>(null)
  const mesh = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const pulse = useRef(0)

  const beams = useMemo(() => {
    if (!showBeams) return [] as [THREE.Vector3, THREE.Vector3][]
    const critical = [...points]
      .filter((p) => p.risk >= 70)
      .sort((a, b) => b.risk - a.risk)
      .slice(0, maxBeams)
    const edges: [THREE.Vector3, THREE.Vector3][] = []
    for (let i = 0; i < critical.length; i++) {
      for (let j = i + 1; j < critical.length; j++) {
        const a = critical[i]
        const b = critical[j]
        edges.push([
          new THREE.Vector3(a.x, a.y, a.z),
          new THREE.Vector3(b.x, b.y, b.z),
        ])
      }
    }
    return edges.slice(0, maxBeams)
  }, [points, showBeams, maxBeams])

  useEffect(() => {
    const m = mesh.current
    if (!m) return
    points.forEach((node, i) => {
      dummy.position.set(node.x, node.y, node.z)
      const s = (0.1 + node.risk / 650) * pointScale
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, colorForRiskPct(node.risk, color))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [points, dummy, color, pointScale])

  useFrame((_, delta) => {
    if (!reduced && rotate && group.current && highlighted == null) {
      group.current.rotation.y += delta * 0.1
    }
    if (reduced || !mesh.current || !showBeams) return
    pulse.current += delta
    const m = mesh.current
    const t = 1 + Math.sin(pulse.current * 2.4) * 0.08
    points.forEach((node, i) => {
      if (node.risk < 70 && node.id !== highlighted) return
      dummy.position.set(node.x, node.y, node.z)
      const base = (0.1 + node.risk / 650) * pointScale
      const boost = node.id === highlighted ? 1.35 : node.risk >= 70 ? t : 1
      dummy.scale.setScalar(base * boost)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })

  if (!points.length) return null

  return (
    <group ref={group}>
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, points.length]}
        onPointerMove={(e) => {
          e.stopPropagation()
          const id = e.instanceId
          if (id == null) return
          onHover?.(points[id]?.id ?? null)
        }}
        onPointerOut={() => onHover?.(null)}
        onClick={(e) => {
          e.stopPropagation()
          const id = e.instanceId
          if (id == null) return
          const pt = points[id]
          if (pt) onSelect?.(pt.id)
        }}
      >
        <sphereGeometry args={[1, 18, 18]} />
        <meshStandardMaterial
          roughness={0.28}
          metalness={0.25}
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
          opacity={0.35}
        />
      ))}
    </group>
  )
}
