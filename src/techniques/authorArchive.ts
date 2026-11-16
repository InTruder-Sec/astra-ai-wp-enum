import type { Technique, TechniqueContext } from "./index.js";
import type { DiscoveredUser, ReconResult, TechniqueResult } from "../types.js";

const ID = "author_archive";

export function slugFromAuthorUrl(url: string): string | undefined {
  const m = url.match(/\/author\/([^/?#]+)/i);
  return m && m[1] ? decodeURIComponent(m[1]) : undefined;
}

export function slugFromBodyClass(html: string): string | undefined {
  const m = html.match(/\bauthor-([a-z0-9][a-z0-9_-]*)\b/i);
  if (m && m[1] && !/^(archive|paged|\d+)$/i.test(m[1])) return m[1].toLowerCase();
  return undefined;
}

export const authorArchiveTechnique: Technique = {
  id: ID,
  title: "Author archive routing",
  description:
    "Probes /?author=N and recovers login slugs from the redirect Location or the page body class. Effective on both pretty and plain permalinks.",

  isRelevant(recon: ReconResult): boolean {
    return recon.isWordPress;
  },

  async run(ctx: TechniqueContext): Promise<TechniqueResult> {
    const found = new Map<number, DiscoveredUser>();
    let networkErrors = 0;

    for (let id = 1; id <= ctx.authorIdRange; id++) {
      const res = await ctx.http.get(`${ctx.target}/?author=${id}`, { redirect: "manual" });
      if (res.error) {
        networkErrors++;
        continue;
      }

      let slug: string | undefined;
      let evidence = "";

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location") || "";
        slug = slugFromAuthorUrl(loc);
        if (slug) evidence = `?author=${id} -> ${res.status} Location: ${loc}`;
      }

      if (!slug && res.status === 200) {
        slug = slugFromAuthorUrl(res.url) || slugFromBodyClass(res.body);
        if (slug) evidence = `?author=${id} -> page slug "${slug}"`;
      }

      if (slug) {
        found.set(id, { username: slug, id, sources: [ID], evidence });
      }
    }

    const users = [...found.values()];
    if (users.length === 0) {
      return {
        technique: ID,
        success: false,
        users: [],
        detail:
          networkErrors > 0
            ? `Author enumeration incomplete (${networkErrors} network error(s)).`
            : "No author slugs leaked via ?author=N (redirect disabled or plain permalinks).",
        error: networkErrors > 0 ? "partial network failure" : undefined,
      };
    }

    return {
      technique: ID,
      success: true,
      users,
      detail: `Recovered ${users.length} login slug(s) via ?author=N.`,
    };
  },
};
