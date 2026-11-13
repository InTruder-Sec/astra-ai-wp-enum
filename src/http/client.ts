export interface HttpResponse {
  ok: boolean;
  status: number;
  url: string;
  headers: Headers;
  body: string;
  error?: string;
}

export interface HttpOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  redirect?: "follow" | "manual";
}

export interface HttpClientDefaults {
  timeoutMs: number;
  retries: number;
  userAgent: string;
}

const DEFAULT_UA = "wp-user-enum/1.0 (+authorized-security-testing)";

export class HttpClient {
  constructor(
    private readonly defaults: HttpClientDefaults = {
      timeoutMs: 10_000,
      retries: 2,
      userAgent: DEFAULT_UA,
    },
  ) {}

  async request(url: string, opts: HttpOptions = {}): Promise<HttpResponse> {
    const retries = opts.retries ?? this.defaults.retries;
    const timeoutMs = opts.timeoutMs ?? this.defaults.timeoutMs;
    let lastError = "";

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: opts.method ?? "GET",
          headers: {
            "User-Agent": this.defaults.userAgent,
            Accept: "*/*",
            ...opts.headers,
          },
          body: opts.body,
          redirect: opts.redirect ?? "follow",
          signal: controller.signal,
        });
        const body = await res.text();
        return {
          ok: res.ok,
          status: res.status,
          url: res.url,
          headers: res.headers,
          body,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < retries) {
          await sleep(250 * (attempt + 1));
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }

    return {
      ok: false,
      status: 0,
      url,
      headers: new Headers(),
      body: "",
      error: lastError || "request failed",
    };
  }

  get(url: string, opts: HttpOptions = {}): Promise<HttpResponse> {
    return this.request(url, { ...opts, method: "GET" });
  }

  post(url: string, opts: HttpOptions = {}): Promise<HttpResponse> {
    return this.request(url, { ...opts, method: "POST" });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
