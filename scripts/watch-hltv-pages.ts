import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Page } from "puppeteer";
import { assertNotChallenged, createPage } from "../src/util/createPage";
import { HLTV_URL } from "../src/scraper";

const execFileAsync = promisify(execFile);

const REPO_ROOT =
  process.env.HLTV_WATCH_REPO_ROOT ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_DIR = process.env.HLTV_WATCH_BASELINE_DIR || path.join(REPO_ROOT, "docs", "hltv-watch");
const WORK_DIR = process.env.HLTV_WATCH_WORK_DIR || path.join(REPO_ROOT, "target", "hltv-watch");

const TEAM_ID = process.env.HLTV_WATCH_TEAM_ID || "4608";
const PLAYER_ID = process.env.HLTV_WATCH_PLAYER_ID || "7998";
const MATCH_ID = process.env.HLTV_WATCH_MATCH_ID || "2376727";
const EVENT_ID = process.env.HLTV_WATCH_EVENT_ID || "7148";
const RANKING_YEAR = process.env.HLTV_WATCH_RANKING_YEAR || "2024";
const RANKING_MONTH = process.env.HLTV_WATCH_RANKING_MONTH || "july";
const RANKING_DAY = process.env.HLTV_WATCH_RANKING_DAY || "1";
const RESULTS_OFFSET = process.env.HLTV_WATCH_RESULTS_OFFSET || "100";
const SEARCH_QUERY = process.env.HLTV_WATCH_SEARCH_QUERY || "s1mple";
const GOTO_TIMEOUT_MS = Number(process.env.HLTV_WATCH_GOTO_TIMEOUT_MS) || 90000;

interface PageCheck {
  name: string;
  url: string;
  required: string[];
  anyOf?: string[];
  waitFor?: string;
  waitTimeoutMs?: number;
}

function buildPages(): PageCheck[] {
  return [
    {
      name: "matches",
      url: `${HLTV_URL}/matches`,
      required: [
        ".match-wrapper[data-match-id]",
        ".match-teamname",
        ".match-event[data-event-headline]",
        ".match-time[data-unix]",
      ],
      waitFor: ".match-wrapper .match-event[data-event-headline]",
      waitTimeoutMs: 15000,
    },
    {
      name: "results",
      url: `${HLTV_URL}/results?content=recency&offset=${RESULTS_OFFSET}`,
      required: [
        ".result-con[data-zonedgrouping-entry-unix]",
        "a.a-reset",
        ".team-cell",
        ".result-score",
        ".pagination-data",
      ],
    },
    {
      name: "match",
      url: `${HLTV_URL}/matches/${MATCH_ID}/match`,
      required: [
        ".teamsBox .team",
        ".teamName",
        ".mapholder",
        ".veto-box",
        "a.results-stats",
      ],
    },
    {
      name: "events",
      url: `${HLTV_URL}/events`,
      required: [],
      anyOf: [
        ".ongoing-event",
        ".event-status-upcoming-headline + .events-holder a.big-event",
        ".event-status-upcoming-headline + .events-holder a.small-event",
      ],
    },
    {
      name: "event",
      url: `${HLTV_URL}/events/${EVENT_ID}/-`,
      required: [
        ".event-hub-title",
        ".eventdate span[data-unix]",
        "td.prizepool",
      ],
      anyOf: [".placements .placement", ".teams-attending .team-box"],
    },
    {
      name: "team",
      url: `${HLTV_URL}/team/${TEAM_ID}/team`,
      required: [
        ".profile-team-name",
        ".profile-team-stat",
        ".bodyshot-team-bg a",
      ],
    },
    {
      name: "player",
      url: `${HLTV_URL}/player/${PLAYER_ID}/player`,
      required: ["h1.playerNickname", "div.playerRealname", ".playerTeam"],
    },
    {
      name: "ranking",
      url: `${HLTV_URL}/ranking/teams/${RANKING_YEAR}/${RANKING_MONTH}/${RANKING_DAY}`,
      required: [".ranked-team", ".position", ".name", ".points"],
      anyOf: ["a.pagination-prev", "a.pagination-next"],
    },
    {
      name: "search",
      url: `${HLTV_URL}/search?query=${encodeURIComponent(SEARCH_QUERY)}`,
      required: ["table", ".table-header", "tbody tr td a"],
    },
  ];
}

