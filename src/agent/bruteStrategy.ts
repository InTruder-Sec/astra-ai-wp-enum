import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import type { LanguageModelV1 } from "ai";
import type { ReconFinding } from "../types.js";
import { COMMON_PASSWORDS } from "../bruteforce/login.js";

export interface BruteContext {
  username: string;
  siteTitle?: string;
  wpVersion?: string;
  findings: ReconFinding[];
}

const schema = z.object({
  passwords: z.array(z.string()).max(60),
});

const INSTRUCTIONS = [
  "You select likely passwords for an authorized WordPress login test on a known-vulnerable target.",
  "Given the target username and site context, output the most probable passwords to try first, ordered by likelihood.",
  "Favor username-derived guesses, site-name-derived guesses, and well-known weak passwords.",
  "Output only the raw password strings, no commentary.",
].join(" ");

export async function buildPasswordList(
  model: LanguageModelV1 | null,
  ctx: BruteContext,
  rockyouTop: string[],
  cap: number,
): Promise<{ passwords: string[]; source: "ai" | "deterministic" }> {
  const contextual = contextualGuesses(ctx);

  if (model) {
    try {
      const agent = new Agent({ name: "wp-brute-strategist", instructions: INSTRUCTIONS, model });
      const { object } = await agent.generate(buildPrompt(ctx, cap), { output: schema });
      const merged = dedupe([...object.passwords, ...contextual, ...COMMON_PASSWORDS, ...rockyouTop]).slice(0, cap);
      if (merged.length > 0) return { passwords: merged, source: "ai" };
    } catch {
      // fall through to deterministic
    }
  }

  const merged = dedupe([...contextual, ...COMMON_PASSWORDS, ...rockyouTop]).slice(0, cap);
  return { passwords: merged, source: "deterministic" };
}

function contextualGuesses(ctx: BruteContext): string[] {
  const out: string[] = [];
  const u = ctx.username.trim();
  if (u) {
    const lower = u.toLowerCase();
    out.push(u, lower, `${lower}123`, `${lower}1`, `${lower}12345`, `${lower}@123`, `${lower}2024`, `${lower}2025`, `${lower}!`);
  }
  if (ctx.siteTitle) {
    const t = ctx.siteTitle.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (t) out.push(t, `${t}123`, `${t}2024`, `${t}@123`);
  }
  return out;
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of list) {
    const v = p.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function buildPrompt(ctx: BruteContext, cap: number): string {
  return [
    `Target username: ${ctx.username}`,
    `Site title: ${ctx.siteTitle ?? "unknown"}`,
    `WordPress version: ${ctx.wpVersion ?? "unknown"}`,
    `Findings: ${ctx.findings.map((f) => f.title).join("; ") || "none"}`,
    "",
    `Return up to ${cap} candidate passwords, most likely first.`,
  ].join("\n");
}
