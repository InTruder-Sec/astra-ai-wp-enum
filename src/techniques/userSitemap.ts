import type { Technique, TechniqueContext } from "./index.js";
import type { DiscoveredUser, ReconResult, TechniqueResult } from "../types.js";

const ID = "user_sitemap";

export function parseSitemapSlugs(xml: string): string[] {
  const slugs = new Set<string>();
  const re = /\/author\/([^/<>"?#]+)\/?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1]) slugs.add(decodeURIComponent(m[1]).toLowerCase());
  }
  return [...slugs];
}

export const userSitemapTechnique: Technique = {
  id: ID,
  title: "Core user sitemap",
  description:
    "Reads /wp-sitemap-users-1.xml (WordPress >= 5.5), which lists author archive URLs and therefore usernames.",

  isRelevant(recon: ReconResult): boolean {
    return recon.signals.userSitemap === true;
  },

  async run(ctx: TechniqueContext): Promise<TechniqueResult> {
    const endpoint = `${ctx.target}/wp-sitemap-users-1.xml`;
    const res = await ctx.http.get(endpoint);

    if (res.error) {
      return {
        technique: ID,
        success: false,
        users: [],
        detail: `Network error reading user sitemap: ${res.error}`,
        error: res.error,
      };
    }
    if (res.status !== 200) {
      return {
        technique: ID,
        success: false,
        users: [],
        detail: `User sitemap not available (HTTP ${res.status}).`,
      };
    }

    const slugs = parseSitemapSlugs(res.body);
    if (slugs.length === 0) {
      return {
        technique: ID,
        success: false,
        users: [],
        detail: "User sitemap reachable but contained no author entries.",
      };
    }

    const users: DiscoveredUser[] = slugs.map((slug) => ({
      username: slug,
      sources: [ID],
      evidence: `${endpoint} listed /author/${slug}/`,
    }));

    return {
      technique: ID,
      success: true,
      users,
      detail: `Recovered ${users.length} username(s) from the core user sitemap.`,
    };
  },
};
