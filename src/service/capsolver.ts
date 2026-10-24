import { CAPSOLVER_API_KEY, CAPSOLVER_PROXY } from "./env";

const API_URL = "https://api.capsolver.com";

export interface ProxyConfig {
  /** host:port, passed to Chromium via --proxy-server */
  server: string;
  username?: string;
  password?: string;
  /** "host:port:user:pass" format expected by CapSolver's task */
  taskFormat: string;
}

/**
 * Accepts "host:port", "host:port:user:pass" or "http(s)://user:pass@host:port".
 */
export function parseProxy(raw: string | undefined): ProxyConfig | null {
  if (!raw) return null;

  let host: string;
  let port: string;
  let username: string | undefined;
  let password: string | undefined;

  if (raw.includes("://")) {
    try {
      const url = new URL(raw);
      host = url.hostname;
      port = url.port;
      username = url.username || undefined;
      password = url.password || undefined;
    } catch {
      return null;
    }
  } else {
    const parts = raw.split(":");
    if (parts.length < 2) return null;
    [host, port, username, password] = parts;
  }

  if (!host || !port) return null;

  return {
    server: `http://${host}:${port}`,
    username,
    password,
    taskFormat: [host, port, username, password].filter(Boolean).join(":"),
  };
}

export const capsolverEnabled = () =>
  Boolean(CAPSOLVER_API_KEY && parseProxy(CAPSOLVER_PROXY));

interface SolveResponse {
  errorId: number;
  errorCode?: string;
  errorDescription?: string;
  taskId?: string;
  status?: string;
  solution?: {
    cookies?: Record<string, string>;
    userAgent?: string;
  };
}

async function call<T = SolveResponse>(path: string, payload: unknown) {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await response.json()) as T;
}

// Single-flight: N concurrent challenged requests trigger ONE paid solve,
// and the solved clearance is reused for a while (it outlives the request).
let inflightSolve: Promise<string | null> | null = null;
let lastSolvedAt = 0;
const SOLVE_REUSE_MS = 10 * 60 * 1000; // 10 minutes

async function doSolve(
  websiteURL: string,
  html: string | undefined,
  userAgent: string
): Promise<string | null> {
  const proxy = parseProxy(CAPSOLVER_PROXY);

  const created = await call("createTask", {
    clientKey: CAPSOLVER_API_KEY,
    task: {
      type: "AntiCloudflareTask",
      websiteURL,
      proxy: proxy?.taskFormat,
      userAgent,
      ...(html ? { html } : {}),
    },
  });

  if (created.errorId !== 0 || !created.taskId) {
    console.error(
      "[capsolver] createTask failed:",
      created.errorCode,
      created.errorDescription
    );
    return null;
  }

  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const result = await call("getTaskResult", {
      clientKey: CAPSOLVER_API_KEY,
      taskId: created.taskId,
    });

    if (result.errorId !== 0) {
      console.error(
        "[capsolver] getTaskResult failed:",
        result.errorCode,
        result.errorDescription
      );
      return null;
    }

    if (result.status === "ready") {
      const clearance = result.solution?.cookies?.cf_clearance;
      if (!clearance) {
        console.error("[capsolver] solution without cf_clearance cookie");
        return null;
      }
      return clearance;
    }
  }

  console.error("[capsolver] timed out waiting for solution");
  return null;
}

/**
 * Solves the Cloudflare challenge through CapSolver and returns the
 * cf_clearance cookie value, or null on any failure (caller falls back
 * to the plain 503 path). Never throws.
 */
export function solveCloudflareChallenge(
  websiteURL: string,
  html: string | undefined,
  userAgent: string
): Promise<string | null> {
  if (!capsolverEnabled()) {
    console.log(`[capsolver] disabled, skipping solve for ${websiteURL}`);
    return Promise.resolve(null);
  }

  if (Date.now() - lastSolvedAt < SOLVE_REUSE_MS && !inflightSolve) {
    // Recently solved — the cookie should still be valid in the profile.
    return Promise.resolve(null);
  }

  if (!inflightSolve) {
    console.log(`[capsolver] solving challenge for ${websiteURL}`);
    inflightSolve = doSolve(websiteURL, html, userAgent)
      .then((clearance) => {
        if (clearance) lastSolvedAt = Date.now();
        console.log(`[capsolver] solve ${clearance ? "ok" : "empty"} for ${websiteURL}`);
        return clearance;
      })
      .catch((error) => {
        console.error("[capsolver] solve error:", error);
        return null;
      })
      .finally(() => {
        inflightSolve = null;
      });
  }

  return inflightSolve;
}
