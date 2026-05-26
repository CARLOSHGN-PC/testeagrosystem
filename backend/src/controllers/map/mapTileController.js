import { getTile as getTileBuffer } from '../../services/map/mapTileService.js';

export async function getTile(req, res, next) {
  try {
    const { companyId, layer, z, x, y } = req.params;

    if (!req.user) return res.status(401).end();
    if (String(req.user.companyId) !== String(companyId)) {
      return res.status(403).end();
    }

    const tile = await getTileBuffer({ companyId, layer, z, x, y });
    res.setHeader('Content-Type', 'application/x-protobuf');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(tile);
  } catch (error) {
    return next(error);
  }
}
