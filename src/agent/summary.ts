import { Agent } from "@mastra/core/agent";
import type { LanguageModelV1 } from "ai";
import type {
  BruteForceResult,
  DiscoveredUser,
  EnumerationPlan,
  ReconResult,
} from "../types.js";

export interface SummaryInput {
  recon: ReconResult;
  plan: EnumerationPlan;
  users: DiscoveredUser[];
  bruteForce: BruteForceResult;
}

const REPORTER_INSTRUCTIONS = [
  "You are a security reporter for an authorized WordPress user-enumeration tool.",
  "Write a concise, factual summary of what was found and why it matters.",
  "Cover: whether the target is WordPress, which usernames were discovered and how,",
  "any weak credentials found, and the practical risk (brute-force, social engineering).",
  "Be direct and professional. Do not invent findings beyond the provided data.",
].join(" ");

export async function buildSummary(
  model: LanguageModelV1 | null,
  input: SummaryInput,
): Promise<{ text: string; source: "ai" | "deterministic" }> {
  if (!model) return { text: deterministicSummary(input), source: "deterministic" };

  const agent = new Agent({
    name: "wp-enum-reporter",
    instructions: REPORTER_INSTRUCTIONS,
    model,
  });

  try {
    const { text } = await agent.generate(buildSummaryPrompt(input));
    return { text: text.trim(), source: "ai" };
  } catch {
    return { text: deterministicSummary(input), source: "deterministic" };
  }
}

function deterministicSummary(input: SummaryInput): string {
  const { recon, users, bruteForce } = input;
  const lines: string[] = [];

  if (!recon.isWordPress) {
    return "The target does not appear to be a WordPress site; no WordPress enumeration was performed.";
  }

  const version = recon.wpVersion ? ` (version ${recon.wpVersion})` : "";
  lines.push(`The target is a WordPress site${version}.`);

  if (users.length === 0) {
    lines.push("No usernames were discovered with the techniques run.");
  } else {
    const names = users.map((u) => u.username).join(", ");
    const vectors = [...new Set(users.flatMap((u) => u.sources))].join(", ");
    lines.push(
      `Discovered ${users.length} username(s): ${names}, via ${vectors || "enumeration"}.`,
    );
  }

  if (bruteForce.attempted) {
    if (bruteForce.foundPassword) {
      lines.push(
        `Weak credentials confirmed: ${bruteForce.username}:${bruteForce.foundPassword}. This grants administrative access and is critical.`,
      );
    } else {
      lines.push(
        `A login brute-force on ${bruteForce.username ?? "the admin account"} did not recover a password in ${bruteForce.triedCount} attempt(s).`,
      );
    }
  }

  const risks: string[] = [];
  if (recon.signals.restUsers === "open") risks.push("public REST user listing");
  if (recon.signals.xmlrpc) risks.push("XML-RPC enabled (brute-force amplification)");
  if (recon.signals.userSitemap) risks.push("public user sitemap");
  if (risks.length) {
    lines.push(`Exposed surfaces increasing risk: ${risks.join("; ")}.`);
  }

  return lines.join(" ");
}

function buildSummaryPrompt(input: SummaryInput): string {
  return [
    "Recon:",
    JSON.stringify(
      { isWordPress: input.recon.isWordPress, version: input.recon.wpVersion, signals: input.recon.signals },
      null,
      2,
    ),
    "",
    "Plan rationale:",
    input.plan.rationale,
    "",
    "Discovered users:",
    input.users.length
      ? input.users.map((u) => `- ${u.username} (via ${u.sources.join(", ")}; ${u.evidence})`).join("\n")
      : "(none)",
    "",
    "Brute-force:",
    input.bruteForce.detail,
    "",
    "Write the summary report.",
  ].join("\n");
}
