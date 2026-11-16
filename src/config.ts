import "dotenv/config";

export type AiProvider = "openai" | "anthropic" | "none";

export interface AiConfig {
  provider: AiProvider;
  model?: string;
  apiKey?: string;
}

export interface AppConfig {
  target: string;
  format: "pretty" | "json";
  authorIdRange: number;
  bruteForce: boolean;
  passwordFile?: string;
  timeoutMs: number;
  retries: number;
  allowRemote: boolean;
  verbose: boolean;
  ai: AiConfig;
}

export function resolveAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const hasOpenAI = !!env.OPENAI_API_KEY?.trim();
  const hasAnthropic = !!env.ANTHROPIC_API_KEY?.trim();
  const forced = env.AI_PROVIDER?.trim().toLowerCase();

  let provider: AiProvider = "none";
  if (hasOpenAI && hasAnthropic) {
    provider = forced === "anthropic" ? "anthropic" : "openai";
  } else if (hasOpenAI) {
    provider = "openai";
  } else if (hasAnthropic) {
    provider = "anthropic";
  }

  if (provider === "openai") {
    return {
      provider,
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    };
  }
  if (provider === "anthropic") {
    return {
      provider,
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL?.trim() || "claude-haiku-5-5",
    };
  }
  return { provider: "none" };
}

const LOCAL_HOST_PATTERN =
  /^(localhost|0\.0\.0\.0|\[::1\]|host\.docker\.internal|.*\.local|.*\.test|.*\.localhost)$/i;

function isPrivateIp(host: string): boolean {
  return (
    /^127(?:\.\d{1,3}){3}$/.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host)
  );
}

export function isLocalTarget(target: string): boolean {
  try {
    const host = new URL(target).hostname;
    return LOCAL_HOST_PATTERN.test(host) || isPrivateIp(host);
  } catch {
    return false;
  }
}

export function normalizeTarget(raw: string): string {
  let t = raw.trim();
  if (!/^https?:\/\//i.test(t)) t = `http://${t}`;
  return t.replace(/\/+$/, "");
}
