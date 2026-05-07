#!/usr/bin/env tsx
import { parseCliStartupConfig } from "./CliConfig";
import { GrabbyAiCli } from "./GrabbyAiCli";

try {
  new GrabbyAiCli(parseCliStartupConfig()).start();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
