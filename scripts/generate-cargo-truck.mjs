import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const materials = [
  { name: 'Cabina rojo escarlata', color: [0.72, 0.035, 0.025, 1], metal: 0.24, rough: 0.36 },
  { name: 'Cisterna de acero inoxidable', color: [0.34, 0.41, 0.4, 1], metal: 0.76, rough: 0.28 },
  { name: 'Neumático', color: [0.055, 0.063, 0.059, 1], metal: 0, rough: 0.92 },
  { name: 'Acero inoxidable', color: [0.45, 0.53, 0.51, 1], metal: 0.82, rough: 0.24 },
  { name: 'Vidrio ahumado', color: [0.045, 0.12, 0.15, 1], metal: 0.52, rough: 0.16 },
  { name: 'Chasis grafito', color: [0.12, 0.15, 0.14, 1], metal: 0.38, rough: 0.55 },
  { name: 'Señal de seguridad', color: [0.83, 0.31, 0.105, 1], metal: 0.08, rough: 0.42 },
  { name: 'Faros', color: [0.96, 0.85, 0.56, 1], metal: 0.18, rough: 0.14 },
  { name: 'Válvula de descarga posterior', color: [0.055, 0.067, 0.065, 1], metal: 0.48, rough: 0.42 }
];

const groups = materials.map(() => ({ positions: [], normals: [], indices: [] }));

function vertex(group, point, normal) {
  group.positions.push(...point);
  group.normals.push(...normal);
  return group.positions.length / 3 - 1;
}

function box(material, center, size) {
  const [cx, cy, cz] = center, [sx, sy, sz] = size;
  const corners = [
    [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[0,0,1]],
    [[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1],[0,0,-1]],
    [[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1],[1,0,0]],
    [[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,0,0]],
    [[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1],[0,1,0]],
    [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[0,-1,0]]
  ];
  const group = groups[material];
  for (const [a,b,c,d,normal] of corners) {
    const start = group.positions.length / 3;
    for (const [x,y,z] of [a,b,c,d]) vertex(group, [cx+x*sx/2,cy+y*sy/2,cz+z*sz/2], normal);
    group.indices.push(start,start+1,start+2,start,start+2,start+3);
  }
}

