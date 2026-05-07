# Grabby Front AI JSONL CLI

`grabby-ai` is the V1 AI-facing player tracer. It connects to a game WebSocket, joins as a normal client, runs the deterministic client core locally from server turns, submits hash messages, and reads/writes stable newline-delimited JSON envelopes.

Run from the repo:

```sh
npm run cli:ai -- \
  --server-url http://localhost:9000 \
  --game-id ABCDEFGH \
  --join-token '<private-lobby-join-token>' \
  --identity 00000000-0000-4000-8000-000000000001 \
  --name 'AI Observer'
```

Startup configuration can come from flags, environment, or startup JSON. Flags override startup JSON, which overrides environment.

Environment names:

- `GRABBY_SERVER_URL`
- `GRABBY_GAME_ID`
- `GRABBY_JOIN_TOKEN`
- `GRABBY_PLAYER_IDENTITY`
- `GRABBY_PLAYER_NAME`
- `GRABBY_CLAN_TAG`
- `GRABBY_WORKER_COUNT`
- `GRABBY_WORKER_PATH`
- `GRABBY_TURNSTILE_TOKEN`
- `GRABBY_STARTUP_JSON`
- `GRABBY_MAP_ASSETS`

Input commands use `v: 1`:

```jsonl
{"v":1,"id":"o1","type":"observe"}
{"v":1,"id":"l1","type":"legal_actions","tile":12345}
{"v":1,"id":"s1","type":"submit_intent","intent":{"type":"spawn","tile":12345}}
{"v":1,"id":"start1","type":"start"}
{"v":1,"id":"q1","type":"quit"}
```

Outputs are one object per line with `type` equal to `observation`, `event`, `command_result`, or `error`. Observations are produced through the CLI observation adapter boundary and use contact/reveal state when the core exposes it. The default adapter does not expose unknown civilizations, hidden units, or diplomacy/transfer helpers for uncontacted players.
