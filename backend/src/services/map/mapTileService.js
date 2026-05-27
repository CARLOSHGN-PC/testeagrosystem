import fs from 'fs/promises';
import path from 'path';

const ALLOWED_LAYERS = new Set(['talhoes', 'fazendas', 'estimativas']);

export async function getTile({ companyId, layer, z, x, y }) {
  if (!ALLOWED_LAYERS.has(layer)) {
    const err = new Error('Layer inválida.');
    err.status = 404;
    throw err;
  }

  const sanitizedCompanyId = String(companyId).replace(/[^a-zA-Z0-9_-]/g, '');
  const tilePath = path.resolve(process.cwd(), 'backend', 'data', 'tiles', sanitizedCompanyId, layer, String(z), String(x), `${y}.pbf`);

  try {
    return await fs.readFile(tilePath);
  } catch {
    const err = new Error('Tile não encontrada.');
    err.status = 404;
    throw err;
  }
}
