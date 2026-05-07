import { Game, Player, UnitType } from "./Game";
import { TileRef } from "./GameMap";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const DEFAULT_TURN_INTERVAL_MS = 100;

export function lightSpeedTilesPerTick(game: Game): number {
  const intervalMs = turnIntervalMs(game);
  const ticksIn15Minutes = FIFTEEN_MINUTES_MS / intervalMs;
  return mapDiagonal(game) / ticksIn15Minutes;
}

export function lightSpeedRevealRadius(game: Game, player: Player): number {
  const spawnTick = player.spawnTick();
  if (spawnTick === undefined) {
    return 0;
  }
  return (
    Math.max(0, game.ticks() - spawnTick + 1) * lightSpeedTilesPerTick(game)
  );
}

export function observeContactBetweenPlayers(game: Game): void {
  const players = game
    .players()
    .filter(
      (player) => typeof player.isAlive === "function" && player.isAlive(),
    );
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      if (a.hasContactWith(b)) {
        continue;
      }
      if (
        a.sharesBorderWith(b) ||
        b.sharesBorderWith(a) ||
        revealTouchesPlayer(game, a, b, lightSpeedRevealRadius(game, a)) ||
        revealTouchesPlayer(game, b, a, lightSpeedRevealRadius(game, b))
      ) {
        a.establishContactWith(b);
      }
    }
  }
}

export function revealTouchesPlayer(
  game: Game,
  observer: Player,
  target: Player,
  radius: number,
): boolean {
  if (observer === target) {
    return true;
  }
  if (radius < 0 || !observer.isAlive() || !target.isAlive()) {
    return false;
  }
  const radiusSquared = radius * radius;
  const observerTiles = contactSourceTiles(observer);
  const targetTiles = contactTargetTiles(target);
  if (observerTiles.length === 0 || targetTiles.length === 0) {
    return false;
  }

  for (const source of observerTiles) {
    for (const candidate of targetTiles) {
      if (game.euclideanDistSquared(source, candidate) <= radiusSquared) {
        return true;
      }
    }
  }
  return false;
}

function contactSourceTiles(player: Player): TileRef[] {
  const spawnTile = player.spawnTile();
  if (spawnTile !== undefined) {
    return [spawnTile];
  }
  const borders = player.borderTiles();
  const firstBorder = borders.values().next().value as TileRef | undefined;
  if (firstBorder !== undefined) {
    return [firstBorder];
  }
  const firstTile = player.tiles().values().next().value as TileRef | undefined;
  return firstTile === undefined ? [] : [firstTile];
}

function contactTargetTiles(player: Player): TileRef[] {
  const result = new Set<TileRef>(contactSourceTiles(player));
  for (const unit of player.units(
    UnitType.City,
    UnitType.DefensePost,
    UnitType.Factory,
    UnitType.MissileSilo,
    UnitType.Port,
    UnitType.SAMLauncher,
    UnitType.Train,
    UnitType.TransportShip,
    UnitType.TradeShip,
    UnitType.Warship,
  )) {
    if (unit.isActive()) {
      result.add(unit.tile());
    }
  }
  return Array.from(result);
}

function mapDiagonal(game: Game): number {
  return Math.hypot(game.width(), game.height());
}

function turnIntervalMs(game: Game): number {
  try {
    return game.config().serverConfig().turnIntervalMs();
  } catch {
    return DEFAULT_TURN_INTERVAL_MS;
  }
}
