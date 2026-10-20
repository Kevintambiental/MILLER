import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { generateSoilModel } from '../scripts/generate-soil-model.mjs';
import { generateCargoTruckModel } from '../scripts/generate-cargo-truck.mjs';
import { plumeTravelDirection } from '../scripts/plume-direction.mjs';

async function loadGlb(filename) {
  const glb = await readFile(filename);
  assert.equal(glb.readUInt32LE(0), 0x46546c67);
  assert.equal(glb.readUInt32LE(4), 2);
  assert.equal(glb.readUInt32LE(8), glb.byteLength);
  const jsonLength = glb.readUInt32LE(12);
  assert.equal(glb.readUInt32LE(16), 0x4e4f534a);
  return { glb, document: JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8').trim()) };
}

test('genera un GLB 2.0 válido con cinco estratos topográficos texturizados', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'edmunds-glb-'));
  try {
    const filename = path.join(directory, 'soil.glb');
    await generateSoilModel(filename);
    const { glb, document } = await loadGlb(filename);
    assert.equal(document.asset.version, '2.0');
    assert.equal(document.meshes.length, 5);
    assert.equal(document.materials.length, 5);
    for (const mesh of document.meshes) {
      const attributes = mesh.primitives[0].attributes;
      const vertexCount = document.accessors[attributes.POSITION].count;
      assert.ok(vertexCount > 700, 'each stratum has detailed cutaway geometry');
      assert.equal(document.accessors[attributes.COLOR_0].count, vertexCount);
    }
    assert.ok(document.bufferViews.every((view) => view.byteOffset % 4 === 0));
    assert.ok(glb.byteLength < 300_000, `asset size ${glb.byteLength} bytes`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('genera un tractocamión cisterna con salida de derrame y proporción longitudinal', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'edmunds-truck-'));
  try {
    const filename = path.join(directory, 'truck.glb');
    await generateCargoTruckModel(filename);
    const { glb, document } = await loadGlb(filename);
    assert.equal(document.asset.version, '2.0');
    assert.equal(document.meshes.length, 1);
    assert.ok(document.meshes[0].primitives.length >= 7);
    const positionAccessors = document.meshes[0].primitives.map((primitive) =>
      document.accessors[primitive.attributes.POSITION]
    );
    for (const accessor of positionAccessors) {
      assert.equal(accessor.min.length, 3, 'POSITION has glTF bounds');
      assert.equal(accessor.max.length, 3, 'POSITION has glTF bounds');
      assert.ok(accessor.min.every((value, axis) => value < accessor.max[axis]));
    }
    assert.ok(document.materials.some((material) => material.name.includes('Neumático')));
    assert.ok(document.materials.some((material) => material.name.includes('Cisterna')));
    assert.ok(document.materials.some((material) => material.name.includes('rojo')));
    const outlet = document.meshes[0].primitives.find((primitive) => primitive.material === 8);
    assert.ok(outlet, 'the rear discharge has its own identifiable material');
    const outletBounds = document.accessors[outlet.attributes.POSITION];
    assert.ok(outletBounds.min[0] > 0.9, 'the discharge is located behind the tanker');
    assert.ok(outletBounds.min[1] < 0.1, 'the discharge reaches below the tanker chassis');
    const bounds = positionAccessors.reduce((result, accessor) => {
      for (let axis = 0; axis < 3; axis++) {
        result.min[axis] = Math.min(result.min[axis], accessor.min[axis]);
        result.max[axis] = Math.max(result.max[axis], accessor.max[axis]);
      }
      return result;
    }, { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
    const length = bounds.max[0] - bounds.min[0];
    const width = bounds.max[2] - bounds.min[2];
    assert.ok(length < 4.4, 'truck fits on the soil long axis');
    assert.ok(width < 2.8, 'truck fits within the soil depth');
    assert.ok(length > width * 2, 'truck is aligned to the long axis');
    assert.ok(document.nodes[0].name.toLowerCase().includes('cisterna'));
    const tanker = document.meshes[0].primitives.find((primitive) => primitive.material === 1);
    assert.ok(tanker, 'the model contains a separate cistern mesh');
    const tankerBounds = document.accessors[tanker.attributes.POSITION];
    assert.ok(tankerBounds.max[1] > 1.1, 'the cistern includes its top manway');
    assert.ok(tankerBounds.max[0] - tankerBounds.min[0] > 1.1, 'the cistern runs along the tanker chassis');
    assert.ok(glb.byteLength < 200_000, `truck asset size ${glb.byteLength} bytes`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('orienta el camión según el avance medido en el campo de concentración', () => {
  const snapshot = {
    nx: 8, ny: 1, nz: 1, L: 8, threshold: 0.01,
    sourceX0: 3, sourceX1: 4, field: [0, 0, 0, 2, 2, 1, 0, 0]
  };
  assert.equal(plumeTravelDirection(snapshot), 1);
  assert.equal(plumeTravelDirection({
    ...snapshot, field: [0, 1, 0, 2, 2, 0, 0, 0]
  }), -1);
  assert.equal(plumeTravelDirection(null), 1);
});
