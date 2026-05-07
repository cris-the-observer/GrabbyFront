#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LAND_BIT = 0b10000000;
const SHORELINE_BIT = 0b01000000;
const OCEAN_BIT = 0b00100000;

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const config = JSON.parse(fs.readFileSync(path.join(here, "config.json"), "utf8"));

class Rng {
  constructor(seed) {
    this.state = seed >>> 0;
  }
  next() {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state;
  }
  float() {
    return this.next() / 0xffffffff;
  }
  int(max) {
    return max <= 0 ? 0 : this.next() % max;
  }
}

function generate() {
  if (config.width % 4 !== 0 || config.height % 4 !== 0) {
    throw new Error("Universe width and height must be divisible by 4");
  }

  const density = new Uint16Array(config.width * config.height);
  const rng = new Rng(config.seed);
  config.galaxies.forEach((galaxy, index) =>
    carveGalaxy(density, config.width, config.height, galaxy, rng, index),
  );

  const full = packMap(density, config.width, config.height);
  const density4x = downscaleDensity(density, config.width, config.height);
  const map4x = packMap(density4x, config.width / 2, config.height / 2);
  const density16x = downscaleDensity(density4x, config.width / 2, config.height / 2);
  const map16x = packMap(density16x, config.width / 4, config.height / 4);
  const nations = selectedStarts(density);

  const outDir = path.join(root, "resources", "maps", config.name);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "map.bin"), full.data);
  fs.writeFileSync(path.join(outDir, "map4x.bin"), map4x.data);
  fs.writeFileSync(path.join(outDir, "map16x.bin"), map16x.data);
  writeJson(path.join(outDir, "manifest.json"), {
    name: config.name,
    map: {
      width: config.width,
      height: config.height,
      num_land_tiles: full.landTiles,
    },
    map4x: {
      width: config.width / 2,
      height: config.height / 2,
      num_land_tiles: map4x.landTiles,
    },
    map16x: {
      width: config.width / 4,
      height: config.height / 4,
      num_land_tiles: map16x.landTiles,
    },
    nations,
  });
  writeJson(path.join(outDir, "review.json"), {
    seed: config.seed,
    width: config.width,
    height: config.height,
    totalCells: config.width * config.height,
    systemCells: full.landTiles,
    spawnCandidateGalaxies: config.galaxies.filter((g) => g.nodes >= 80).length,
    selectedStarts: nations,
    generator: "map-generator/universe/generate.mjs",
    topologyReviewGuidance: [
      "Systems are OpenFront land; void is OpenFront ocean water.",
      "Seeded graph nodes carve granular connected galaxy archipelagos.",
      "Start positions are selected one per start-marked galaxy.",
    ],
    thumbnailPaletteSummary: [
      "Deep void is near-black navy.",
      "Near-system void lifts subtly through distance shading.",
      "Sparse systems are dim blue-white; denser cores are pale gold.",
    ],
  });

  const ppmPath = path.join(outDir, "thumbnail.ppm");
  writePpmThumbnail(ppmPath, full.data, config.width, config.height, config.thumbnailScale);
  const webp = spawnSync("cwebp", ["-quiet", "-q", "82", ppmPath, "-o", path.join(outDir, "thumbnail.webp")], {
    stdio: "inherit",
  });
  fs.rmSync(ppmPath, { force: true });
  if (webp.status !== 0) {
    throw new Error("cwebp failed to encode Universe thumbnail");
  }
}

