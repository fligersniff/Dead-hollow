// Loads every shared/maps/*.json (the map format is plain JSON; drop a new file in that folder to add a map).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../shared/maps');
export const MAPS = {};
for (const f of fs.readdirSync(dir).sort()) {
  if (!f.endsWith('.json')) continue;
  const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  MAPS[m.id] = m;
}
export const MAP_LIST = Object.values(MAPS).map(m => ({ id: m.id, name: m.name }));