interface SelectorSnapshot {
  selector: string;
  count: number;
  skeletons: string[];
}

async function snapshotSelectors(
  page: Page,
  selectors: string[]
): Promise<SelectorSnapshot[]> {
  const code = `(() => {
    const sels = ${JSON.stringify(selectors)};
    const maxNodes = 2;
    function skeleton(el, depth) {
      const tag = el.tagName.toLowerCase();
      const classAttr = (typeof el.className === "string") ? el.className : "";
      const classes = classAttr.trim().split(/\\s+/).filter(Boolean).sort().join(".");
      const attrs = Array.from(el.attributes).map((a) => a.name).filter((n) => n.toLowerCase() !== "class").sort().join(",");
      let kids = "~";
      if (depth > 0) {
        kids = Array.from(el.children).slice(0, 8).map((c) => skeleton(c, depth - 1)).join("");
      }
      return "<" + tag + (classes ? "." + classes : "") + (attrs ? "[" + attrs + "]" : "") + ">" + kids + "</" + tag + ">";
    }
    return sels.map((selector) => {
      const all = document.querySelectorAll(selector);
      return {
        selector,
        count: all.length,
        skeletons: Array.from(all).slice(0, maxNodes).map((n) => skeleton(n, 3)),
      };
    });
  })()`;
  const result = await page.evaluate(code);
  return result as SelectorSnapshot[];
}

function toLines(name: string, snaps: SelectorSnapshot[]): string {
  const lines = [`# page: ${name}`];
  for (const s of snaps) {
    lines.push(`${s.selector} found=${s.count > 0 ? "yes" : "no"}`);
    s.skeletons.forEach((sk, i) => lines.push(`  #${i} ${sk}`));
  }
  return lines.join("\n") + "\n";
}

async function diffFiles(baseline: string, current: string): Promise<string | null> {
  try {
    await execFileAsync("diff", ["-u", baseline, current]);
    return null;
  } catch (error: any) {
    if (typeof error?.stdout === "string" || typeof error?.stderr === "string") {
      const out = `${error.stdout || ""}${error.stderr || ""}`.trim();
      if (out) return out;
    }
    const a = fs.readFileSync(baseline, "utf8").split("\n");
    const b = fs.readFileSync(current, "utf8").split("\n");
    const out: string[] = [`--- ${baseline}`, `+++ ${current}`];
    const n = Math.max(a.length, b.length);
    let shown = 0;
    for (let i = 0; i < n && shown < 100; i++) {
      if (a[i] !== b[i]) {
        if (a[i] !== undefined) out.push(`-${a[i]}`);
        if (b[i] !== undefined) out.push(`+${b[i]}`);
        shown++;
      }
    }
    return out.join("\n");
  }
}

