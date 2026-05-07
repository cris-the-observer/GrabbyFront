import { DonateGoldExecution } from "../../src/core/execution/DonateGoldExecution";
import { Executor } from "../../src/core/execution/ExecutionManager";
import { MoveWarshipExecution } from "../../src/core/execution/MoveWarshipExecution";
import { WinCheckExecution } from "../../src/core/execution/WinCheckExecution";
import { AllianceRequestExecution } from "../../src/core/execution/alliance/AllianceRequestExecution";
import {
  createNationTraits,
  NationTrait,
} from "../../src/core/execution/nation/NationTraits";
import {
  lightSpeedRevealRadius,
  observeContactBetweenPlayers,
} from "../../src/core/game/Contacts";
import {
  filterGameUpdateForObserver,
  UNKNOWN_CIVILIZATION_NAME,
} from "../../src/core/game/FilteredObservation";
import {
  Game,
  GameMode,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../../src/core/game/Game";
import {
  GameUpdateType,
  GameUpdateViewData,
} from "../../src/core/game/GameUpdates";
import { setup } from "../util/Setup";

describe("Grabby Front core rules", () => {
  test("disabled warships cannot be created or moved through public execution paths", async () => {
    const game = await setup(
      "half_land_half_ocean",
      {
        disabledUnits: [UnitType.Warship],
        infiniteGold: true,
        instantBuild: true,
      },
      [new PlayerInfo("p1", PlayerType.Human, "c1", "p1")],
    );
    while (game.inSpawnPhase()) game.executeNextTick();

    const executor = new Executor(game, "game_id", "c1");
    const buildWarship = executor.createExec({
      clientID: "c1",
      type: "build_unit",
      unit: UnitType.Warship,
      tile: game.ref(8, 10),
    });

    game.addExecution(buildWarship);
    game.executeNextTick();

    const player = game.player("p1");
    expect(player.units(UnitType.Warship)).toHaveLength(0);

    const enabledGame = await setup(
      "half_land_half_ocean",
      { infiniteGold: true, instantBuild: true },
      [new PlayerInfo("p2", PlayerType.Human, null, "p2")],
    );
    while (enabledGame.inSpawnPhase()) enabledGame.executeNextTick();
    const enabledPlayer = enabledGame.player("p2");
    const start = enabledGame.ref(8, 10);
    const warship = enabledPlayer.buildUnit(UnitType.Warship, start, {
      patrolTile: start,
    });
    enabledGame.config().gameConfig().disabledUnits = [UnitType.Warship];

    new MoveWarshipExecution(
      enabledPlayer,
      [warship.id()],
      enabledGame.ref(9, 10),
    ).init(enabledGame, enabledGame.ticks());

    expect(warship.warshipState().patrolTile).toBe(start);
  });

  test("contact-gated alliances and transfers reject uncontacted civilizations and allow contacted ones", async () => {
    const { game, p1, p2 } = await spawnedPlayers();

    expect(p1.hasContactWith(p2)).toBe(false);

    game.addExecution(new AllianceRequestExecution(p1, p2.id()));
    game.executeNextTick();
    expect(p1.outgoingAllianceRequests()).toHaveLength(0);

    p1.establishContactWith(p2);
    expect(p1.hasContactWith(p2)).toBe(true);
    game.addExecution(new AllianceRequestExecution(p1, p2.id()));
    game.executeNextTick();
    expect(p1.outgoingAllianceRequests()).toHaveLength(1);

    const sameTeamGame = await setup(
      "plains",
      {
        donateGold: true,
        gameMode: GameMode.Team,
        playerTeams: 2,
        infiniteGold: true,
      },
      [
        new PlayerInfo("ally1", PlayerType.Human, null, "ally1"),
        new PlayerInfo("ally2", PlayerType.Human, null, "ally2"),
      ],
    );
    const ally1 = sameTeamGame.player("ally1");
    const ally2 = sameTeamGame.player("ally2");
    vi.spyOn(ally1, "isFriendly").mockReturnValue(true);
    ally1.conquer(sameTeamGame.ref(0, 0));
    ally2.conquer(sameTeamGame.ref(20, 20));
    while (sameTeamGame.inSpawnPhase()) sameTeamGame.executeNextTick();

    const before = ally2.gold();
    ally1.addGold(1000n);
    sameTeamGame.addExecution(new DonateGoldExecution(ally1, ally2.id(), 100));
    sameTeamGame.executeNextTick();
    expect(ally2.gold()).toBe(before);

    ally1.establishContactWith(ally2);
    sameTeamGame.addExecution(new DonateGoldExecution(ally1, ally2.id(), 100));
    sameTeamGame.executeNextTick();
    expect(ally2.gold()).toBeGreaterThan(before);
  });

  test("1c reveal radius derives from map diagonal and contact persists", async () => {
    const { game, p1, p2 } = await spawnedPlayers();
    const diagonal = Math.hypot(game.width(), game.height());
    const ticksIn15Minutes = (15 * 60 * 1000) / 100;

    const elapsedTicks = game.ticks() - p1.spawnTick()! + 1;
    expect(lightSpeedRevealRadius(game, p1) / elapsedTicks).toBeCloseTo(
      diagonal / ticksIn15Minutes,
    );

    p1.establishContactWith(p2);
    observeContactBetweenPlayers(game);
    expect(p1.hasContactWith(p2)).toBe(true);
  });

  test("filtered official observation hides uncontacted civilization details while preserving terrain", () => {
    const update = makeObservationUpdate();
    const filtered = filterGameUpdateForObserver(update, {
      observerSmallID: 1,
      contactedSmallIDs: new Set([1]),
    });

    expect(filtered.packedTileUpdates[0]).toBe(10);
    expect(filtered.packedTileUpdates[1] >>> 16).toBe(0xab);
    expect(filtered.packedTileUpdates[1] & 0xfff).toBe(0);

    const hiddenPlayer = filtered.updates[GameUpdateType.Player].find(
      (p) => p.smallID === 2,
    );
    expect(hiddenPlayer?.displayName).toBe(UNKNOWN_CIVILIZATION_NAME);
    expect(hiddenPlayer?.gold).toBe(0n);
    expect(hiddenPlayer?.troops).toBe(0);
    expect(hiddenPlayer?.outgoingAttacks).toHaveLength(0);
    expect(filtered.updates[GameUpdateType.Unit]).toHaveLength(0);
  });

  test("standard land dominance victory threshold is 75 percent", async () => {
    const game = await setup("big_plains", {
      infiniteGold: true,
      gameMode: GameMode.FFA,
      instantBuild: true,
    });
    const player = game.addPlayer(
      new PlayerInfo("dominant", PlayerType.Human, null, "dominant"),
    );
    while (game.inSpawnPhase()) game.executeNextTick();

    const totalLand = game.numLandTiles();
    const targetTiles = Math.floor(totalLand * 0.76);
    let assigned = 0;
    game.map().forEachTile((tile) => {
      if (assigned >= targetTiles || !game.isLand(tile)) return;
      player.conquer(tile);
      assigned++;
    });

    const setWinnerSpy = vi.fn();
    game.setWinner = setWinnerSpy;
    const winCheck = new WinCheckExecution();
    winCheck.init(game, 0);
    winCheck.checkWinnerFFA();

    expect(setWinnerSpy).toHaveBeenCalledWith(player, expect.anything());
  });

  test("Nation traits are hidden, seeded, deterministic, and affect behavior knobs", () => {
    const traitsA = createNationTraits("game_id", "nation_a");
    const traitsAReplay = createNationTraits("game_id", "nation_a");
    const traitsB = createNationTraits("game_id", "nation_b");

    expect(traitsA).toEqual(traitsAReplay);
    expect(traitsA).not.toEqual(traitsB);
    expect(Object.values(NationTrait)).toContain(traitsA.primary);
    expect(traitsA.attackMultiplier).not.toBe(1);

    const update = makeObservationUpdate();
    const filtered = filterGameUpdateForObserver(update, {
      observerSmallID: 1,
      contactedSmallIDs: new Set([1, 2]),
    });
    const serialized = JSON.stringify(filtered, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    expect(serialized).not.toContain("primary");
    expect(serialized).not.toContain("attackMultiplier");
    expect(
      JSON.stringify(filtered, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    ).not.toContain("allianceRequestChanceMultiplier");
  });
});

async function spawnedPlayers(): Promise<{
  game: Game;
  p1: Player;
  p2: Player;
}> {
  const game = await setup(
    "plains",
    { infiniteGold: true, instantBuild: true, infiniteTroops: true },
    [
      new PlayerInfo("p1", PlayerType.Human, null, "p1"),
      new PlayerInfo("p2", PlayerType.Human, null, "p2"),
    ],
  );
  const p1 = game.player("p1");
  const p2 = game.player("p2");
  p1.conquer(game.ref(0, 0));
  p2.conquer(game.ref(20, 20));
  p1.setSpawnTile(game.ref(0, 0));
  p2.setSpawnTile(game.ref(20, 20));
  while (game.inSpawnPhase()) game.executeNextTick();
  return { game, p1, p2 };
}

function makeObservationUpdate(): GameUpdateViewData {
  const playerBase = {
    type: GameUpdateType.Player as const,
    nameViewData: undefined,
    clientID: null,
    team: undefined,
    playerType: PlayerType.Human,
    isAlive: true,
    isDisconnected: false,
    tilesOwned: 1,
    allies: [],
    embargoes: new Set<string>(),
    isTraitor: false,
    traitorRemainingTicks: 0,
    targets: [],
    outgoingEmojis: [],
    outgoingAttacks: [],
    incomingAttacks: [],
    outgoingAllianceRequests: [],
    alliances: [],
    hasSpawned: true,
    betrayals: 0,
    lastDeleteUnitTick: -1,
    isLobbyCreator: false,
  };
  return {
    tick: 1,
    packedTileUpdates: new Uint32Array([10, (0xab << 16) | 2]),
    updates: {
      [GameUpdateType.Tile]: [],
      [GameUpdateType.Unit]: [
        {
          type: GameUpdateType.Unit,
          unitType: UnitType.City,
          troops: 0,
          id: 1,
          ownerID: 2,
          pos: 10,
          lastPos: 10,
          isActive: true,
          reachedTarget: false,
          targetable: true,
          markedForDeletion: false,
          missileTimerQueue: [],
          level: 1,
          hasTrainStation: false,
        },
      ],
      [GameUpdateType.Player]: [
        {
          ...playerBase,
          name: "Observer",
          displayName: "Observer",
          id: "observer",
          smallID: 1,
          gold: 100n,
          troops: 100,
        },
        {
          ...playerBase,
          name: "Hidden",
          displayName: "Hidden",
          id: "hidden",
          smallID: 2,
          gold: 900n,
          troops: 800,
          outgoingAttacks: [
            {
              attackerID: 2,
              targetID: 1,
              troops: 10,
              id: "attack",
              retreating: false,
            },
          ],
        },
      ],
      [GameUpdateType.DisplayEvent]: [],
      [GameUpdateType.DisplayChatEvent]: [],
      [GameUpdateType.AllianceRequest]: [],
      [GameUpdateType.AllianceRequestReply]: [],
      [GameUpdateType.BrokeAlliance]: [],
      [GameUpdateType.AllianceExpired]: [],
      [GameUpdateType.AllianceExtension]: [],
      [GameUpdateType.TargetPlayer]: [],
      [GameUpdateType.Emoji]: [],
      [GameUpdateType.Win]: [],
      [GameUpdateType.Hash]: [],
      [GameUpdateType.UnitIncoming]: [],
      [GameUpdateType.BonusEvent]: [],
      [GameUpdateType.RailroadDestructionEvent]: [],
      [GameUpdateType.RailroadConstructionEvent]: [],
      [GameUpdateType.RailroadSnapEvent]: [],
      [GameUpdateType.ConquestEvent]: [],
      [GameUpdateType.EmbargoEvent]: [],
      [GameUpdateType.GamePaused]: [],
    },
    playerNameViewData: {},
  };
}
