'use client';

import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { plumeTravelDirection } from '../scripts/plume-direction.mjs';

type SimulationSnapshot = {
  nx: number;
  ny: number;
  nz: number;
  L: number;
  W: number;
  Z: number;
  threshold: number;
  day: number;
  profile: string;
  field: number[];
  solution: number;
  sourceX0: number;
  sourceX1: number;
  sourceY0: number;
  sourceY1: number;
  sourceZ0: number;
  sourceZ1: number;
  sourceMode: string;
  sourceClose: number | null;
};

type SoilSceneProps = { snapshot: SimulationSnapshot | null };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function shellGeometry(snapshot: SimulationSnapshot, iso: number) {
  const { nx, ny, nz, L, W, Z, field } = snapshot;
  const positions: number[] = [];
  const indices: number[] = [];
  const vertices = new Map<number, number>();
  const tetrahedra = [
    [0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6],
    [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]
  ];
  const tetraEdges = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
  const gridIndex = (x: number, y: number, z: number) => (z * ny + y) * nx + x;
  const worldPosition = (x: number, y: number, z: number): [number, number, number] => {
    const worldX = -2.2 + ((x + 0.5) / nx) * 4.4;
    const worldZ = ((y + 0.5) / ny - 0.5) * 2.8;
    const depth = ((z + 0.5) / nz) * Z;
    return [worldX, surfaceHeight(worldX, worldZ) - (depth / Z) * 2.4, worldZ];
  };
  const edgeVertex = (first: number, second: number, firstValue: number, secondValue: number, a: [number, number, number], b: [number, number, number]) => {
    const low = Math.min(first, second), high = Math.max(first, second);
    const key = low * field.length + high;
    const existing = vertices.get(key);
    if (existing !== undefined) return existing;
    const fraction = clamp((iso - firstValue) / (secondValue - firstValue), 0, 1);
    const vertexIndex = positions.length / 3;
    positions.push(
      a[0] + (b[0] - a[0]) * fraction,
      a[1] + (b[1] - a[1]) * fraction,
      a[2] + (b[2] - a[2]) * fraction
    );
    vertices.set(key, vertexIndex);
    return vertexIndex;
  };

  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    const corners = [
      [x, y, z], [x + 1, y, z], [x + 1, y + 1, z], [x, y + 1, z],
      [x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]
    ] as const;
    const cornerValues = corners.map(([cx, cy, cz]) => field[gridIndex(cx, cy, cz)]);
    if (Math.max(...cornerValues) < iso || Math.min(...cornerValues) >= iso) continue;
    const cornerIndices = corners.map(([cx, cy, cz]) => gridIndex(cx, cy, cz));
    const cornerPositions = corners.map(([cx, cy, cz]) => worldPosition(cx, cy, cz));

    for (const tetrahedron of tetrahedra) {
      const inside = tetrahedron.filter((corner) => cornerValues[corner] >= iso);
      const outside = tetrahedron.filter((corner) => cornerValues[corner] < iso);
      if (!inside.length || !outside.length) continue;
      const intersections = tetraEdges.flatMap(([edgeA, edgeB]) => {
        const a = tetrahedron[edgeA], b = tetrahedron[edgeB];
        if ((cornerValues[a] >= iso) === (cornerValues[b] >= iso)) return [];
        return [edgeVertex(cornerIndices[a], cornerIndices[b], cornerValues[a], cornerValues[b], cornerPositions[a], cornerPositions[b])];
      });
      if (intersections.length < 3) continue;
      const insideCenter = new THREE.Vector3();
      const outsideCenter = new THREE.Vector3();
      inside.forEach((corner) => insideCenter.add(new THREE.Vector3(...cornerPositions[corner])));
      outside.forEach((corner) => outsideCenter.add(new THREE.Vector3(...cornerPositions[corner])));
      insideCenter.multiplyScalar(1 / inside.length);
      outsideCenter.multiplyScalar(1 / outside.length);
      const normal = outsideCenter.sub(insideCenter).normalize();
      const axis = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const tangent = axis.cross(normal).normalize();
      const bitangent = normal.clone().cross(tangent).normalize();
      const center = new THREE.Vector3();
      intersections.forEach((index) => center.add(new THREE.Vector3(
        positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]
      )));
      center.multiplyScalar(1 / intersections.length);
      intersections.sort((first, second) => {
        const angle = (index: number) => {
          const point = new THREE.Vector3(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]).sub(center);
          return Math.atan2(point.dot(bitangent), point.dot(tangent));
        };
        return angle(first) - angle(second);
      });
      for (let index = 1; index < intersections.length - 1; index++) {
        const a = intersections[0], b = intersections[index], c = intersections[index + 1];
        const ab = new THREE.Vector3(
          positions[b * 3] - positions[a * 3], positions[b * 3 + 1] - positions[a * 3 + 1], positions[b * 3 + 2] - positions[a * 3 + 2]
        );
        const ac = new THREE.Vector3(
          positions[c * 3] - positions[a * 3], positions[c * 3 + 1] - positions[a * 3 + 1], positions[c * 3 + 2] - positions[a * 3 + 2]
        );
        if (ab.cross(ac).dot(normal) >= 0) indices.push(a, b, c);
        else indices.push(a, c, b);
      }
    }
  }
  if (!indices.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function Particles() {
  const points = useMemo(() => {
    const positions = new Float32Array(110 * 3);
    let seed = 91;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 110; i++) {
      positions[i * 3] = (random() - 0.5) * 14;
      positions[i * 3 + 1] = (random() - 0.5) * 8;
      positions[i * 3 + 2] = -2 - random() * 5;
    }
    return positions;
  }, []);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[points, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#56bfd5" size={0.022} transparent opacity={0.55} sizeAttenuation />
    </points>
  );
}

