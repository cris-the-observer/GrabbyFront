import { colord, Colord } from "colord";
import { Theme } from "../configuration/Config";
import { GameMapType } from "./Game";
import { GameMap, TileRef } from "./GameMap";

export function terrainColorForMap(
  map: GameMapType,
  theme: Theme,
  gm: GameMap,
  tile: TileRef,
): Colord {
  if (map === GameMapType.Universe) {
    return cosmicTerrainColor(gm, tile);
  }
  return theme.terrainColor(gm, tile);
}

export function cosmicTerrainColor(gm: GameMap, tile: TileRef): Colord {
  const mag = gm.magnitude(tile);
  if (gm.isWater(tile)) {
    const lift = Math.min(8 + Math.floor((31 - mag) / 2), 24);
    return colord({
      r: 5 + Math.floor(lift / 4),
      g: 7 + Math.floor(lift / 3),
      b: 13 + lift,
    });
  }

  if (mag >= 24) {
    const warm = Math.min(190 + mag * 2, 245);
    return colord({
      r: warm,
      g: Math.min(warm - 10, 235),
      b: 172,
    });
  }
  const cool = Math.min(92 + mag * 4, 180);
  return colord({
    r: cool,
    g: Math.min(cool + 12, 200),
    b: Math.min(cool + 34, 230),
  });
}
