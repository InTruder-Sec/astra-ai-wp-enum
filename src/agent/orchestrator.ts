import { HttpClient } from "../http/client.js";
import { runRecon } from "../recon/wpScan.js";
import { bruteForceLogin } from "../bruteforce/login.js";
import { TECHNIQUES, getTechnique } from "../techniques/index.js";
import { buildModel } from "./providers.js";
import { buildPlan } from "./planner.js";
import { buildSummary } from "./summary.js";
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

  const bruteForce = await maybeBruteForce(http, config, users);
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
  users: DiscoveredUser[],
): Promise<BruteForceResult> {
  if (!config.bruteForce) {
    return { attempted: false, triedCount: 0, detail: "Brute-force not run (pass --brute to enable)." };
  }
  const admin = pickAdmin(users);
  if (!admin) {
    return { attempted: false, triedCount: 0, detail: "Brute-force skipped: no admin username discovered." };
  }
  const passwords = await loadPasswords(config.passwordFile);
  return bruteForceLogin(http, config.target, admin.username, { passwords });
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
