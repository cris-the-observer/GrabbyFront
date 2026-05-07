# Universe Map Generator

`npm run gen-universe-map` from the repo root regenerates the committed V1
Universe map. The generator is deterministic and synthetic: it does not read an
input image and does not call the existing OpenFront image-input map generator.

The command reads `universe/config.json` and writes OpenFront-compatible runtime
artifacts directly to `../resources/maps/universe/`:

- `map.bin`
- `map4x.bin`
- `map16x.bin`
- `manifest.json`
- `thumbnail.webp`
- `review.json`

The committed config uses a 2048 x 2048 map, or 4,194,304 total cells. The
thumbnail is generated from the same terrain bytes and cosmic terrain palette
used by the V1 terrain layer. Thumbnail encoding requires `cwebp` on `PATH`;
normal build/test flows use the committed `thumbnail.webp` and do not require
`cwebp`.
