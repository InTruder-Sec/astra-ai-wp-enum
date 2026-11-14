import type { ScanReport } from "../types.js";

export function renderJson(report: ScanReport): string {
  const shaped = {
    target: report.target,
    started_at: report.startedAt,
    finished_at: report.finishedAt,
    wordpress: {
      detected: report.recon.isWordPress,
      version: report.recon.wpVersion ?? null,
      permalinks: report.recon.permalinks,
    },
    recon: {
      signals: report.recon.signals,
      findings: report.recon.findings,
    },
    plan: {
      source: report.plan.source,
      techniques: report.plan.techniques,
      rationale: report.plan.rationale,
      brute_force: report.plan.bruteForce,
    },
    techniques_used: report.techniquesUsed,
    users: report.users.map((u) => ({
      username: u.username,
      id: u.id ?? null,
      display_name: u.displayName ?? null,
      sources: u.sources,
      evidence: u.evidence,
    })),
    brute_force: {
      attempted: report.bruteForce.attempted,
      username: report.bruteForce.username ?? null,
      password_found: report.bruteForce.foundPassword ?? null,
      tried: report.bruteForce.triedCount,
      detail: report.bruteForce.detail,
    },
    summary_source: report.summarySource,
    ai_provider: report.aiProvider ?? null,
    ai_summary: report.aiSummary,
  };
  return JSON.stringify(shaped, null, 2);
}

export function renderPretty(report: ScanReport): string {
  const out: string[] = [];
  const line = (s = "") => out.push(s);

  line(`[+] Target: ${report.target}`);
  line(`[+] Starting WordPress user enumeration...`);
  line();

  if (!report.recon.isWordPress) {
    line(`[-] Target does not appear to be WordPress. Nothing to enumerate.`);
    line();
    line(`[AI Agent] Summary:`);
    line(report.aiSummary);
    return out.join("\n");
  }

  const v = report.recon.wpVersion ? ` ${report.recon.wpVersion}` : "";
  line(`[Recon] WordPress${v} detected (${report.recon.permalinks} permalinks)`);
  const s = report.recon.signals;
  line(`        REST users: ${s.restUsers} | XML-RPC: ${onOff(s.xmlrpc)} | user sitemap: ${onOff(s.userSitemap)} | oEmbed: ${onOff(s.oembed)}`);
  if (report.recon.findings.length) {
    line(`[Recon] Findings:`);
    for (const f of report.recon.findings) line(`        [${f.severity}] ${f.title}`);
  }
  line();

  line(`[AI Agent] Plan (${report.plan.source}):`);
  line(`        ${report.plan.rationale}`);
  if (report.plan.techniques.length) {
    line(`        -> techniques: ${report.plan.techniques.join(", ")}`);
  }
  line();

  if (report.users.length) {
    line(`[+] Found ${report.users.length} username(s):`);
    for (const u of report.users) {
      const id = u.id !== undefined ? `#${u.id} ` : "";
      line(`      - ${id}${u.username}  (via ${u.sources.join(", ")})`);
      line(`        evidence: ${u.evidence}`);
    }
  } else {
    line(`[-] No usernames discovered.`);
  }
  line();

  if (report.bruteForce.attempted) {
    line(`[Brute-force] ${report.bruteForce.detail}`);
    line();
  }

  line(`[AI Agent] Summary:`);
  line(report.aiSummary);
  line();
  line(`[✓] Enumeration complete.`);

  return out.join("\n");
}

function onOff(b: boolean): string {
  return b ? "enabled" : "absent";
}
