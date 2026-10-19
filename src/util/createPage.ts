import { Browser, launch, Page } from "puppeteer";
import path from "path";

import { HLTVError } from "../error/HLTVError";
import { CF_CHALLENGE_WAIT_MS, HEADLESS } from "../service/env";

const headless = HEADLESS?.toLocaleLowerCase() === "true";

const BROWSER_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-dev-shm-usage",
];

/**
 * Persistent Chromium profile. Cookies such as cf_clearance survive browser
 * restarts, so a Cloudflare challenge solved once (automatically or by hand
 * in headed mode) is reused by every later request until it expires.
 */
const USER_DATA_DIR = path.resolve("data", "chrome-profile");

let browserSingleton: Browser | null = null;
let launching: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (browserSingleton?.connected) {
    return Promise.resolve(browserSingleton);
  }

  if (!launching) {
    launching = launch({
      headless,
      args: BROWSER_ARGS,
      userDataDir: USER_DATA_DIR,
    })
      .then((browser) => {
        browserSingleton = browser;
        browser.on("disconnected", () => {
          if (browserSingleton === browser) {
            browserSingleton = null;
          }
        });
        return browser;
      })
      .catch((error) => {
        launching = null;
        throw error;
      });
  }

  return launching;
}

type CreatePageReturn = [Page, Browser];

/**
 * Opens a page on the shared persistent browser. The browser stays alive for
 * the whole process (closures are per page via `page.close()`), which keeps
 * the Cloudflare clearance cookie warm across requests.
 */
export async function createPage(): Promise<CreatePageReturn> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  // Keep the UA consistent with the real engine and identical between
  // modes: CF tokens are UA-bound, and "HeadlessChrome" is an instant flag.
  const nativeUa = await page.evaluate(() => navigator.userAgent);
  await page.setUserAgent(nativeUa.replace("HeadlessChrome", "Chrome"));

  await page.setRequestInterception(true);

  page.on("request", (request) => {
    if (
      ["image", "stylesheet", "font"].indexOf(
        request.resourceType()
      ) !== -1
    ) {
      request.abort();
    } else {
      request.continue();
    }
  });

  return [page, browser];
}

const challenged = (page: Page) =>
  page
    .evaluate(() => {
      const title = document.title || "";
      return (
        title.toLowerCase().includes("just a moment") ||
        Boolean(
          document.querySelector(
            "#challenge-form, .cf-browser-verification, #cf-challenge-running"
          )
        )
      );
    })
    .catch(() => true);

/**
 * Fails with 503 when Cloudflare served its "Just a moment..." challenge.
 * Before failing, waits up to CF_CHALLENGE_WAIT_MS for the challenge to
 * clear — Cloudflare auto-passes sometimes, and in headed mode a human can
 * solve it in the window. Once solved, the page is reloaded with the fresh
 * clearance cookie (persisted in the shared profile).
 */
export async function assertNotChallenged(page: Page) {
  if (!(await challenged(page))) {
    return;
  }

  const deadline = Date.now() + CF_CHALLENGE_WAIT_MS;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    if (await challenged(page)) {
      continue;
    }

    // Clearance obtained — reload the original URL so the caller sees the
    // real page instead of a solved-challenge document.
    await page
      .reload({ waitUntil: "domcontentloaded", timeout: 60000 })
      .catch(() => {});

    if (!(await challenged(page))) {
      return;
    }
  }

  throw new HLTVError(
    503,
    "HLTV is behind a Cloudflare challenge right now. Try again later."
  );
}