function prism(material, profile, halfDepth) {
  const group = groups[material];
  const center = profile.reduce((sum, [x, y]) => [sum[0] + x / profile.length, sum[1] + y / profile.length], [0, 0]);
  for (const side of [-1, 1]) {
    const depth = side * halfDepth;
    const centerIndex = vertex(group, [center[0], center[1], depth], [0, 0, side]);
    const ringStart = group.positions.length / 3;
    for (const [x, y] of profile) vertex(group, [x, y, depth], [0, 0, side]);
    for (let i = 0; i < profile.length; i++) {
      const next = (i + 1) % profile.length;
      if (side > 0) group.indices.push(centerIndex, ringStart + i, ringStart + next);
      else group.indices.push(centerIndex, ringStart + next, ringStart + i);
    }
  }
  for (let i = 0; i < profile.length; i++) {
    const next = (i + 1) % profile.length;
    const [x0, y0] = profile[i], [x1, y1] = profile[next];
    const dx = x1 - x0, dy = y1 - y0;
    const length = Math.hypot(dx, dy) || 1;
    const normal = [dy / length, -dx / length, 0];
    const start = group.positions.length / 3;
    for (const point of [
      [x0, y0, -halfDepth], [x0, y0, halfDepth],
      [x1, y1, halfDepth], [x1, y1, -halfDepth]
    ]) vertex(group, point, normal);
    group.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
}

function quad(material, points) {
  const group = groups[material], start = group.positions.length / 3;
  const [a, b, c] = points;
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  ];
  const length = Math.hypot(...normal) || 1;
  for (const point of points) vertex(group, point, normal.map((value) => value / length));
  group.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

function cylinder(material, center, radius, length, segments = 20, axis = 'z', radiusTop = radius) {
  const group = groups[material], start = group.positions.length / 3;
  const point = (axial, angle, r) => {
    const u = Math.cos(angle) * r, v = Math.sin(angle) * r;
    if (axis === 'z') return [center[0] + u, center[1] + v, center[2] + axial * length / 2];
    return [center[0] + u, center[1] + axial * length / 2, center[2] + v];
  };
  const normal = (angle, end) => axis === 'z'
    ? [Math.cos(angle), Math.sin(angle), end]
    : [Math.cos(angle), end, Math.sin(angle)];
  for (const end of [-1, 1]) {
    const r = end > 0 ? radiusTop : radius;
    for (let i = 0; i <= segments; i++) {
      const angle = i / segments * Math.PI * 2;
      vertex(group, point(end, angle, r), normal(angle, 0));
    }
  }
  for (let i = 0; i < segments; i++) {
    const a = start + i, b = a + 1, c = start + segments + 1 + i, d = c + 1;
    group.indices.push(a,b,c,b,d,c);
  }
  for (const end of [-1, 1]) {
    const capCenter = vertex(group, [
      center[0],
      center[1] + (axis === 'y' ? end * length / 2 : 0),
      center[2] + (axis === 'z' ? end * length / 2 : 0)
    ], axis === 'z' ? [0,0,end] : [0,end,0]);
    const ringStart = start + (end > 0 ? segments + 1 : 0);
    for (let i = 0; i < segments; i++) {
      if (end > 0) group.indices.push(capCenter, ringStart+i, ringStart+i+1);
      else group.indices.push(capCenter, ringStart+i+1, ringStart+i);
    }
  }
}

function tanker() {
  const group = groups[1];
  const sections = [
    [-0.21, 0], [-0.16, 0.17], [-0.07, 0.29],
    [0.95, 0.29], [1.04, 0.17], [1.09, 0]
  ];
  const start = group.positions.length / 3;
  const segments = 32;
  for (const [x, radius] of sections) {
    for (let i = 0; i <= segments; i++) {
      const angle = i / segments * Math.PI * 2;
      vertex(group, [x, 0.88 + Math.cos(angle) * radius, Math.sin(angle) * radius], [0, Math.cos(angle), Math.sin(angle)]);
    }
  }
  for (let section = 0; section < sections.length - 1; section++) {
    const first = start + section * (segments + 1);
    const next = first + segments + 1;
    for (let i = 0; i < segments; i++) {
      const a = first + i, b = a + 1, c = next + i, d = c + 1;
      group.indices.push(a, c, b, b, c, d);
    }
  }

  function band(x, majorRadius = 0.294, tubeRadius = 0.016) {
    const bandStart = group.positions.length / 3;
    const around = 24, tube = 8;
    for (let i = 0; i <= around; i++) {
      const angle = i / around * Math.PI * 2;
      for (let j = 0; j <= tube; j++) {
        const cross = j / tube * Math.PI * 2;
        const radial = majorRadius + tubeRadius * Math.cos(cross);
        vertex(group, [
          x + tubeRadius * Math.sin(cross),
          0.88 + radial * Math.cos(angle),
          radial * Math.sin(angle)
        ], [
          Math.sin(cross),
          Math.cos(cross) * Math.cos(angle),
          Math.cos(cross) * Math.sin(angle)
        ]);
      }
    }
    const stride = tube + 1;
    for (let i = 0; i < around; i++) for (let j = 0; j < tube; j++) {
      const a = bandStart + i * stride + j, b = a + stride;
      group.indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  band(0.05);
  band(0.83);
}

function tire(center, radius = 0.15, tube = 0.045, radialSegments = 18, tubeSegments = 6, material = 2) {
  const group = groups[material], start = group.positions.length / 3;
  for (let radial = 0; radial <= radialSegments; radial++) {
    const around = (radial / radialSegments) * Math.PI * 2;
    for (let section = 0; section <= tubeSegments; section++) {
      const cross = (section / tubeSegments) * Math.PI * 2;
      const radialOffset = radius + tube * Math.cos(cross);
      vertex(group, [
        center[0] + radialOffset * Math.cos(around),
        center[1] + radialOffset * Math.sin(around),
        center[2] + tube * Math.sin(cross)
      ], [
        Math.cos(cross) * Math.cos(around),
        Math.cos(cross) * Math.sin(around),
        Math.sin(cross)
      ]);
    }
  }
  const stride = tubeSegments + 1;
  for (let radial = 0; radial < radialSegments; radial++) for (let section = 0; section < tubeSegments; section++) {
    const a = start + radial * stride + section, b = a + stride;
    group.indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
}

function createTruck() {
  box(5, [0.02,0.37,0], [2.78,0.14,0.55]);
  box(5, [0.57,0.52,0], [1.72,0.09,0.78]);
  box(3, [0.57,0.46,-0.365], [1.68,0.035,0.018]);
  box(3, [0.57,0.46,0.365], [1.68,0.035,0.018]);
  prism(0, [
    [-1.49,0.46], [-1.47,0.72], [-0.73,0.75], [-0.62,0.45]
  ], 0.31);
  prism(0, [
    [-0.8,0.47], [-0.76,0.91], [-0.55,1.13], [-0.13,1.13], [-0.1,0.47]
  ], 0.315);
  prism(3, [
    [-1.47,0.72], [-0.73,0.75], [-0.69,0.71], [-1.47,0.68]
  ], 0.316);

  tanker();
  for (const x of [0.29,0.81]) box(5,[x,0.59,0],[0.04,0.13,0.72]);
  cylinder(3, [0.42,1.18,0], 0.085, 0.08, 18, 'y');
  cylinder(5, [0.42,1.23,0], 0.045, 0.025, 14, 'y');
  cylinder(8, [1.04,0.55,0], 0.045, 0.16, 14, 'y');
  cylinder(3, [1.04,0.31,0], 0.021, 0.34, 12, 'y');
  box(8, [1.04,0.045,0], [0.095,0.035,0.095]);
  box(5, [-1.49,0.59,0], [0.045,0.27,0.48]);
  quad(4, [
    [-0.756,0.913,-0.29], [-0.556,1.119,-0.29],
    [-0.556,1.119,0.29], [-0.756,0.913,0.29]
  ]);
  for (let slat = 0; slat < 13; slat++) {
    box(3, [-1.518,0.47 + slat * 0.022,0], [0.012,0.009,0.43]);
  }
  box(3, [-1.52,0.38,0], [0.09,0.1,0.69]);
  for (const side of [-1,1]) {
    const face = side * 0.319;
    quad(4, [
      [-0.71,0.914,face], [-0.54,1.095,face], [-0.17,1.095,face], [-0.17,0.914,face]
    ]);
    box(3, [-0.16,0.99,side*0.32], [0.025,0.31,0.018]);
    box(3, [-0.34,0.82,side*0.32], [0.014,0.24,0.018]);
    box(4, [-0.745,0.84,side*0.325], [0.022,0.1,0.018]);
    box(3, [-0.19,0.68,side*0.324], [0.075,0.018,0.014]);
    box(3, [-0.79,0.61,side*0.36], [0.3,0.045,0.16]);
    box(5, [-0.69,0.66,side*0.455], [0.18,0.028,0.018]);
    cylinder(5, [-0.04,0.82,side*0.39], 0.032, 0.56, 12, 'y');
    cylinder(3, [-0.04,1.115,side*0.39], 0.047, 0.035, 14, 'y');
    box(5, [-0.58,0.95,side*0.43], [0.12,0.018,0.17]);
    box(3, [-0.55,0.87,side*0.47], [0.025,0.12,0.02]);
    box(7, [-1.49,0.62,side*0.205], [0.028,0.095,0.105]);
    for (const x of [-1.02,0.63,0.99]) {
      const wheelOffsets = x > 0 ? [0.34,0.48] : [0.4];
      for (const offset of wheelOffsets) {
        const z = side * offset;
        tire([x,0.19,z]);
        cylinder(3, [x,0.19,z + side*0.042], 0.092, 0.02, 16, 'z');
        cylinder(2, [x,0.19,z + side*0.056], 0.035, 0.021, 10, 'z');
      }
      box(6, [1.08,0.43,side*0.3], [0.24,0.055,0.012]);
      box(3, [0.01,0.52,side*0.36], [0.72,0.025,0.018]);
    }
  }
}

function align4(value) { return (value + 3) & ~3; }

export async function generateCargoTruckModel(outputPath) {
  createTruck();
  const binaryParts = [], bufferViews = [], accessors = [], primitives = [];
  let byteLength = 0;
  function append(values, componentType, type, target) {
    const data = componentType === 5126
      ? Buffer.from(new Float32Array(values).buffer)
      : Buffer.from(new Uint16Array(values).buffer);
    const offset = align4(byteLength);
    if (offset > byteLength) binaryParts.push(Buffer.alloc(offset-byteLength));
    byteLength = offset;
    const view = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.byteLength, target });
    binaryParts.push(data);
    byteLength += data.byteLength;
    const accessor = accessors.length;
    const metadata = type === 'VEC3' && componentType === 5126 ? vectorBounds(values) : {};
    accessors.push({
      bufferView: view,
      componentType,
      count: values.length / (type === 'VEC3' ? 3 : 1),
      type,
      ...metadata
    });
    return accessor;
  }

  function vectorBounds(values) {
    const minimum = [Infinity, Infinity, Infinity];
    const maximum = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < values.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        minimum[axis] = Math.min(minimum[axis], values[i + axis]);
        maximum[axis] = Math.max(maximum[axis], values[i + axis]);
      }
    }
    return { min: minimum, max: maximum };
  }
  for (let material = 0; material < groups.length; material++) {
    const group = groups[material];
    if (!group.indices.length) continue;
    primitives.push({
      attributes: {
        POSITION: append(group.positions,5126,'VEC3',34962),
        NORMAL: append(group.normals,5126,'VEC3',34962)
      },
      indices: append(group.indices,5123,'SCALAR',34963),
      material
    });
  }
  const binary = Buffer.concat(binaryParts);
  const gltf = {
    asset: { version: '2.0', generator: 'EDMUNDS · tractocamión original de geometría procedural' },
    scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Tractocamión cisterna de derrame', mesh: 0 }],
    meshes: [{ name: 'Tractocamión rojo con cisterna', primitives }],
    materials: materials.map((item) => ({
      name: item.name,
      pbrMetallicRoughness: {
        baseColorFactor: item.color,
        metallicFactor: item.metal,
        roughnessFactor: item.rough
      },
      doubleSided: true
    })),
    accessors, bufferViews, buffers: [{ byteLength: binary.byteLength }]
  };
  const json = Buffer.from(JSON.stringify(gltf));
  const jsonPadded = Buffer.concat([json,Buffer.alloc(align4(json.length)-json.length,0x20)]);
  const binaryPadded = Buffer.concat([binary,Buffer.alloc(align4(binary.length)-binary.length)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67,0); header.writeUInt32LE(2,4);
  header.writeUInt32LE(12+8+jsonPadded.length+8+binaryPadded.length,8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonPadded.length,0); jsonHeader.writeUInt32LE(0x4e4f534a,4);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binaryPadded.length,0); binaryHeader.writeUInt32LE(0x004e4942,4);
  await mkdir(path.dirname(outputPath),{recursive:true});
  await writeFile(outputPath,Buffer.concat([header,jsonHeader,jsonPadded,binaryHeader,binaryPadded]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const output = process.argv[2] || path.resolve('public','models','cargo-truck.glb');
  await generateCargoTruckModel(output);
  console.log(`Tractocamión glTF binario generado: ${output}`);
}
