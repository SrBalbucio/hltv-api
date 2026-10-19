import dotenv from "dotenv";

dotenv.config();

export const REDIS_URL = process.env.REDIS_URL;
export const HEADLESS = process.env.HEADLESS;
export const PORT = process.env.PORT || 8080;

/** How long to wait for a Cloudflare challenge to clear before answering 503. */
export const CF_CHALLENGE_WAIT_MS = Number(process.env.CF_CHALLENGE_WAIT_MS) || 30000;
