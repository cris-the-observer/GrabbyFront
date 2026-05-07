import {
  JsonlCommandSchema,
  makeCommandResult,
  makeErrorEnvelope,
  parseJsonlCommand,
  stringifyEnvelope,
} from "../../src/cli/JsonlEnvelope";

describe("Grabby AI JSONL envelopes", () => {
  it("parses stable V1 submit-intent commands", () => {
    const command = parseJsonlCommand(
      JSON.stringify({
        v: 1,
        id: "cmd-1",
        type: "submit_intent",
        intent: { type: "spawn", tile: 123 },
      }),
    );

    expect(command.type).toBe("submit_intent");
    expect(command.id).toBe("cmd-1");
  });

  it("parses the V1 start handshake command", () => {
    expect(parseJsonlCommand('{"v":1,"id":"start","type":"start"}')).toEqual({
      v: 1,
      id: "start",
      type: "start",
    });
  });

  it("returns structured parse errors for invalid command lines", () => {
    expect(() => parseJsonlCommand("{")).toThrow(/Invalid JSON/);

    const result = JsonlCommandSchema.safeParse({ v: 1, type: "bogus" });
    expect(result.success).toBe(false);
  });

  it("serializes command results and errors as one JSON object per line", () => {
    expect(stringifyEnvelope(makeCommandResult("cmd-1", "observe"))).toBe(
      '{"v":1,"type":"command_result","id":"cmd-1","command":"observe","ok":true}\n',
    );
    expect(
      stringifyEnvelope(makeErrorEnvelope("cmd-2", "bad_command", "Nope")),
    ).toBe(
      '{"v":1,"type":"error","id":"cmd-2","error":{"code":"bad_command","message":"Nope"}}\n',
    );
  });
});
