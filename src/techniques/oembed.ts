import type { Technique, TechniqueContext } from "./index.js";
import type { DiscoveredUser, ReconResult, TechniqueResult } from "../types.js";

const ID = "oembed";

async function firstPostUrl(ctx: TechniqueContext): Promise<string | undefined> {
  const endpoints = [
    `${ctx.target}/wp-json/wp/v2/posts?per_page=1`,
    `${ctx.target}/?rest_route=/wp/v2/posts&per_page=1`,
  ];
  for (const url of endpoints) {
    const res = await ctx.http.get(url, { headers: { Accept: "application/json" } });
    if (res.status !== 200) continue;
    try {
      const data = JSON.parse(res.body);
      if (Array.isArray(data) && data[0]?.link) return String(data[0].link);
      if (Array.isArray(data) && typeof data[0]?.id === "number") {
        return `${ctx.target}/?p=${data[0].id}`;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function usernameFromOembed(body: string): DiscoveredUser | undefined {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (!data || typeof data !== "object") return undefined;
  const o = data as { author_name?: string; author_url?: string };
  const slugMatch = (o.author_url || "").match(/\/author\/([^/?#]+)/i);
  const username = slugMatch?.[1]
    ? decodeURIComponent(slugMatch[1]).toLowerCase()
    : (o.author_name || "").trim();
  if (!username) return undefined;
  return {
    username,
    displayName: o.author_name,
    sources: [ID],
    evidence: `oEmbed author_name="${o.author_name ?? ""}" author_url="${o.author_url ?? ""}"`,
  };
}

export const oembedTechnique: Technique = {
  id: ID,
  title: "oEmbed author disclosure",
  description:
    "Resolves a published post, then reads /wp-json/oembed/1.0/embed to leak the post author's name/slug. Often survives other hardening.",

  isRelevant(recon: ReconResult): boolean {
    return recon.signals.oembed === true;
  },

  async run(ctx: TechniqueContext): Promise<TechniqueResult> {
    const postUrl = await firstPostUrl(ctx);
    if (!postUrl) {
      return {
        technique: ID,
        success: false,
        users: [],
        detail: "Could not resolve a published post to query oEmbed.",
      };
    }

    const endpoints = [
      `${ctx.target}/wp-json/oembed/1.0/embed?url=${encodeURIComponent(postUrl)}&format=json`,
      `${ctx.target}/?rest_route=/oembed/1.0/embed&url=${encodeURIComponent(postUrl)}&format=json`,
    ];

    for (const url of endpoints) {
      const res = await ctx.http.get(url, { headers: { Accept: "application/json" } });
      if (res.status !== 200) continue;
      const user = usernameFromOembed(res.body);
      if (user) {
        return {
          technique: ID,
          success: true,
          users: [user],
          detail: `Recovered author "${user.username}" via oEmbed for ${postUrl}.`,
        };
      }
    }

    return {
      technique: ID,
      success: false,
      users: [],
      detail: "oEmbed endpoint did not disclose an author.",
    };
  },
};
