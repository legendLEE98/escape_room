import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetDirectory = path.join(projectRoot, 'public', 'models', 'assets');
const outputPath = path.join(assetDirectory, 'asset-index.json');

// Categories under public/models/assets/ that are NOT placeable furniture, so they
// must stay out of the editor's asset browser: character/ is the player avatar pool,
// tiles/ holds floor-material source GLBs.
const NON_PLACEABLE_CATEGORIES = new Set(['character', 'tiles']);

async function readGlbFileNames(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.glb'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));
}

async function collectCategoryAssets(category) {
  const categoryDir = path.join(assetDirectory, category);

  let manifest = null;
  try {
    manifest = JSON.parse(await readFile(path.join(categoryDir, 'manifest.json'), 'utf8'));
  } catch {
    manifest = null;
  }

  if (manifest && Array.isArray(manifest.assets)) {
    return manifest.assets.map((entry) => ({
      file: `${category}/${entry.file}`,
      root: entry.root,
      collection: entry.collection,
    }));
  }

  const files = await readGlbFileNames(categoryDir);
  return files.map((file) => ({ file: `${category}/${file}` }));
}

await mkdir(assetDirectory, { recursive: true });

const categoryDirs = (await readdir(assetDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && !NON_PLACEABLE_CATEGORIES.has(entry.name))
  .map((entry) => entry.name);

const assets = (await Promise.all(categoryDirs.map(collectCategoryAssets))).flat();
assets.sort((left, right) => left.file.localeCompare(right.file, 'en'));

await writeFile(
  outputPath,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), assets }, null, 2)}\n`,
  'utf8',
);

console.log(`Indexed ${assets.length} placeable GLB assets across ${categoryDirs.length} categories.`);

// Character pool gets its own small index — the client can't list a static
// directory itself, so it fetches this to discover which character files exist.
const characterDir = path.join(assetDirectory, 'character');
try {
  const characterFiles = await readGlbFileNames(characterDir);
  await writeFile(
    path.join(characterDir, 'character-index.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), files: characterFiles }, null, 2)}\n`,
    'utf8',
  );
  console.log(`Indexed ${characterFiles.length} character GLB(s).`);
} catch {
  console.warn('No character/ directory found — skipping character index.');
}
