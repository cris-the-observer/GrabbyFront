import fs from "fs/promises";
import path from "path";
import { GameMapType } from "../core/game/Game";
import { GameMapLoader, MapData } from "../core/game/GameMapLoader";
import { MapManifest } from "../core/game/TerrainMapLoader";

export class NodeMapLoader implements GameMapLoader {
  private readonly cache = new Map<GameMapType, MapData>();

  constructor(
    private readonly root = path.resolve(process.cwd(), "resources", "maps"),
  ) {}

  getMapData(map: GameMapType): MapData {
    const cached = this.cache.get(map);
    if (cached) return cached;

    const key = Object.keys(GameMapType).find(
      (k) => GameMapType[k as keyof typeof GameMapType] === map,
    );
    if (!key) throw new Error(`Unknown map: ${map}`);
    const dir = path.join(this.root, key.toLowerCase());
    const mapData = {
      mapBin: () =>
        fs
          .readFile(path.join(dir, "map.bin"))
          .then((buf) => new Uint8Array(buf)),
      map4xBin: () =>
        fs
          .readFile(path.join(dir, "map4x.bin"))
          .then((buf) => new Uint8Array(buf)),
      map16xBin: () =>
        fs
          .readFile(path.join(dir, "map16x.bin"))
          .then((buf) => new Uint8Array(buf)),
      manifest: () =>
        fs
          .readFile(path.join(dir, "manifest.json"), "utf8")
          .then((raw) => JSON.parse(raw) as MapManifest),
      webpPath: path.join(dir, "thumbnail.webp"),
    } satisfies MapData;
    this.cache.set(map, mapData);
    return mapData;
  }
}
