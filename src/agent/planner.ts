import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import type { LanguageModelV1 } from "ai";
import type { EnumerationPlan, ReconResult } from "../types.js";
import type { Technique } from "../techniques/index.js";

const planSchema = z.object({
  techniques: z.array(z.string()),
  rationale: z.string(),
  bruteForce: z.boolean(),
});

const PLANNER_INSTRUCTIONS = [
  "You are the planning component of an authorized WordPress user-enumeration tool.",
  "You are given recon signals about a target and a list of available enumeration techniques.",
  "Choose which techniques to run and in what order, and whether a login brute-force is warranted.",
  "Only choose technique ids from the provided list; never invent ids.",
  "Prefer quiet, high-signal techniques first; skip techniques whose required surface is absent.",
].join(" ");

export async function buildPlan(
  model: LanguageModelV1 | null,
  recon: ReconResult,
  techniques: Technique[],
): Promise<EnumerationPlan> {
  const relevant = techniques.filter((t) => t.isRelevant(recon));

  if (!model) return deterministicPlan(recon, relevant);

  const agent = new Agent({
    name: "wp-enum-planner",
    instructions: PLANNER_INSTRUCTIONS,
    model,
  });

  try {
    const { object } = await agent.generate(buildPlannerPrompt(recon, techniques), {
      output: planSchema,
    });
    const known = new Set(techniques.map((t) => t.id));
    const chosen = object.techniques.filter((id) => known.has(id));
    return {
      techniques: chosen.length ? chosen : relevant.map((t) => t.id),
      rationale: object.rationale,
      bruteForce: object.bruteForce,
      source: "ai",
    };
  } catch {
    return deterministicPlan(recon, relevant);
  }
}

function deterministicPlan(recon: ReconResult, relevant: Technique[]): EnumerationPlan {
  const ids = relevant.map((t) => t.id);
  return {
    techniques: ids,
    rationale: ids.length
      ? `Deterministic selection: ${ids.length} technique(s) match the recon signals (${summariseSignals(recon)}).`
      : `No enumeration techniques are registered yet. Recon signals: ${summariseSignals(recon)}.`,
    bruteForce: recon.isWordPress,
    source: "deterministic",
  };
}

function summariseSignals(recon: ReconResult): string {
  const s = recon.signals;
  return [
    `permalinks=${recon.permalinks}`,
    `restUsers=${s.restUsers}`,
    `xmlrpc=${s.xmlrpc}`,
    `userSitemap=${s.userSitemap}`,
    `oembed=${s.oembed}`,
  ].join(", ");
}

function buildPlannerPrompt(recon: ReconResult, techniques: Technique[]): string {
  const techList = techniques.length
    ? techniques
        .map((t) => `- ${t.id}: ${t.description} (relevant=${t.isRelevant(recon)})`)
        .join("\n")
    : "(none registered)";
  return [
    "Recon signals:",
    JSON.stringify(recon.signals, null, 2),
    `permalinks: ${recon.permalinks}`,
    `wordpress: ${recon.isWordPress} (version ${recon.wpVersion ?? "unknown"})`,
    "",
    "Available techniques:",
    techList,
    "",
    "Return the ordered technique ids to run, a short rationale, and whether to brute-force.",
  ].join("\n");
}
