import { Page } from "puppeteer";

import { HLTVError } from "../error/HLTVError";
import { NAV_TIMEOUT_MS } from "../service/env";
import { assertNotChallenged } from "./createPage";
import { verifyError } from "./verifyError";

export async function gotoHLTV(page: Page, url: string): Promise<void> {
  const startedAt = Date.now();
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });
    console.log(`[scrape] goto ok ${url} ${Date.now() - startedAt}ms -> ${page.url()}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout|timed out|net::|navigation/i.test(message)) {
      throw new HLTVError(
        504,
        `HLTV navigation timed out after ${NAV_TIMEOUT_MS}ms: ${url}`,
        "NAV_TIMEOUT"
      );
    }
    throw error;
  }
  await assertNotChallenged(page);
  await verifyError(page);
}

export async function throwIfHltvErrorBackground(page: Page, kind: string): Promise<void> {
  const has500Error = await page.evaluate(() => {
    return Boolean(document.querySelector(".error-background"));
  });

  if (has500Error) {
    throw new HLTVError(404, `Not Found ${kind}`, "HLTV_NOT_FOUND");
  }
}

export async function throwIfLayoutMissing(
  page: Page,
  selectors: string[],
  kind: string
): Promise<void> {
  const missing = await page.evaluate((sels: string[]) => {
    return sels.filter((sel) => !document.querySelector(sel));
  }, selectors);

  if (missing.length === selectors.length) {
    throw new HLTVError(
      502,
      `HLTV layout changed (${kind}): none of [${selectors.join(", ")}] found`,
      "LAYOUT_CHANGED"
    );
  }
}
