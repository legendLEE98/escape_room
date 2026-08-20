import { readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetDirectory = path.join(projectRoot, 'public', 'models', 'assets');
const outputPath = path.join(assetDirectory, 'asset-index.json');

await mkdir(assetDirectory, { recursive: true });

const files = (await readdir(assetDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.glb'))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, 'en'));

await writeFile(
  outputPath,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), files }, null, 2)}\n`,
  'utf8',
);

console.log(`Indexed ${files.length} GLB assets.`);
