import readline from "readline";
import WebSocket from "ws";
import { GameUpdateType, GameUpdateViewData } from "../core/game/GameUpdates";
import { createGameRunner, GameRunner } from "../core/GameRunner";
import {
  ClientHashMessage,
  ClientIntentMessage,
  ClientJoinMessage,
  ClientMessage,
  ClientMessageSchema,
  ServerMessage,
  ServerMessageSchema,
  Turn,
} from "../core/Schemas";
import { replacer } from "../core/Util";
import { CliStartupConfig, resolveGameWebSocketUrl } from "./CliConfig";
import {
  JsonlCommand,
  makeCommandResult,
  makeErrorEnvelope,
  parseJsonlCommand,
  stringifyEnvelope,
} from "./JsonlEnvelope";
import { listLegalActions } from "./LegalActions";
import { NodeMapLoader } from "./NodeMapLoader";
import {
  CliVisibilityAdapter,
  createCliObservation,
} from "./ObservationAdapter";

type Writable = Pick<NodeJS.WritableStream, "write">;
type Readable = NodeJS.ReadableStream;

export class GrabbyAiCli {
  private ws: WebSocket | null = null;
  private runner: GameRunner | null = null;
  private myPlayerID: string | null = null;
  private turnsSeen = 0;
  private closing = false;
  private readonly mapLoader: NodeMapLoader;

  constructor(
    private config: CliStartupConfig,
    private readonly input: Readable = process.stdin,
    private readonly output: Writable = process.stdout,
    private readonly visibility?: CliVisibilityAdapter,
  ) {
    this.mapLoader = new NodeMapLoader(config.mapAssetRoot);
  }

  start(): void {
    this.connect();
    this.startCommandLoop();
  }

