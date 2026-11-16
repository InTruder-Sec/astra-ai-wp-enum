#!/usr/bin/env node
import { Command } from "commander";
import { resolveAiConfig, normalizeTarget, isLocalTarget } from "./config.js";
import type { AppConfig } from "./config.js";
import { runScan } from "./agent/orchestrator.js";
import { renderPretty, renderJson } from "./report/output.js";

const program = new Command();

program
  .name("wp-user-enum")
  .description("AI-driven WordPress user enumeration tool for authorized security testing")
  .option("-u, --url <url>", "target WordPress URL (or set WP_TARGET_URL)")
  .option("-f, --format <format>", "output format: pretty | json", "pretty")
  .option("--brute", "enable login brute-force on the discovered admin", false)
  .option("--author-range <n>", "highest author id to probe", "10")
  .option("--timeout <ms>", "per-request timeout in milliseconds", "10000")
  .option("--retries <n>", "network retry attempts", "2")
  .option("--password-file <path>", "custom password list for brute-force (overrides rockyou)")
  .option("--max-attempts <n>", "max brute-force password attempts", "40")
  .option("--provider <provider>", "force AI provider: openai | anthropic")
  .option("--allow-remote", "allow non-local targets (authorized use only)", false)
  .option("-v, --verbose", "verbose output", false)
  .parse();

const opts = program.opts();

async function main(): Promise<void> {
  const rawTarget = opts.url || process.env.WP_TARGET_URL;
  if (!rawTarget) {
    fail("No target specified. Pass --url <url> or set WP_TARGET_URL.");
  }

  const target = normalizeTarget(rawTarget);
  if (!isLocalTarget(target) && !opts.allowRemote) {
    fail(
      `Refusing non-local target ${target}. This tool is for authorized, self-hosted targets only. ` +
        `Re-run with --allow-remote only if you are authorized to test it.`,
    );
  }

  if (opts.provider) process.env.AI_PROVIDER = String(opts.provider);

  const config: AppConfig = {
    target,
    format: opts.format === "json" ? "json" : "pretty",
    authorIdRange: parsePositiveInt(opts.authorRange, 10),
    bruteForce: Boolean(opts.brute),
    passwordFile: opts.passwordFile,
    maxAttempts: parsePositiveInt(opts.maxAttempts, 40),
    timeoutMs: parsePositiveInt(opts.timeout, 10000),
    retries: parsePositiveInt(opts.retries, 2),
    allowRemote: Boolean(opts.allowRemote),
    verbose: Boolean(opts.verbose),
    ai: resolveAiConfig(),
  };

  const report = await runScan(config);
  console.log(config.format === "json" ? renderJson(report) : renderPretty(report));
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function fail(message: string): never {
  console.error(`[!] ${message}`);
  process.exit(1);
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
