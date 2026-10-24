import dotenv from "dotenv";

dotenv.config();

export const REDIS_URL = process.env.REDIS_URL;
export const HEADLESS = process.env.HEADLESS;
export const PORT = process.env.PORT || 8080;

/** How long to wait for a Cloudflare challenge to clear before answering 503. */
export const CF_CHALLENGE_WAIT_MS = Number(process.env.CF_CHALLENGE_WAIT_MS) || 30000;

/** Finite navigation timeout for page.goto (replaces timeout: 0 = infinite). */
export const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS) || 30000;

/**
 * Optional CapSolver integration (https://capsolver.com), used only when a
 * challenge resists the passive wait. Requires a static/sticky proxy because
 * the returned cf_clearance is bound to the solving IP — the browser is then
 * routed through the same proxy. Both vars must be set to enable it.
 */
export const CAPSOLVER_API_KEY = process.env.CAPSOLVER_API_KEY;
export const CAPSOLVER_PROXY = process.env.CAPSOLVER_PROXY;
