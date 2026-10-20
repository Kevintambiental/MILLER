import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateSoilModel } from './generate-soil-model.mjs';
import { generateCargoTruckModel } from './generate-cargo-truck.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const simulatorDirectory = path.join(root, 'public', 'simulator');
await mkdir(simulatorDirectory, { recursive: true });
await copyFile(path.join(root, 'index.html'), path.join(simulatorDirectory, 'index.html'));
await generateSoilModel(path.join(root, 'public', 'models', 'soil-cutaway.glb'));
await generateCargoTruckModel(path.join(root, 'public', 'models', 'cargo-truck.glb'));