async function checkPage(
  check: PageCheck,
  updateBaseline: boolean
): Promise<string[]> {
  const failures: string[] = [];
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const [page] = await createPage();
    try {
      await page.goto(check.url, {
        waitUntil: "domcontentloaded",
        timeout: GOTO_TIMEOUT_MS,
      });
      await assertNotChallenged(page);

      const errorPage = await page.evaluate(() =>
        Boolean(document.querySelector(".error-background, .error-status"))
      );
      if (errorPage) {
        throw new Error(
          "HLTV served an error page (fixture IDs may be stale or the layout moved)"
        );
      }

      if (check.waitFor) {
        await page
          .waitForFunction(
            (sel: string) => Boolean(document.querySelector(sel)),
            { timeout: check.waitTimeoutMs || 15000 },
            check.waitFor
          )
          .catch(() => {});
      }

      const selectors = [...check.required, ...(check.anyOf || [])];
      const snaps = await snapshotSelectors(page, selectors);
      const bySelector = new Map(snaps.map((s) => [s.selector, s]));

      for (const sel of check.required) {
        if ((bySelector.get(sel)?.count || 0) === 0) {
          failures.push(`MISSING SELECTOR ${check.name} :: ${sel}`);
        }
      }
      if (check.anyOf && check.anyOf.length > 0) {
        const anyFound = check.anyOf.some(
          (sel) => (bySelector.get(sel)?.count || 0) > 0
        );
        if (!anyFound) {
          failures.push(
            `MISSING SELECTOR ${check.name} :: none of [${check.anyOf.join(" | ")}]`
          );
        }
      }
      if (failures.length > 0) return failures;

      fs.mkdirSync(WORK_DIR, { recursive: true });
      const currentPath = path.join(WORK_DIR, `${check.name}.normalized`);
      fs.writeFileSync(currentPath, toLines(check.name, snaps));

      if (updateBaseline) {
        fs.mkdirSync(BASELINE_DIR, { recursive: true });
        fs.copyFileSync(
          currentPath,
          path.join(BASELINE_DIR, `${check.name}.normalized`)
        );
        console.log(`updated baseline ${check.name}.normalized`);
        return [];
      }

      const baselinePath = path.join(BASELINE_DIR, `${check.name}.normalized`);
      if (!fs.existsSync(baselinePath)) {
        failures.push(
          `NO BASELINE ${check.name}: run 'pnpm watch:hltv -- --update-baseline' to create ${baselinePath}`
        );
        return failures;
      }

      const diff = await diffFiles(baselinePath, currentPath);
      if (diff) {
        failures.push(
          `STRUCTURE CHANGED ${check.name}:\n${diff}\nReview the page, update the scrapers if needed, then run 'pnpm watch:hltv -- --update-baseline'.`
        );
        return failures;
      }

      console.log(
        `ok ${check.name} (${check.required.length + (check.anyOf?.length || 0)} selector groups)`
      );
      return [];
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 2) {
        failures.push(`FETCH FAIL ${check.name} :: ${message}`);
      } else {
        await new Promise((r) => setTimeout(r, 3000));
      }
    } finally {
      await page.close().catch(() => {});
    }
  }

  if (failures.length === 0 && lastError) {
    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    failures.push(`FETCH FAIL ${check.name} :: ${message}`);
  }
  return failures;
}

function printHelp() {
  console.log(
    [
      "HLTV watch: checks required selectors and structure skeletons of HLTV pages.",
      "",
      "Usage: tsx scripts/watch-hltv-pages.ts [--update-baseline] [--pages=a,b] [--help]",
      "",
      "  --update-baseline   refresh docs/hltv-watch/*.normalized from current pages",
      "  --pages=a,b         only check the named pages",
      "  --help              show this message",
      "",
      "Fixtures via HLTV_WATCH_TEAM_ID / PLAYER_ID / MATCH_ID / EVENT_ID /",
      "RANKING_YEAR|MONTH|DAY / RESULTS_OFFSET / SEARCH_QUERY.",
    ].join("\n")
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return 0;
  }
  const updateBaseline = args.includes("--update-baseline");
  const pagesArg = args.find((a) => a.startsWith("--pages="));
  const only = pagesArg
    ? new Set(pagesArg.slice("--pages=".length).split(",").map((s) => s.trim()))
    : null;

  const pages = buildPages().filter((p) => !only || only.has(p.name));
  if (only) {
    const known = new Set(buildPages().map((p) => p.name));
    for (const name of only) {
      if (!known.has(name)) {
        console.error(`Unknown page: ${name} (known: ${[...known].join(", ")})`);
        return 2;
      }
    }
  }

  let browser: { close(): Promise<unknown> } | null = null;
  const failures: string[] = [];
  try {
    const [warmup, br] = await createPage();
    await warmup.close().catch(() => {});
    browser = br;
    for (const check of pages) {
      const errs = await checkPage(check, updateBaseline);
      failures.push(...errs);
    }
  } finally {
    await browser?.close().catch(() => {});
  }

  if (updateBaseline) {
    console.log(`Updated baselines in ${BASELINE_DIR}`);
    return 0;
  }
  if (failures.length > 0) {
    console.error(`\nHLTV watch failed (${failures.length} problem(s)):`);
    for (const f of failures) console.error(`- ${f}`);
    console.error(
      "\nIf HLTV changed its layout, fix the scrapers, then refresh with: pnpm watch:hltv -- --update-baseline"
    );
    return 1;
  }
  console.log("\nHLTV watch passed: all pages match the tracked baselines.");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  });
