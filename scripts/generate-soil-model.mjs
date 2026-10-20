import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const layerColors = [
  [0.29, 0.37, 0.23, 1],
  [0.31, 0.23, 0.15, 1],
  [0.39, 0.29, 0.18, 1],
  [0.25, 0.22, 0.17, 1],
  [0.34, 0.26, 0.18, 1]
];

const width = 4.4;
const depth = 2.8;
const layerHeight = 0.48;

function surfaceHeight(x, z) {
  return 1.15 + 0.075 * Math.sin(x * 1.55) + 0.045 * Math.cos(z * 3.1 + x * 0.7) +
    0.022 * Math.sin(x * 4 + z * 3);
}

function boundary(layer, x, z) {
  return surfaceHeight(x, z) - layer * layerHeight -
    (layer === 0 ? 0 : 0.035 * Math.sin(x * 2.2 + z * 1.3 + layer * 0.8));
}

function vertexColor(layer, x, y, z, top = false) {
  const variation = Math.sin(x * 15.2 + z * 18.7 + y * 21.4) * 0.045 +
    Math.sin(x * 38.1 - z * 27.5) * 0.022;
  if (top) {
    const green = 0.93 + variation;
    return [green, green * 1.04, green * 0.82];
  }
  const variationFactor = 0.94 + variation;
  return [variationFactor, variationFactor * (0.97 + (layer % 2) * 0.03), variationFactor * 0.9];
}

function createGeometry(layer) {
  const positions = [], normals = [], colors = [], indices = [];
  const pushVertex = (point, normal, color) => {
    positions.push(...point);
    normals.push(...normal);
    colors.push(...color);
    return positions.length / 3 - 1;
  };
  const addGrid = (uSteps, vSteps, point, normal, color) => {
    const start = positions.length / 3;
    for (let u = 0; u <= uSteps; u++) {
      for (let v = 0; v <= vSteps; v++) {
        const uRatio = u / uSteps, vRatio = v / vSteps;
        const [x, y, z] = point(uRatio, vRatio);
        pushVertex([x, y, z], normal(uRatio, vRatio), color(x, y, z));
      }
    }
    for (let u = 0; u < uSteps; u++) {
      for (let v = 0; v < vSteps; v++) {
        const a = start + u * (vSteps + 1) + v;
        const b = a + vSteps + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  };

  const bandColor = (x, y, z) => vertexColor(layer, x, y, z);
  addGrid(32, 6,
    (u, v) => {
      const x = (u - 0.5) * width;
      const z = depth / 2 + 0.025 * Math.sin(x * 2.3);
      const top = boundary(layer, x, z), bottom = boundary(layer + 1, x, z);
      return [x, top + (bottom - top) * v, z];
    },
    () => [0, 0, 1],
    bandColor
  );
  addGrid(24, 4,
    (u, v) => {
      const x = (u - 0.5) * width, z = -depth / 2;
      const top = boundary(layer, x, z), bottom = boundary(layer + 1, x, z);
      return [x, top + (bottom - top) * v, z];
    },
    () => [0, 0, -1],
    bandColor
  );
  for (const side of [-1, 1]) {
    addGrid(20, 6,
      (u, v) => {
        const z = (u - 0.5) * depth;
        const x = side * (width / 2 + 0.035 * Math.sin(z * 2.4));
        const top = boundary(layer, x, z), bottom = boundary(layer + 1, x, z);
        return [x, top + (bottom - top) * v, z];
      },
      () => [side, 0, 0],
      bandColor
    );
  }
  if (layer === 0) {
    addGrid(24, 12,
      (u, v) => {
        const x = (u - 0.5) * width;
        const z = (v - 0.5) * depth;
        return [x, boundary(0, x, z), z];
      },
      () => [0, 1, 0],
      (x, y, z) => vertexColor(layer, x, y, z, true)
    );
  }
  const bottomY = -1.25;
  addGrid(24, 4,
    (u, v) => {
      const x = (u - 0.5) * width, z = depth / 2;
      const bottom = layer === 4 ? bottomY : boundary(layer + 1, x, z);
      const top = boundary(layer, x, z);
      return [x, bottom + (top - bottom) * v, z];
    },
    () => [0, -1, 0],
    bandColor
  );
  return { positions, normals, colors, indices };
}

function align4(value) {
  return (value + 3) & ~3;
}

export async function generateSoilModel(outputPath) {
  const binaryParts = [];
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  let byteLength = 0;

  function appendBuffer(values, componentType, type, target, min, max) {
    const data = componentType === 5126
      ? Buffer.from(new Float32Array(values).buffer)
      : Buffer.from(new Uint16Array(values).buffer);
    const aligned = align4(byteLength);
    if (aligned > byteLength) binaryParts.push(Buffer.alloc(aligned - byteLength));
    byteLength = aligned;
    const viewIndex = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.byteLength, target });
    binaryParts.push(data);
    byteLength += data.byteLength;
    const accessorIndex = accessors.length;
    accessors.push({
      bufferView: viewIndex,
      componentType,
      count: values.length / (type === 'VEC3' ? 3 : 1),
      type,
      ...(min ? { min, max } : {})
    });
    return accessorIndex;
  }

  for (let layer = 0; layer < 5; layer++) {
    const geometry = createGeometry(layer);
    const position = appendBuffer(geometry.positions, 5126, 'VEC3', 34962, [-2.25, -1.25, -1.4], [2.25, 1.3, 1.4]);
    const normal = appendBuffer(geometry.normals, 5126, 'VEC3', 34962);
    const color = appendBuffer(geometry.colors, 5126, 'VEC3', 34962);
    const indices = appendBuffer(geometry.indices, 5123, 'SCALAR', 34963);
    meshes.push({
      name: `Estrato ${layer + 1}`,
      primitives: [{
        attributes: { POSITION: position, NORMAL: normal, COLOR_0: color },
        indices,
        material: layer
      }]
    });
    nodes.push({ name: `Estrato ${layer + 1}`, mesh: layer });
  }

  const binary = Buffer.concat(binaryParts);
  const document = {
    asset: { version: '2.0', generator: 'EDMUNDS · modelo local original' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, index) => index) }],
    nodes,
    meshes,
    materials: layerColors.map((baseColorFactor, index) => ({
      name: `Estrato ${index + 1}`,
      pbrMetallicRoughness: { baseColorFactor, metallicFactor: 0, roughnessFactor: 1 },
      doubleSided: true
    })),
    accessors,
    bufferViews,
    buffers: [{ byteLength: binary.byteLength }]
  };
  const json = Buffer.from(JSON.stringify(document));
  const jsonLength = align4(json.byteLength);
  const binLength = align4(binary.byteLength);
  const jsonChunk = Buffer.concat([json, Buffer.alloc(jsonLength - json.byteLength, 0x20)]);
  const binaryChunk = Buffer.concat([binary, Buffer.alloc(binLength - binary.byteLength)]);
  const totalLength = 12 + 8 + jsonChunk.byteLength + 8 + binaryChunk.byteLength;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.byteLength, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binaryChunk.byteLength, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.concat([header, jsonHeader, jsonChunk, binaryHeader, binaryChunk]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const output = process.argv[2] || path.resolve('public', 'models', 'soil-cutaway.glb');
  await generateSoilModel(output);
  console.log(`Modelo glTF binario generado: ${output}`);
}
