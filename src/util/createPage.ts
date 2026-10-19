import { Browser, launch, Page } from "puppeteer";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

import { HLTVError } from "../error/HLTVError";
import {
  CF_CHALLENGE_WAIT_MS,
  CAPSOLVER_PROXY,
  HEADLESS,
} from "../service/env";
import {
  capsolverEnabled,
  parseProxy,
  solveCloudflareChallenge,
} from "../service/capsolver";

const execAsync = promisify(exec);

const headless = HEADLESS?.toLocaleLowerCase() === "true";

const proxyConfig = parseProxy(CAPSOLVER_PROXY);

const BROWSER_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  // CapSolver's clearance is bound to the solving IP: when configured, all
  // traffic must exit through the same proxy the challenge is solved from.
  ...(proxyConfig ? [`--proxy-server=${proxyConfig.server}`] : []),
];

/**
 * Persistent Chromium profile. Cookies such as cf_clearance survive browser
 * restarts, so a Cloudflare challenge solved once (automatically or by hand
 * in headed mode) is reused by every later request until it expires.
 */
const USER_DATA_DIR = path.resolve("data", "chrome-profile");

let browserSingleton: Browser | null = null;
let launching: Promise<Browser> | null = null;

/**
 * Kills leftover Chromium processes bound to OUR profile (e.g. after a crash
 * or an unclean process.exit, the child survives and keeps the profile lock).
 * Matches only the profile path in the command line, so a user's own browser
 * is never touched.
 */
async function killOrphanedBrowser() {
  try {
    if (process.platform === "win32") {
      await execAsync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process | ` +
          `Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*${USER_DATA_DIR}*' } | ` +
          `ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`
      );
    } else {
      await execAsync(`pkill -f "user-data-dir=${USER_DATA_DIR}" || true`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  } catch {
    // nothing left to kill
  }
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await launch({
      headless,
      args: BROWSER_ARGS,
      userDataDir: USER_DATA_DIR,
    });
  } catch (error: any) {
    const locked = String(error?.message || "").includes("already running");
    if (!locked) throw error;

    console.error(
      "[createPage] profile locked — killing orphaned browser and retrying"
    );
    await killOrphanedBrowser();

    return launch({
      headless,
      args: BROWSER_ARGS,
      userDataDir: USER_DATA_DIR,
    });
  }
}

function getBrowser(): Promise<Browser> {
  if (browserSingleton?.connected) {
    return Promise.resolve(browserSingleton);
  }

  if (!launching) {
    launching = launchBrowser()
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

// Clean up the child on process exit so the profile lock is released.
process.once("exit", () => {
  try {
    browserSingleton?.process()?.kill();
  } catch {
    // already gone
  }
});

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

  if (proxyConfig?.username) {
    // HTTP proxies only; socks5 proxies do not support 401 authentication.
    await page
      .authenticate({
        username: proxyConfig.username,
        password: proxyConfig.password || "",
      })
      .catch(() => {});
  }

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
 * Recovery order (cheapest first):
 *   1. passive wait — Cloudflare auto-passes sometimes, and in headed mode
 *      a human can solve it in the window;
 *   2. CapSolver solve (only when CAPSOLVER_API_KEY + CAPSOLVER_PROXY are
 *      set) — injects the returned cf_clearance into the persistent profile;
 * if nothing works, throws 503 (never an empty feed).
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

  if (capsolverEnabled()) {
    const websiteURL = page.url();
    const html = await page.content().catch(() => undefined);
    const userAgent = await page
      .evaluate(() => navigator.userAgent)
      .catch(() => undefined);

    const clearance = await solveCloudflareChallenge(
      websiteURL,
      html,
      userAgent || ""
    );

    if (clearance) {
      await page
        .setCookie({
          name: "cf_clearance",
          value: clearance,
          domain: ".hltv.org",
          path: "/",
          secure: true,
          httpOnly: true,
        })
        .catch(() => {});

      await page
        .reload({ waitUntil: "domcontentloaded", timeout: 60000 })
        .catch(() => {});

      if (!(await challenged(page))) {
        return;
      }
    }
  }

  throw new HLTVError(
    503,
    "HLTV is behind a Cloudflare challenge right now. Try again later."
  );
}