function surfaceHeight(x: number, z: number) {
  return 1.15 + 0.075 * Math.sin(x * 1.55) + 0.045 * Math.cos(z * 3.1 + x * 0.7) +
    0.022 * Math.sin(x * 4 + z * 3);
}

function PlumeVolume({ snapshot }: SoilSceneProps) {
  const plumeCells = useMemo(() => {
    if (!snapshot) return [] as Array<{ position: [number, number, number]; scale: [number, number, number]; color: [number, number, number]; opacity: number }>;
    const { nx, ny, nz, L, W, Z, field, threshold } = snapshot;
    const maximum = field.reduce((peak, value) => Math.max(peak, value), 0);
    if (!(maximum > threshold)) return [];
    const activeCells: Array<{ position: [number, number, number]; scale: [number, number, number]; color: [number, number, number]; opacity: number }> = [];

    for (let z = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          const value = field[snapshotIndex(snapshot, x, y, z)];
          if (value < threshold) continue;
          const worldX = -2.2 + ((x + 0.5) / nx) * 4.4;
          const worldZ = -1.4 + ((y + 0.5) / ny) * 2.8;
          const depth = (((z + 0.5) / nz) * Z);
          const yPosition = surfaceHeight(worldX, worldZ) - (depth / Z) * 2.4;
          const intensity = clamp(value / maximum, 0.12, 1);
          const scale = 0.1 + intensity * 0.22;
          const color = concentrationColor(value, maximum) as [number, number, number];
          activeCells.push({
            position: [worldX, yPosition + 0.02, worldZ] as [number, number, number],
            scale: [scale, scale * (0.8 + intensity * 1.8), scale * (0.9 + intensity * 1.2)] as [number, number, number],
            color,
            opacity: 0.18 + intensity * 0.54
          });
        }
      }
    }

    return activeCells.slice(0, 1800);
  }, [snapshot]);

  if (!plumeCells.length) return null;

  return (
    <group renderOrder={11}>
      {plumeCells.map((cell, index) => (
        <mesh key={`plume-cell-${index}`} position={cell.position} scale={cell.scale}>
          <boxGeometry args={[1, 1, 1]} />
          <meshPhysicalMaterial
            color={new THREE.Color(...cell.color)}
            emissive={new THREE.Color(...cell.color)}
            transparent
            opacity={cell.opacity}
            roughness={0.12}
            metalness={0.24}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function ContaminantTruck({ snapshot }: SoilSceneProps) {
  const truck = useRef<THREE.Group>(null);
  const droplets = useRef<Array<THREE.Mesh | null>>([]);
  const [reducedMotion, setReducedMotion] = useState(false);
  const sourceX = snapshot ? ((snapshot.sourceX0 + snapshot.sourceX1) / (2 * snapshot.L)) * 4.4 - 2.2 : 0.25;
  const sourceZ = snapshot ? (((snapshot.sourceY0 + snapshot.sourceY1) / (2 * snapshot.W)) - 0.5) * 2.8 : 0;
  const truckGltf = useLoader(GLTFLoader, `${publicBasePath}/models/cargo-truck.glb`);
  const truckModel = useMemo(() => truckGltf.scene.clone(true), [truckGltf.scene]);
  const truckBounds = useMemo(() => new THREE.Box3().setFromObject(truckModel), [truckModel]);
  const truckScale = 0.84;
  const travelDirection = useMemo(() => plumeTravelDirection(snapshot), [snapshot]);
  const heading = travelDirection > 0 ? 0 : Math.PI;
  const directionSign = Math.cos(heading);
  const localMinX = heading === Math.PI ? -truckBounds.max.x : truckBounds.min.x;
  const localMaxX = heading === Math.PI ? -truckBounds.min.x : truckBounds.max.x;
  const minParkX = -2.2 - localMinX * truckScale;
  const maxParkX = 2.2 - localMaxX * truckScale;
  const truckParkX = clamp(sourceX - directionSign * 0.25 * truckScale, minParkX, maxParkX);
  const truckStartRoom = travelDirection > 0 ? truckParkX - minParkX : maxParkX - truckParkX;
  const truckStartX = truckParkX - travelDirection * Math.min(0.6, truckStartRoom);
  const halfWidth = Math.max(Math.abs(truckBounds.min.z), Math.abs(truckBounds.max.z)) * truckScale;
  const truckParkZ = clamp(sourceZ, -1.4 + halfWidth, 1.4 - halfWidth);
  const spillPointX = 0.18;
  const spillPointZ = clamp((sourceZ - truckParkZ) * 0.72 + 0.28, -0.65, 0.65);
  const surfaceY = surfaceHeight(truckParkX, truckParkZ);
  const surfaceConcentration = useMemo(() => {
    if (!snapshot || snapshot.sourceZ0 > snapshot.Z / snapshot.nz) return 0;
    const x0 = Math.max(0, Math.floor(snapshot.sourceX0 / snapshot.L * snapshot.nx));
    const x1 = Math.min(snapshot.nx - 1, Math.ceil(snapshot.sourceX1 / snapshot.L * snapshot.nx) - 1);
    const y0 = Math.max(0, Math.floor(snapshot.sourceY0 / snapshot.W * snapshot.ny));
    const y1 = Math.min(snapshot.ny - 1, Math.ceil(snapshot.sourceY1 / snapshot.W * snapshot.ny) - 1);
    let maximum = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      maximum = Math.max(maximum, snapshot.field[(y * snapshot.nx) + x]);
    }
    return maximum;
  }, [snapshot]);
  const hasSurfaceSource = surfaceConcentration > 0;
  const sourceIdentity = snapshot?.solution ?? 'preview';

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!truck.current) return;
    gsap.killTweensOf(truck.current.position);
    if (reducedMotion) {
      truck.current.position.x = truckParkX;
      return;
    }
    truck.current.position.x = truckStartX;
    gsap.to(truck.current.position, {
      x: truckParkX,
      duration: 2.3,
      delay: 0.35,
      ease: 'power3.inOut'
    });
    return () => { if (truck.current) gsap.killTweensOf(truck.current.position); };
  }, [sourceIdentity, reducedMotion, truckParkX, truckStartX]);

  useFrame(({ clock }) => {
    const sourceActive = snapshot?.sourceMode === 'continuous' &&
      (snapshot.sourceClose === null || snapshot.day <= snapshot.sourceClose);
    const dropletsActive = hasSurfaceSource &&
      (snapshot?.sourceMode === 'pulse'
        ? snapshot.day >= 0
        : sourceActive);
    const phase = clock.elapsedTime * 1.7;
    droplets.current.forEach((drop, index) => {
      if (!drop) return;
      const progress = (phase + index * 0.27) % 1;
      drop.visible = Boolean(dropletsActive && progress < 0.9);
      drop.position.set(spillPointX + 0.07 * travelDirection, 0.14 - progress * 0.17, spillPointZ + Math.sin(index * 4.8) * 0.04);
      drop.scale.setScalar(1 - progress * 0.38);
    });
  });

  return (
    <group ref={truck} position={[truckStartX, surfaceY - 0.018 * truckScale, truckParkZ]} rotation={[0, heading, 0]} scale={truckScale}>
      <primitive object={truckModel} />
      <mesh position={[spillPointX, 0.14, spillPointZ]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.42, 14]} />
        <meshStandardMaterial color="#1a1f20" emissive="#0d5181" emissiveIntensity={0.7} roughness={0.1} metalness={0.28} />
      </mesh>
      {Array.from({ length: 8 }, (_, index) => (
        <mesh
          key={`drop-${index}`}
          ref={(element) => { droplets.current[index] = element; }}
          visible={false}
          position={[spillPointX + 0.1 * travelDirection, 0.1, spillPointZ]}
        >
          <sphereGeometry args={[0.03, 12, 10]} />
          <meshStandardMaterial color="#0f3d5a" emissive="#47d6fa" emissiveIntensity={0.9} roughness={0.32} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

function SpillMarker({ snapshot }: SoilSceneProps) {
  const surfaceConcentration = useMemo(() => {
    if (!snapshot || snapshot.sourceZ0 > snapshot.Z / snapshot.nz) return 0;
    const x0 = Math.max(0, Math.floor(snapshot.sourceX0 / snapshot.L * snapshot.nx));
    const x1 = Math.min(snapshot.nx - 1, Math.ceil(snapshot.sourceX1 / snapshot.L * snapshot.nx) - 1);
    const y0 = Math.max(0, Math.floor(snapshot.sourceY0 / snapshot.W * snapshot.ny));
    const y1 = Math.min(snapshot.ny - 1, Math.ceil(snapshot.sourceY1 / snapshot.W * snapshot.ny) - 1);
    let maximum = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      maximum = Math.max(maximum, snapshot.field[(y * snapshot.nx) + x]);
    }
    return maximum;
  }, [snapshot]);
  if (!snapshot || !(surfaceConcentration > 0)) return null;

  const x = ((snapshot.sourceX0 + snapshot.sourceX1) / (2 * snapshot.L)) * 4.4 - 2.2;
  const z = (((snapshot.sourceY0 + snapshot.sourceY1) / (2 * snapshot.W)) - 0.5) * 2.8;
  const depth = (snapshot.sourceZ0 / snapshot.Z) * 2.4;
  const radiusX = clamp((snapshot.sourceX1 - snapshot.sourceX0) / snapshot.L * 4.4 * 0.7, 0.11, 0.7);
  const radiusZ = clamp((snapshot.sourceY1 - snapshot.sourceY0) / snapshot.W * 2.8 * 0.72, 0.1, 0.55);

  return (
    <mesh position={[x, surfaceHeight(x, z) - depth + 0.004, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[radiusX, radiusZ, 1]} renderOrder={5}>
      <circleGeometry args={[0.5, 48]} />
      <meshBasicMaterial color="#080d0d" transparent opacity={0.92} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

const concentrationRamp: Array<[number, [number, number, number]]> = [
  [0, [47, 75, 66]], [0.18, [92, 119, 76]], [0.36, [154, 151, 70]],
  [0.54, [205, 166, 79]], [0.72, [216, 128, 75]], [0.88, [194, 82, 64]], [1, [119, 47, 48]]
];

function concentrationColor(concentration: number, maximum: number) {
  const value = clamp(Math.log1p(9 * concentration / maximum) / Math.LN10, 0, 1);
  let index = 0;
  while (index < concentrationRamp.length - 2 && value > concentrationRamp[index + 1][0]) index++;
  const [leftStop, leftColor] = concentrationRamp[index];
  const [rightStop, rightColor] = concentrationRamp[index + 1];
  const fraction = (value - leftStop) / (rightStop - leftStop);
  return leftColor.map((color, component) => (color + (rightColor[component] - color) * fraction) / 255);
}

function concentrationSection(snapshot: SimulationSnapshot, section: 'ground' | 'longitudinal' | 'transverse' | 'horizontal') {
  const { nx, ny, nz, L, W, Z, threshold, field } = snapshot;
  const maximum = field.reduce((peak, value) => Math.max(peak, value), 0);
  if (!(maximum > 0)) return null;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const pushCell = (value: number, points: Array<[number, number, number]>) => {
    if (value < threshold) return;
    const color = concentrationColor(value, maximum);
    const alpha = clamp(0.58 + (value / maximum) * 0.3, 0.58, 0.88);
    const offset = positions.length / 3;
    for (const point of points) {
      positions.push(...point);
      colors.push(color[0], color[1], color[2], alpha);
    }
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  };

  if (section === 'ground') {
    const depthIndex = clamp(Math.floor(((snapshot.sourceZ0 + snapshot.sourceZ1) / (2 * Z)) * nz), 0, nz - 1);
    const depth = ((depthIndex + 0.5) / nz) * Z;
    for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) {
      const value = field[snapshotIndex(snapshot, x, y, depthIndex)];
      const x0 = -2.2 + x / nx * 4.4, x1 = -2.2 + (x + 1) / nx * 4.4;
      const z0 = -1.4 + y / ny * 2.8, z1 = -1.4 + (y + 1) / ny * 2.8;
      pushCell(value, [
        [x0, surfaceHeight(x0,z0)-depth+0.014, z0],
        [x1, surfaceHeight(x1,z0)-depth+0.014, z0],
        [x1, surfaceHeight(x1,z1)-depth+0.014, z1],
        [x0, surfaceHeight(x0,z1)-depth+0.014, z1]
      ]);
    }
  } else if (section === 'longitudinal') {
    const ySlice = clamp(Math.floor(((snapshot.sourceY0 + snapshot.sourceY1) / (2 * W)) * ny), 0, ny - 1);
    const worldZ = ((ySlice + 0.5) / ny - 0.5) * 2.8;
    for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) {
      const value = field[snapshotIndex(snapshot, x, ySlice, z)];
      const x0 = -2.2 + x / nx * 4.4, x1 = -2.2 + (x + 1) / nx * 4.4;
      const depth0 = z / nz * 2.4, depth1 = (z + 1) / nz * 2.4;
      pushCell(value, [
        [x0, surfaceHeight(x0,worldZ)-depth0+0.014, worldZ],
        [x1, surfaceHeight(x1,worldZ)-depth0+0.014, worldZ],
        [x1, surfaceHeight(x1,worldZ)-depth1+0.014, worldZ],
        [x0, surfaceHeight(x0,worldZ)-depth1+0.014, worldZ]
      ]);
    }
  } else if (section === 'transverse') {
    const xSlice = clamp(Math.floor(((snapshot.sourceX0 + snapshot.sourceX1) / (2 * L)) * nx), 0, nx - 1);
    const worldX = -2.2 + ((xSlice + 0.5) / nx) * 4.4;
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
      const value = field[snapshotIndex(snapshot, xSlice, y, z)];
      const worldZ0 = -1.4 + y / ny * 2.8, worldZ1 = -1.4 + (y + 1) / ny * 2.8;
      const depth0 = z / nz * 2.4, depth1 = (z + 1) / nz * 2.4;
      pushCell(value, [
        [worldX, surfaceHeight(worldX,worldZ0)-depth0+0.014, worldZ0],
        [worldX, surfaceHeight(worldX,worldZ1)-depth0+0.014, worldZ1],
        [worldX, surfaceHeight(worldX,worldZ1)-depth1+0.014, worldZ1],
        [worldX, surfaceHeight(worldX,worldZ0)-depth1+0.014, worldZ0]
      ]);
    }
  }

  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function snapshotIndex(snapshot: SimulationSnapshot, x: number, y: number, z: number) {
  return (z * snapshot.ny + y) * snapshot.nx + x;
}

function FieldCutaway({ snapshot }: SoilSceneProps) {
  const ground = useMemo(() => snapshot && concentrationSection(snapshot, 'ground'), [snapshot]);
  const longitudinal = useMemo(() => snapshot && concentrationSection(snapshot, 'longitudinal'), [snapshot]);
  const transverse = useMemo(() => snapshot && concentrationSection(snapshot, 'transverse'), [snapshot]);
  useEffect(() => () => {
    ground?.dispose();
    longitudinal?.dispose();
    transverse?.dispose();
  }, [ground, longitudinal, transverse]);

  return (
    <group renderOrder={8}>
      {[ground, longitudinal, transverse].map((geometry, index) => geometry && (
        <mesh key={index} geometry={geometry} renderOrder={8 + index}>
          <meshBasicMaterial
            vertexColors
            transparent
            depthWrite={false}
            depthTest={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function GroundModel({ snapshot, rotationGroup }: SoilSceneProps & { rotationGroup: MutableRefObject<THREE.Group | null> }) {
  const gltf = useLoader(GLTFLoader, `${publicBasePath}/models/soil-cutaway.glb`);
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const shellLevels = useMemo(() => {
    if (!snapshot) return [];
    const max = snapshot.field.reduce((peak, value) => Math.max(peak, value), 0);
    if (!(max > 0)) return [];
    return [
      Math.max(snapshot.threshold, max * 0.035),
      Math.max(snapshot.threshold, max * 0.18),
      Math.max(snapshot.threshold, max * 0.48)
    ].filter((level, index, levels) => level <= max && levels.indexOf(level) === index);
  }, [snapshot]);
  const shells = useMemo(() => shellLevels.map((level) => shellGeometry(snapshot!, level)), [shellLevels, snapshot]);
  const { camera } = useThree();
  const initialCamera = useRef(false);

  useEffect(() => {
    if (initialCamera.current) return;
    camera.position.set(3.4, 3.3, 7.2);
    camera.lookAt(0, -0.2, 0);
    initialCamera.current = true;
  }, [camera]);

  useEffect(() => () => shells.forEach((geometry) => geometry?.dispose()), [shells]);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const layers = model.children.filter((child) => child.name.startsWith('Estrato'));
      const baseY = layers.map((layer) => layer.position.y);
      const trigger = ScrollTrigger.create({
        trigger: '#hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 0.8,
        onUpdate: (self) => {
          layers.forEach((layer, index) => {
            layer.position.y = baseY[index] + self.progress * (index - (layers.length - 1) / 2) * 0.075;
          });
        }
      });
      return () => {
        trigger.kill();
        layers.forEach((layer, index) => { layer.position.y = baseY[index]; });
      };
    });
    return () => media.revert();
  }, [model]);

  return (
    <group ref={rotationGroup} scale={0.88}>
      <primitive object={model} />
      {shells.map((geometry, index) => geometry && (
        <mesh key={`${snapshot?.day}-${index}`} geometry={geometry} renderOrder={index + 1}>
          <meshPhysicalMaterial
            color={index === 0 ? '#79ebf5' : index === 1 ? '#38c8da' : '#209bb9'}
            transparent
            opacity={0.28 + index * 0.1}
            roughness={0.24}
            metalness={0.03}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
      <FieldCutaway snapshot={snapshot} />
      <PlumeVolume snapshot={snapshot} />
      <ContaminantTruck snapshot={snapshot} />
      <SpillMarker snapshot={snapshot} />
    </group>
  );
}

function RotatingStage({ snapshot }: SoilSceneProps) {
  const group = useRef<THREE.Group | null>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; yaw: number; pitch: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; radius: number } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const rotation = useRef({ yaw: -0.32, pitch: 0.12 });
  const scrollPose = useRef({ yaw: 0, pitch: 0 });
  const focus = useRef(new THREE.Vector3(0, -0.1, 0));
  const { gl, camera } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const keyboardTarget = canvas.parentElement ?? canvas;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const offset = camera.position.clone().sub(focus.current);
      const radius = clamp(offset.length() * (event.deltaY < 0 ? 0.9 : 1.1), 3.8, 10);
      camera.position.copy(focus.current).add(offset.setLength(radius));
    };
    const handleKey = (event: KeyboardEvent) => {
      const direction: Record<string, [number, number]> = {
        ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0],
        ArrowUp: [0, -0.08], ArrowDown: [0, 0.08]
      };
      if (direction[event.key]) {
        event.preventDefault();
        rotation.current.yaw += direction[event.key][0];
        rotation.current.pitch = clamp(rotation.current.pitch + direction[event.key][1], -0.55, 0.75);
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        const offset = camera.position.clone().sub(focus.current);
        camera.position.copy(focus.current).add(offset.setLength(clamp(offset.length() * 0.9, 3.8, 10)));
      } else if (event.key === '-') {
        event.preventDefault();
        const offset = camera.position.clone().sub(focus.current);
        camera.position.copy(focus.current).add(offset.setLength(clamp(offset.length() * 1.1, 3.8, 10)));
      }
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    keyboardTarget.addEventListener('keydown', handleKey);
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      keyboardTarget.removeEventListener('keydown', handleKey);
    };
  }, [camera, gl]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: '#hero',
          start: 'top top',
          end: 'bottom top',
          scrub: 0.8
        }
      });
      timeline
        .to(camera.position, { x: 3.45, y: 3.55, z: 7.3, ease: 'none' }, 0)
        .to(focus.current, { x: 0.14, y: -0.24, z: 0, ease: 'none' }, 0)
        .to(scrollPose.current, { yaw: 0.1, pitch: 0.15, ease: 'none' }, 0);
      return () => timeline.kill();
    });
    return () => media.revert();
  }, [camera]);

  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.rotation.y = rotation.current.yaw + scrollPose.current.yaw;
    group.current.rotation.x = rotation.current.pitch + scrollPose.current.pitch;
    camera.lookAt(focus.current);
    if (!reducedMotion && !drag.current) {
      rotation.current.yaw += delta * 0.035;
    }
  });

  return (
    <group
      onPointerDown={(event) => {
        event.stopPropagation();
        const pointerId = event.nativeEvent.pointerId;
        const point = { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY };
        pointers.current.set(pointerId, point);
        gl.domElement.setPointerCapture(event.pointerId);
        if (pointers.current.size === 1) {
          drag.current = { pointerId, ...point, ...rotation.current };
        } else if (pointers.current.size === 2) {
          const [first, second] = [...pointers.current.values()];
          pinch.current = {
            distance: Math.hypot(first.x - second.x, first.y - second.y),
            radius: camera.position.distanceTo(focus.current)
          };
          drag.current = null;
        }
      }}
      onPointerMove={(event) => {
        const pointerId = event.nativeEvent.pointerId;
        if (!pointers.current.has(pointerId)) return;
        pointers.current.set(pointerId, { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY });
        if (pointers.current.size >= 2 && pinch.current) {
          const [first, second] = [...pointers.current.values()];
          const distance = Math.hypot(first.x - second.x, first.y - second.y);
          const offset = camera.position.clone().sub(focus.current);
          camera.position.copy(focus.current).add(offset.setLength(clamp(pinch.current.radius * pinch.current.distance / Math.max(1, distance), 3.8, 10)));
          return;
        }
        if (!drag.current || drag.current.pointerId !== pointerId) return;
        rotation.current = {
          yaw: drag.current.yaw + (event.nativeEvent.clientX - drag.current.x) * 0.008,
          pitch: clamp(drag.current.pitch + (event.nativeEvent.clientY - drag.current.y) * 0.006, -0.55, 0.75)
        };
      }}
      onPointerUp={(event) => {
        pointers.current.delete(event.nativeEvent.pointerId);
        pinch.current = null;
        const remaining = [...pointers.current.entries()][0];
        drag.current = remaining ? {
          pointerId: remaining[0],
          ...remaining[1],
          ...rotation.current
        } : null;
        if (gl.domElement.hasPointerCapture(event.pointerId)) gl.domElement.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => {
        pointers.current.delete(event.nativeEvent.pointerId);
        pinch.current = null;
        drag.current = null;
      }}
    >
      <GroundModel snapshot={snapshot} rotationGroup={group} />
    </group>
  );
}

export default function SoilScene({ snapshot }: SoilSceneProps) {
  return (
    <Canvas
      camera={{ position: [3.4, 3.3, 7.2], fov: 34 }}
      dpr={[1, 1.6]}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      tabIndex={0}
      role="application"
      aria-label="Escena 3D del corte de suelo. Usa las flechas para orbitar, más o menos para acercar, arrastra o pellizca la escena."
      onCreated={({ gl }) => {
        gl.setClearColor('#07121b', 0);
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <ambientLight intensity={1.25} />
      <directionalLight position={[5, 7, 5]} intensity={2.1} color="#d8f4f5" />
      <pointLight position={[-4, 1, 2]} intensity={18} color="#41c7e6" distance={12} />
      <pointLight position={[2, -2, -4]} intensity={8} color="#e1ad5c" distance={10} />
      <Particles />
      <RotatingStage snapshot={snapshot} />
    </Canvas>
  );
}