  async handleCommand(command: JsonlCommand): Promise<void> {
    switch (command.type) {
      case "join":
        this.applyJoinCommand(command);
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.send(this.createJoinMessage());
        } else {
          this.connect();
        }
        this.write(makeCommandResult(command.id, command.type));
        break;
      case "observe":
        this.writeObservation(command.id);
        this.write(makeCommandResult(command.id, command.type));
        break;
      case "start":
        this.submitIntent(command.id, { type: "start_game" });
        break;
      case "legal_actions":
        this.write(
          makeCommandResult(
            command.id,
            command.type,
            this.getLegalActions(command.tile),
          ),
        );
        break;
      case "submit_intent":
        this.submitIntent(command.id, command.intent);
        break;
      case "quit":
        this.close();
        this.write(makeCommandResult(command.id, command.type));
        break;
    }
  }

  private connect(): void {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    const url = resolveGameWebSocketUrl(this.config);
    this.ws = new WebSocket(url);
    this.ws.on("open", () => {
      this.write({ v: 1, type: "event", event: "connected", data: { url } });
      if (this.config.autoJoin) this.send(this.createJoinMessage());
    });
    this.ws.on("message", (data) => this.onServerMessage(data.toString()));
    this.ws.on("error", (error) => {
      this.write(
        makeErrorEnvelope(undefined, "websocket_error", error.message),
      );
    });
    this.ws.on("close", (code, reason) => {
      this.write({
        v: 1,
        type: "event",
        event: "closed",
        data: { code, reason: reason.toString() },
      });
    });
  }

  private startCommandLoop(): void {
    const rl = readline.createInterface({ input: this.input });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let command: JsonlCommand;
      try {
        command = parseJsonlCommand(trimmed);
      } catch (error) {
        this.write(
          makeErrorEnvelope(
            undefined,
            "invalid_command",
            error instanceof Error ? error.message : String(error),
          ),
        );
        return;
      }
      this.handleCommand(command).catch((error) => {
        this.write(
          makeErrorEnvelope(
            command.id,
            "command_failed",
            error instanceof Error ? error.message : String(error),
          ),
        );
      });
    });
    rl.on("close", () => {
      if (!this.closing) this.close();
    });
  }

  private async onServerMessage(raw: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      this.write(
        makeErrorEnvelope(undefined, "invalid_server_json", String(error)),
      );
      return;
    }
    const result = ServerMessageSchema.safeParse(parsed);
    if (!result.success) {
      this.write(
        makeErrorEnvelope(
          undefined,
          "invalid_server_message",
          "Server message failed schema validation",
        ),
      );
      return;
    }
    const message = result.data;
    this.write({
      v: 1,
      type: "event",
      event: "server_message",
      data: { type: message.type },
    });
    await this.applyServerMessage(message);
  }

  private async applyServerMessage(message: ServerMessage): Promise<void> {
    switch (message.type) {
      case "lobby_info":
        this.write({
          v: 1,
          type: "event",
          event: "lobby_info",
          data: { lobby: message.lobby, myClientID: message.myClientID },
        });
        break;
      case "prestart":
        this.write({ v: 1, type: "event", event: "prestart", data: message });
        break;
      case "start":
        this.runner = await createGameRunner(
          message.gameStartInfo,
          message.myClientID,
          this.mapLoader,
          (update) => this.onGameUpdate(update),
        );
        this.myPlayerID = message.myClientID
          ? (this.runner.game.playerByClientID(message.myClientID)?.id() ??
            null)
          : null;
        for (const turn of message.turns) {
          this.applyTurn(turn);
        }
        this.write({
          v: 1,
          type: "event",
          event: "started",
          data: { myClientID: message.myClientID },
        });
        this.writeObservation();
        break;
      case "turn":
        this.applyTurn(message.turn);
        break;
      case "ping":
        this.send({ type: "ping" });
        break;
      case "desync":
      case "error":
        this.write({ v: 1, type: "event", event: message.type, data: message });
        break;
    }
  }

  private applyTurn(turn: Turn): void {
    if (!this.runner) return;
    this.runner.addTurn(turn);
    this.turnsSeen = Math.max(this.turnsSeen, turn.turnNumber + 1);
    while (this.runner.pendingTurns() > 0) {
      this.runner.executeNextTick(this.runner.pendingTurns());
    }
  }

  private onGameUpdate(
    update: GameUpdateViewData | { errMsg: string; stack?: string },
  ): void {
    if ("errMsg" in update) {
      this.write(
        makeErrorEnvelope(undefined, "core_error", update.errMsg, update.stack),
      );
      return;
    }
    for (const hashUpdate of update.updates[GameUpdateType.Hash]) {
      this.send({
        type: "hash",
        turnNumber: hashUpdate.tick,
        hash: hashUpdate.hash,
      } satisfies ClientHashMessage);
    }
    if (this.config.observeOnTick) this.writeObservation();
  }

  private writeObservation(id?: string): void {
    if (!this.runner || !this.myPlayerID) {
      this.write(
        makeErrorEnvelope(
          id,
          "not_started",
          "No local game state is available yet",
        ),
      );
      return;
    }
    this.write({
      v: 1,
      type: "observation",
      id,
      observation: createCliObservation({
        game: this.runner.game,
        observerPlayerID: this.myPlayerID,
        gameID: this.config.gameID,
        visibility: this.visibility,
      }),
    });
  }

  private getLegalActions(tile?: number): unknown {
    if (!this.runner || !this.myPlayerID) {
      throw new Error("No local game state is available yet");
    }
    return listLegalActions({
      game: this.runner.game,
      observerPlayerID: this.myPlayerID,
      tile,
      visibility: this.visibility,
    });
  }

  private submitIntent(
    id: string | undefined,
    intent: ClientIntentMessage["intent"],
  ): void {
    const message = {
      type: "intent",
      intent,
    } satisfies ClientIntentMessage;
    const validation = ClientMessageSchema.safeParse(message);
    if (!validation.success) {
      this.write(
        makeErrorEnvelope(
          id,
          "invalid_intent",
          "Intent failed schema validation",
        ),
      );
      return;
    }
    this.send(message);
    this.write(makeCommandResult(id, "submit_intent", { sent: true }));
  }

  private applyJoinCommand(
    command: Extract<JsonlCommand, { type: "join" }>,
  ): void {
    this.config = {
      ...this.config,
      serverUrl: command.serverUrl ?? this.config.serverUrl,
      gameID: command.gameID ?? this.config.gameID,
      joinToken: command.joinToken ?? this.config.joinToken,
      identity: {
        name: command.identity?.name ?? this.config.identity.name,
        clanTag:
          command.identity?.clanTag === undefined
            ? this.config.identity.clanTag
            : command.identity.clanTag,
        token: command.identity?.token ?? this.config.identity.token,
      },
    };
  }

  private createJoinMessage(): ClientJoinMessage & {
    joinToken?: string;
    anonymousClientID?: string;
  } {
    return {
      type: "join",
      token: this.config.identity.token,
      gameID: this.config.gameID,
      username: this.config.identity.name,
      clanTag: this.config.identity.clanTag,
      turnstileToken: this.config.turnstileToken,
      joinToken: this.config.joinToken,
      anonymousClientID: this.config.identity.token,
    };
  }

  private send(message: ClientMessage | Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.write(
        makeErrorEnvelope(
          undefined,
          "socket_not_open",
          "WebSocket is not open",
        ),
      );
      return;
    }
    this.ws.send(JSON.stringify(message, replacer));
  }

  private write(envelope: Parameters<typeof stringifyEnvelope>[0]): void {
    this.output.write(stringifyEnvelope(envelope));
  }

  private close(): void {
    this.closing = true;
    this.ws?.close(1000, "quit");
  }
}
