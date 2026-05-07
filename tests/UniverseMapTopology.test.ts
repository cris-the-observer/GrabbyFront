import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const UNIVERSE_DIR = path.join(ROOT, "resources", "maps", "universe");
const LAND_BIT = 0b10000000;
const SHORELINE_BIT = 0b01000000;

type Manifest = {
  map: { width: number; height: number; num_land_tiles: number };
  nations: { coordinates: [number, number]; name: string }[];
};

function neighbors(ref: number, width: number, height: number): number[] {
  const x = ref % width;
  const result: number[] = [];
  if (ref >= width) result.push(ref - width);
  if (ref < (height - 1) * width) result.push(ref + width);
  if (x > 0) result.push(ref - 1);
  if (x < width - 1) result.push(ref + 1);
  return result;
}

function componentSizes(
  data: Uint8Array,
  width: number,
  height: number,
  wantLand: boolean,
): { sizes: number[]; componentByRef: Int32Array } {
  const componentByRef = new Int32Array(data.length);
  componentByRef.fill(-1);
  const sizes: number[] = [];
  const queue = new Int32Array(data.length);

  for (let start = 0; start < data.length; start++) {
    if (componentByRef[start] !== -1) continue;
    if (Boolean(data[start] & LAND_BIT) !== wantLand) continue;

    const componentId = sizes.length;
    let head = 0;
    let tail = 0;
    let size = 0;
    queue[tail++] = start;
    componentByRef[start] = componentId;

    while (head < tail) {
      const ref = queue[head++];
      size++;
      for (const next of neighbors(ref, width, height)) {
        if (componentByRef[next] !== -1) continue;
        if (Boolean(data[next] & LAND_BIT) !== wantLand) continue;
        componentByRef[next] = componentId;
        queue[tail++] = next;
      }
    }
    sizes.push(size);
  }

  return { sizes, componentByRef };
}

describe("Universe map topology", () => {
  test("committed Universe runtime terrain matches V1 topology constraints", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(UNIVERSE_DIR, "manifest.json"), "utf8"),
    ) as Manifest;
    const data = fs.readFileSync(path.join(UNIVERSE_DIR, "map.bin"));
    const { width, height, num_land_tiles } = manifest.map;

    expect(width * height).toBeGreaterThanOrEqual(3_900_000);
    expect(width * height).toBeLessThanOrEqual(4_300_000);
    expect(data).toHaveLength(width * height);
    expect(num_land_tiles).toBeGreaterThanOrEqual(250_000);
    expect(num_land_tiles).toBeLessThanOrEqual(900_000);

    const landTiles = data.reduce(
      (sum, byte) => sum + (byte & LAND_BIT ? 1 : 0),
      0,
    );
    expect(landTiles).toBe(num_land_tiles);

    const shorelineTiles = data.reduce(
      (sum, byte) => sum + (byte & SHORELINE_BIT ? 1 : 0),
      0,
    );
    expect(shorelineTiles).toBeGreaterThan(25_000);
    expect(shorelineTiles / num_land_tiles).toBeGreaterThan(0.08);

    const water = componentSizes(data, width, height, false);
    const totalWater = data.length - num_land_tiles;
    expect(Math.max(...water.sizes) / totalWater).toBeGreaterThan(0.98);

    const land = componentSizes(data, width, height, true);
    const spawnCapableComponents = land.sizes.filter((size) => size >= 8_000);
    expect(spawnCapableComponents.length).toBeGreaterThanOrEqual(18);
    expect(spawnCapableComponents.length).toBeLessThanOrEqual(30);

    expect(manifest.nations).toHaveLength(12);
    const startComponents = new Set<number>();
    for (const nation of manifest.nations) {
      const [x, y] = nation.coordinates;
      const ref = y * width + x;
      expect(data[ref] & LAND_BIT).toBeTruthy();
      const componentId = land.componentByRef[ref];
      expect(componentId).toBeGreaterThanOrEqual(0);
      expect(land.sizes[componentId]).toBeGreaterThanOrEqual(12_000);
      expect(startComponents.has(componentId)).toBe(false);
      startComponents.add(componentId);
    }
  });
});