function carveGalaxy(density, width, height, galaxy, rng, salt) {
  const cx = Math.round(galaxy.x);
  const cy = Math.round(galaxy.y);
  paint(density, width, height, cx, cy, 5, 18);

  for (let i = 0; i < galaxy.nodes; i++) {
    const angle = rng.float() * Math.PI * 2;
    const radius = Math.sqrt(rng.float());
    const wobble = 0.78 + rng.float() * 0.34;
    const tx = Math.round(galaxy.x + Math.cos(angle) * galaxy.rx * radius * wobble + rng.int(17) - 8);
    const ty = Math.round(galaxy.y + Math.sin(angle) * galaxy.ry * radius * wobble + rng.int(17) - 8);
    carveLine(density, width, height, cx, cy, tx, ty, 1 + rng.int(2), 4 + rng.int(8));

    let wx = tx;
    let wy = ty;
    const steps = 42 + rng.int(42) + Math.floor(galaxy.nodes / 7);
    for (let step = 0; step < steps; step++) {
      const localAngle = angle + (rng.float() - 0.5) * Math.PI * 1.4 + Math.sin(step + salt) * 0.35;
      wx += Math.round(Math.cos(localAngle) * (1 + rng.int(4)));
      wy += Math.round(Math.sin(localAngle) * (1 + rng.int(4)));
      if (!insideEllipse(wx, wy, galaxy)) {
        wx = Math.round((wx + tx + cx) / 3);
        wy = Math.round((wy + ty + cy) / 3);
      }
      let brush = 1 + rng.int(3);
      if (rng.float() > 0.88) brush++;
      paint(density, width, height, wx, wy, brush, 7 + rng.int(18));
    }
  }

  carveVoidFjords(density, width, height, galaxy, rng);
}

function insideEllipse(x, y, galaxy) {
  const dx = (x - galaxy.x) / (galaxy.rx * 1.18);
  const dy = (y - galaxy.y) / (galaxy.ry * 1.18);
  return dx * dx + dy * dy <= 1;
}

function carveLine(density, width, height, x0, y0, x1, y1, brush, value) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) {
    paint(density, width, height, x0, y0, brush, value);
    return;
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(x0 + dx * t + Math.sin(t * Math.PI * 6) * 1.7);
    const y = Math.round(y0 + dy * t + Math.cos(t * Math.PI * 5) * 1.3);
    paint(density, width, height, x, y, brush, value);
  }
}

function paint(density, width, height, cx, cy, radius, value) {
  const r2 = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y++) {
    if (y < 0 || y >= height) continue;
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x < 0 || x >= width) continue;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const ref = y * width + x;
      density[ref] = Math.min(31, density[ref] + value);
    }
  }
}

function carveVoidFjords(density, width, height, galaxy, rng) {
  const fjords = Math.max(12, Math.floor(galaxy.nodes / 5));
  for (let i = 0; i < fjords; i++) {
    const angle = rng.float() * Math.PI * 2;
    const startX = Math.round(galaxy.x + Math.cos(angle) * galaxy.rx * 1.36);
    const startY = Math.round(galaxy.y + Math.sin(angle) * galaxy.ry * 1.36);
    const endRadius = 0.28 + rng.float() * 0.5;
    const endX = Math.round(galaxy.x + Math.cos(angle + (rng.float() - 0.5) * 0.7) * galaxy.rx * endRadius);
    const endY = Math.round(galaxy.y + Math.sin(angle + (rng.float() - 0.5) * 0.7) * galaxy.ry * endRadius);
    eraseLine(density, width, height, startX, startY, endX, endY, 2 + rng.int(3));
  }
}

function eraseLine(density, width, height, x0, y0, x1, y1, brush) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const x = Math.round(x0 + dx * t + Math.sin(t * Math.PI * 4) * 2.4);
    const y = Math.round(y0 + dy * t + Math.cos(t * Math.PI * 3) * 1.8);
    erase(density, width, height, x, y, brush);
  }
}

function erase(density, width, height, cx, cy, radius) {
  const r2 = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y++) {
    if (y < 0 || y >= height) continue;
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x < 0 || x >= width) continue;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      density[y * width + x] = 0;
    }
  }
}

function packMap(density, width, height) {
  const land = new Uint8Array(density.length);
  let landTiles = 0;
  for (let i = 0; i < density.length; i++) {
    if (density[i] > 0) {
      land[i] = 1;
      landTiles++;
    }
  }
  const distance = distanceToLand(land, width, height);
  const data = Buffer.alloc(density.length);
  for (let ref = 0; ref < density.length; ref++) {
    if (land[ref]) {
      data[ref] = LAND_BIT | Math.min(density[ref], 31);
    } else {
      data[ref] = OCEAN_BIT | Math.min(Math.ceil(distance[ref] / 2), 31);
    }
    if (hasOppositeNeighbor(land, width, height, ref, land[ref])) {
      data[ref] |= SHORELINE_BIT;
    }
  }
  return { data, landTiles };
}

