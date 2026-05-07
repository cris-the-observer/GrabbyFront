# Grabby Front V1 Implementation Notes

## Imported Baseline

- Source: `https://github.com/openfrontio/OpenFrontIO.git`
- Imported branch: default GitHub `HEAD` at import time
- Imported upstream commit: `4889cb83a0472b45e0974ab582af87aa417995bc`
- Import target: `GrabbyFrontV1/`
- The local `OpenFrontIO/` checkout was not copied.

## Post-Import Baseline Audit

- Package/install/build/test commands are defined in `package.json`.
  - Install: `npm ci --ignore-scripts`
  - Client/server dev: `npm run dev`
  - Production build: `npm run build-prod`
  - Tests: `npm test` (`vitest run && vitest run tests/server`)
  - Map generation: `npm run gen-maps` delegates to `map-generator/go run .`
- Private lobby authority is account/persistent-ID based upstream.
  - `GameManager.createGame` accepts an optional `creatorPersistentID`.
  - `GameServer` derives `lobbyCreatorID` from `creatorPersistentID -> clientID`.
  - WebSocket host actions such as `kick_player`, `update_game_config`, `start_game`, and `toggle_pause` check `client.clientID === this.lobbyCreatorID`.
  - `lobbyCreatorClientID` is included in `GameInfo` for display and upstream host checks indirectly depend on the creator persistent ID mapping.
- WebSocket game flow keeps OpenFront's intent/turn architecture.
  - `GameServer` stamps intents with the connected `clientID`, batches turns, collects hashes, and sends `ServerTurnMessage`/start/desync messages.
  - Browser clients run deterministic game logic in `src/core/worker/Worker.worker.ts` through `createGameRunner`.
  - `GameRunner` loads the map, creates human and Nation players, executes turns locally, emits `GameUpdateViewData`, and preserves full deterministic state for hash/replay behavior.
- Map registry/loading paths are split across enum, generated assets, and loaders.
  - `GameMapType` and `mapCategories` live in `src/core/game/Game.ts`.
  - Runtime browser/worker map loading uses `resources/maps/<lowercase-enum-key>/manifest.json`, `map.bin`, `map4x.bin`, `map16x.bin`, and `thumbnail.webp`.
  - `BinaryLoaderGameMapLoader`/`FetchGameMapLoader` consume those runtime artifacts.
  - `MapPlaylist` contains public map frequency/default matchmaking config.
  - Existing map consistency tests assert `GameMapType`, `map-generator/assets/maps`, `resources/maps`, translations, and `MapPlaylist` stay aligned.
- Upstream map generation is image/input based.
  - `npm run gen-maps` runs the Go generator in `map-generator/`.
  - Grabby Front `Universe` requires a separate deterministic generator that writes runtime artifacts directly.
- `GameConfig.disabledUnits` exists upstream.
  - Schema support is in `GameConfigSchema`.
  - Config access is through `Config.isUnitDisabled`.
  - Existing construction code already rejects disabled construction types at `ConstructionExecution.init`.
  - Additional V1 validation is still required for crafted warship move/build behavior, UI/CLI exposure, and Nation warship behavior.
- Nation AI behavior is execution based.
  - `GameRunner.init` adds `Executor.nationExecutions()` when config spawns nations.
  - `NationExecution` initializes structure, alliance, nuke, MIRV, attack, emoji, and warship behaviors.
  - Warship tracking/spawning is partially gated by `UnitType.Warship` disablement, but direct behavior calls still require V1 audit and tests.

## Baseline Verification

- `npm ci --ignore-scripts`: passed.
- `npm run build-prod`: passed.
- `npm test`: failed during the imported/browser baseline with 64 failures.
  - Failing files: `tests/InputHandler.test.ts` and `tests/client/sound/SoundManager.test.ts`.
  - Shared failure cause: test environment `localStorage` was present without `getItem`, `setItem`, and `removeItem`; Vitest also warned that `--localstorage-file` had no valid path.
  - This was observed before Grabby Front implementation behavior was integrated, but one sub-agent had already added an untracked Grabby Front test file in the shared tree, so the result is recorded as a baseline-environment failure rather than a pristine upstream run.
