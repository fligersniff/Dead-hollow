// Client-side map registry: plain JSON imports (Vite inlines them). The server loads the same files from shared/maps/ with fs.
import yard from '../../shared/maps/yard.json';
import outpost from '../../shared/maps/outpost.json';
import town from '../../shared/maps/town.json';
export const MAPS = { yard, outpost, town };
export const MAP_LIST = Object.values(MAPS).map(m => ({ id: m.id, name: m.name }));