function distanceToLand(land, width, height) {
  const distance = new Int16Array(land.length);
  const queue = new Int32Array(land.length);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < land.length; i++) {
    if (land[i]) {
      distance[i] = 0;
      queue[tail++] = i;
    } else {
      distance[i] = -1;
    }
  }
  while (head < tail) {
    const ref = queue[head++];
    const nextDistance = distance[ref] + 1;
    for (const next of neighbors(ref, width, height)) {
      if (distance[next] !== -1) continue;
      distance[next] = nextDistance;
      queue[tail++] = next;
    }
  }
  return distance;
}

function hasOppositeNeighbor(land, width, height, ref, isLand) {
  for (const next of neighbors(ref, width, height)) {
    if (land[next] !== isLand) return true;
  }
  return false;
}

function neighbors(ref, width, height) {
  const x = ref % width;
  const out = [];
  if (ref >= width) out.push(ref - width);
  if (ref < (height - 1) * width) out.push(ref + width);
  if (x > 0) out.push(ref - 1);
  if (x < width - 1) out.push(ref + 1);
  return out;
}

function downscaleDensity(input, width, height) {
  const outWidth = width / 2;
  const outHeight = height / 2;
  const output = new Uint16Array(outWidth * outHeight);
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      let max = 0;
      for (let yy = 0; yy < 2; yy++) {
        for (let xx = 0; xx < 2; xx++) {
          max = Math.max(max, input[(y * 2 + yy) * width + x * 2 + xx]);
        }
      }
      output[y * outWidth + x] = max;
    }
  }
  return output;
}

function selectedStarts(density) {
  const starts = [];
  for (const galaxy of config.galaxies) {
    if (!galaxy.start) continue;
    const [x, y] = nearestLand(density, Math.round(galaxy.x), Math.round(galaxy.y));
    starts.push({ coordinates: [x, y], flag: "", name: galaxy.name });
    if (starts.length === config.selectedStarts) break;
  }
  return starts;
}

function nearestLand(density, x, y) {
  x = Math.max(0, Math.min(config.width - 1, x));
  y = Math.max(0, Math.min(config.height - 1, y));
  if (density[y * config.width + x] > 0) return [x, y];
  for (let radius = 1; radius < Math.max(config.width, config.height); radius++) {
    for (let yy = y - radius; yy <= y + radius; yy++) {
      for (let xx = x - radius; xx <= x + radius; xx++) {
        if (xx < 0 || xx >= config.width || yy < 0 || yy >= config.height) continue;
        if (Math.abs(xx - x) !== radius && Math.abs(yy - y) !== radius) continue;
        if (density[yy * config.width + xx] > 0) return [xx, yy];
      }
    }
  }
  return [x, y];
}

function writePpmThumbnail(file, data, width, height, scale) {
  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(height * scale));
  const header = Buffer.from(`P6\n${outWidth} ${outHeight}\n255\n`, "ascii");
  const pixels = Buffer.alloc(outWidth * outHeight * 3);
  for (let y = 0; y < outHeight; y++) {
    const sy = Math.min(Math.floor(y / scale), height - 1);
    for (let x = 0; x < outWidth; x++) {
      const sx = Math.min(Math.floor(x / scale), width - 1);
      const [r, g, b] = terrainColor(data[sy * width + sx]);
      const p = (y * outWidth + x) * 3;
      pixels[p] = r;
      pixels[p + 1] = g;
      pixels[p + 2] = b;
    }
  }
  fs.writeFileSync(file, Buffer.concat([header, pixels]));
}

function terrainColor(value) {
  const magnitude = value & 0x1f;
  if ((value & LAND_BIT) === 0) {
    const lift = Math.min(8 + Math.floor((31 - magnitude) / 2), 24);
    return [5 + Math.floor(lift / 4), 7 + Math.floor(lift / 3), 13 + lift];
  }
  if (magnitude >= 24) {
    const warm = Math.min(190 + magnitude * 2, 245);
    return [warm, Math.min(warm - 10, 235), 172];
  }
  const cool = Math.min(92 + magnitude * 4, 180);
  return [cool, Math.min(cool + 12, 200), Math.min(cool + 34, 230)];
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

generate();
