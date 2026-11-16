import type { Technique, TechniqueContext } from "./index.js";
import type { DiscoveredUser, ReconResult, TechniqueResult } from "../types.js";

const ID = "login_error";

const CANDIDATES = [
  "admin",
  "administrator",
  "editor",
  "author",
  "test",
  "user",
  "wordpress",
  "support",
  "webmaster",
  "demo",
  "root",
  "guest",
];

const EXISTS = /password you entered|incorrect password|is incorrect/i;
const NOT_EXISTS = /not registered|invalid username|unknown username|is not valid/i;

const TEST_COOKIE = "wordpress_test_cookie=WP Cookie check";

async function probe(ctx: TechniqueContext, username: string): Promise<string> {
  const res = await ctx.http.post(`${ctx.target}/wp-login.php`, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: TEST_COOKIE,
    },
    body: new URLSearchParams({
      log: username,
      pwd: "an-intentionally-wrong-password",
      "wp-submit": "Log In",
      testcookie: "1",
    }).toString(),
    redirect: "manual",
  });
  return res.body || "";
}

function userExists(body: string): boolean {
  return EXISTS.test(body) && !NOT_EXISTS.test(body);
}

export const loginErrorTechnique: Technique = {
  id: ID,
  title: "Login error differential",
  description:
    "Submits wrong-password logins and uses the valid-vs-invalid error wording to confirm which common usernames exist.",

  isRelevant(recon: ReconResult): boolean {
    return recon.isWordPress;
  },

  async run(ctx: TechniqueContext): Promise<TechniqueResult> {
    const baseline = await probe(ctx, `zz_nouser_${Date.now()}`);
    if (baseline === "") {
      return {
        technique: ID,
        success: false,
        users: [],
        detail: "Login form did not respond usefully; cannot test error differential.",
      };
    }
    if (userExists(baseline)) {
      return {
        technique: ID,
        success: false,
        users: [],
        detail: "Login errors do not distinguish users (generic message) - enumeration not possible here.",
      };
    }

    const users: DiscoveredUser[] = [];
    for (const candidate of CANDIDATES) {
      const body = await probe(ctx, candidate);
      if (userExists(body)) {
        users.push({
          username: candidate,
          sources: [ID],
          evidence: `wp-login.php returned a "password incorrect" error for "${candidate}" (valid user).`,
        });
      }
    }

    if (users.length === 0) {
      return {
        technique: ID,
        success: false,
        users: [],
        detail: `No common usernames confirmed via the login error differential (${CANDIDATES.length} tried).`,
      };
    }

    return {
      technique: ID,
      success: true,
      users,
      detail: `Confirmed ${users.length} username(s) via the login error differential.`,
    };
  },
};
