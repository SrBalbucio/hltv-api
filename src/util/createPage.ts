import { Browser, launch, Page } from "puppeteer";

import { HLTVError } from "../error/HLTVError";
import { HEADLESS } from "../service/env";

const headless = HEADLESS?.toLocaleLowerCase() === "true";

const BROWSER_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-dev-shm-usage",
];

type CreatePageReturn = [Page, Browser];

export async function createPage(): Promise<CreatePageReturn> {
  const browser = await launch({
    headless,
    args: BROWSER_ARGS,
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36"
  );

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

/**
 * Throws a 503 HLTVError when Cloudflare served its "Just a moment..."
 * challenge instead of the page. Call right after page.goto so routes
 * fail loudly instead of returning (and caching) empty results.
 */
export async function assertNotChallenged(page: Page) {
  const challenged = await page.evaluate(() => {
    const title = document.title || "";
    return (
      title.toLowerCase().includes("just a moment") ||
      Boolean(
        document.querySelector(
          "#challenge-form, .cf-browser-verification, #cf-challenge-running"
        )
      )
    );
  });

  if (challenged) {
    throw new HLTVError(
      503,
      "HLTV is behind a Cloudflare challenge right now. Try again later."
    );
  }
}
