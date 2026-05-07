import { z } from "zod";
import { ClientIntentMessageSchema } from "../core/Schemas";
import { replacer } from "../core/Util";

const EnvelopeBaseSchema = z.object({
  v: z.literal(1),
  id: z.string().optional(),
});

const JoinCommandSchema = EnvelopeBaseSchema.extend({
  type: z.literal("join"),
  serverUrl: z.string().optional(),
  gameID: z.string().optional(),
  joinToken: z.string().optional(),
  identity: z
    .object({
      name: z.string().optional(),
      clanTag: z.string().nullable().optional(),
      token: z.string().optional(),
    })
    .optional(),
});

const ObserveCommandSchema = EnvelopeBaseSchema.extend({
  type: z.literal("observe"),
});

const StartCommandSchema = EnvelopeBaseSchema.extend({
  type: z.literal("start"),
});

const LegalActionsCommandSchema = EnvelopeBaseSchema.extend({
  type: z.literal("legal_actions"),
  tile: z.number().int().nonnegative().optional(),
});

const SubmitIntentCommandSchema = EnvelopeBaseSchema.extend({
  type: z.literal("submit_intent"),
  intent: ClientIntentMessageSchema.shape.intent,
});

const QuitCommandSchema = EnvelopeBaseSchema.extend({
  type: z.literal("quit"),
});

export const JsonlCommandSchema = z.discriminatedUnion("type", [
  JoinCommandSchema,
  StartCommandSchema,
  ObserveCommandSchema,
  LegalActionsCommandSchema,
  SubmitIntentCommandSchema,
  QuitCommandSchema,
]);

export type JsonlCommand = z.infer<typeof JsonlCommandSchema>;

export type JsonlOutputEnvelope =
  | {
      v: 1;
      type: "observation";
      id?: string;
      observation: unknown;
    }
  | {
      v: 1;
      type: "event";
      event: string;
      data?: unknown;
    }
  | {
      v: 1;
      type: "command_result";
      id?: string;
      command: string;
      ok: true;
      data?: unknown;
    }
  | {
      v: 1;
      type: "error";
      id?: string;
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
    };

export function parseJsonlCommand(line: string): JsonlCommand {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    throw new Error(
      `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const result = JsonlCommandSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(z.prettifyError(result.error));
  }
  return result.data;
}

export function stringifyEnvelope(envelope: JsonlOutputEnvelope): string {
  return `${JSON.stringify(envelope, replacer)}\n`;
}

export function makeCommandResult(
  id: string | undefined,
  command: string,
  data?: unknown,
): JsonlOutputEnvelope {
  return {
    v: 1,
    type: "command_result",
    id,
    command,
    ok: true,
    ...(data === undefined ? {} : { data }),
  };
}

export function makeErrorEnvelope(
  id: string | undefined,
  code: string,
  message: string,
  details?: unknown,
): JsonlOutputEnvelope {
  return {
    v: 1,
    type: "error",
    id,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
}
