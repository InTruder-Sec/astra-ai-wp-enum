import type { HttpClient } from "../http/client.js";
import type { ReconFinding, ReconResult, SignalState } from "../types.js";

export async function runRecon(http: HttpClient, target: string): Promise<ReconResult> {
  const findings: ReconFinding[] = [];

  const home = await http.get(`${target}/`);
  const homeBody = home.body || "";
  const isWordPress =
    /\/wp-(content|includes)\//i.test(homeBody) ||
    /<meta name="generator" content="WordPress/i.test(homeBody) ||
    /\/wp-json\//i.test(homeBody);

  let wpVersion = extractVersion(homeBody);

  const readme = await http.get(`${target}/readme.html`);
  if (readme.status === 200 && /WordPress/i.test(readme.body)) {
    const m = readme.body.match(/Version\s+([0-9.]+)/i);
    if (m && !wpVersion) wpVersion = m[1];
    findings.push({
      id: "readme_exposed",
      title: "readme.html is publicly accessible",
      severity: "low",
      detail: "The default readme.html is reachable and discloses the WordPress version.",
      evidence: `${target}/readme.html`,
    });
  }

  if (wpVersion) {
    findings.push({
      id: "wp_version",
      title: `WordPress version ${wpVersion}`,
      severity: "info",
      detail: "The WordPress version is discoverable, aiding version-specific exploitation.",
      evidence: wpVersion,
    });
  }

  const restUsers = await probeRestUsers(http, target);
  if (restUsers === "open") {
    findings.push({
      id: "rest_users_open",
      title: "REST API user endpoint is public",
      severity: "medium",
      detail: "/wp-json/wp/v2/users returns user objects without authentication.",
      evidence: `${target}/wp-json/wp/v2/users`,
    });
  }

  const xmlrpc = await probeXmlrpc(http, target);
  if (xmlrpc) {
    findings.push({
      id: "xmlrpc_enabled",
      title: "XML-RPC is enabled",
      severity: "low",
      detail: "xmlrpc.php is reachable, enabling login brute-force amplification via system.multicall.",
      evidence: `${target}/xmlrpc.php`,
    });
  }

  const userSitemap = await probeUserSitemap(http, target);
  if (userSitemap) {
    findings.push({
      id: "user_sitemap",
      title: "Core user sitemap is public",
      severity: "info",
      detail: "wp-sitemap-users-1.xml lists author archives, exposing usernames.",
      evidence: `${target}/wp-sitemap-users-1.xml`,
    });
  }

  const oembed = await probeOembed(http, target);
  const permalinks = await probePermalinks(http, target);

  const debugLog = await http.get(`${target}/wp-content/debug.log`);
  if (debugLog.status === 200 && debugLog.body.length > 0) {
    findings.push({
      id: "debug_log",
      title: "debug.log is publicly accessible",
      severity: "high",
      detail: "wp-content/debug.log is readable and may leak paths, queries, or errors.",
      evidence: `${target}/wp-content/debug.log`,
    });
  }

  return {
    target,
    isWordPress,
    wpVersion,
    permalinks,
    signals: { restUsers, xmlrpc, userSitemap, oembed },
    findings,
  };
}

function extractVersion(html: string): string | undefined {
  const m = html.match(/<meta name="generator" content="WordPress\s+([0-9.]+)/i);
  return m ? m[1] : undefined;
}

async function probeRestUsers(http: HttpClient, target: string): Promise<SignalState> {
  const endpoints = [
    `${target}/wp-json/wp/v2/users`,
    `${target}/?rest_route=/wp/v2/users`,
  ];
  let sawRestricted = false;
  let sawAbsent = false;
  for (const url of endpoints) {
    const res = await http.get(url, { headers: { Accept: "application/json" } });
    if (res.error) continue;
    if (res.status === 401 || res.status === 403) {
      sawRestricted = true;
      continue;
    }
    if (res.status === 200 && res.body.trim().startsWith("[")) return "open";
    if (res.status === 404) sawAbsent = true;
  }
  if (sawRestricted) return "restricted";
  if (sawAbsent) return "absent";
  return "unknown";
}

async function probeXmlrpc(http: HttpClient, target: string): Promise<boolean> {
  const res = await http.get(`${target}/xmlrpc.php`);
  if (res.error) return false;
  if (res.status === 405) return true;
  return /XML-RPC server accepts POST requests only/i.test(res.body);
}

async function probeUserSitemap(http: HttpClient, target: string): Promise<boolean> {
  const res = await http.get(`${target}/wp-sitemap-users-1.xml`);
  return res.status === 200 && /<urlset|\/author\//i.test(res.body);
}

async function probeOembed(http: HttpClient, target: string): Promise<boolean> {
  const endpoints = [`${target}/wp-json/`, `${target}/?rest_route=/`];
  for (const url of endpoints) {
    const res = await http.get(url, { headers: { Accept: "application/json" } });
    if (res.status === 200 && /oembed/i.test(res.body)) return true;
  }
  return false;
}

async function probePermalinks(
  http: HttpClient,
  target: string,
): Promise<"pretty" | "plain" | "unknown"> {
  const res = await http.get(`${target}/?author=1`, { redirect: "manual" });
  if (res.error) return "unknown";
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location") || "";
    if (/\/author\//i.test(loc)) return "pretty";
  }
  if (res.status === 200) return "plain";
  return "unknown";
}
