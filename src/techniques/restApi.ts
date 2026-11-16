import type { Technique, TechniqueContext } from "./index.js";
import type { DiscoveredUser, ReconResult, TechniqueResult } from "../types.js";

const ID = "rest_api";

interface WpRestUser {
  id?: number;
  name?: string;
  slug?: string;
}

export function parseRestUsers(body: string, endpoint: string): DiscoveredUser[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const users: DiscoveredUser[] = [];
  for (const raw of data as WpRestUser[]) {
    const username = (raw.slug || raw.name || "").trim();
    if (!username) continue;
    users.push({
      username,
      displayName: raw.name,
      id: typeof raw.id === "number" ? raw.id : undefined,
      sources: [ID],
      evidence: `${endpoint} exposed id=${raw.id ?? "?"} slug="${raw.slug ?? ""}"`,
    });
  }
  return users;
}

function parseSingleRestUser(body: string, endpoint: string): DiscoveredUser | undefined {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const raw = data as WpRestUser;
  const username = (raw.slug || raw.name || "").trim();
  if (!username) return undefined;
  return {
    username,
    displayName: raw.name,
    id: typeof raw.id === "number" ? raw.id : undefined,
    sources: [ID],
    evidence: `${endpoint} exposed slug="${raw.slug ?? ""}"`,
  };
}

export const restApiTechnique: Technique = {
  id: ID,
  title: "REST API user exposure",
  description:
    "Queries /wp-json/wp/v2/users (with ?rest_route and per-id fallbacks) for unauthenticated user objects. Highest-signal vector.",

  isRelevant(recon: ReconResult): boolean {
    return recon.signals.restUsers !== "absent";
  },

  async run(ctx: TechniqueContext): Promise<TechniqueResult> {
    const listEndpoints = [
      { url: `${ctx.target}/wp-json/wp/v2/users?per_page=100`, label: "/wp-json/wp/v2/users" },
      { url: `${ctx.target}/?rest_route=/wp/v2/users&per_page=100`, label: "?rest_route=/wp/v2/users" },
    ];

    let restricted = false;
    let lastError: string | undefined;

    for (const ep of listEndpoints) {
      const res = await ctx.http.get(ep.url, { headers: { Accept: "application/json" } });
      if (res.error) {
        lastError = res.error;
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        restricted = true;
        continue;
      }
      if (res.status !== 200) continue;

      const users = parseRestUsers(res.body, ep.label);
      if (users.length > 0) {
        return {
          technique: ID,
          success: true,
          users,
          detail: `Exposed ${users.length} user object(s) via the unauthenticated REST API (${ep.label}).`,
        };
      }
    }

    if (restricted) {
      const perIdUsers = await probePerId(ctx);
      if (perIdUsers.length > 0) {
        return {
          technique: ID,
          success: true,
          users: perIdUsers,
          detail: `List endpoint restricted, but per-id lookup leaked ${perIdUsers.length} user(s).`,
        };
      }
      return {
        technique: ID,
        success: false,
        users: [],
        detail: "REST users endpoint is access-restricted (HTTP 401/403).",
      };
    }

    if (lastError) {
      return {
        technique: ID,
        success: false,
        users: [],
        detail: `Network error querying REST API: ${lastError}`,
        error: lastError,
      };
    }

    return {
      technique: ID,
      success: false,
      users: [],
      detail: "REST API reachable but returned no user objects.",
    };
  },
};

async function probePerId(ctx: TechniqueContext): Promise<DiscoveredUser[]> {
  const found: DiscoveredUser[] = [];
  for (let id = 1; id <= ctx.authorIdRange; id++) {
    const url = `${ctx.target}/?rest_route=/wp/v2/users/${id}`;
    const res = await ctx.http.get(url, { headers: { Accept: "application/json" } });
    if (res.status !== 200) continue;
    const user = parseSingleRestUser(res.body, `?rest_route=/wp/v2/users/${id}`);
    if (user) found.push(user);
  }
  return found;
}
