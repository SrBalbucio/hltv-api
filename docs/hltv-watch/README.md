# HLTV Watch

This directory stores the baselines used to detect changes in the HLTV.org
pages that `hltv-api` scrapes. HLTV has no public API, so any markup change
on these pages can break our scrapers — this watch catches it early.

The Woodpecker pipeline `.woodpecker/hltv-watch.yml` runs on the `hltv-watch`
cron event and on manual runs. It loads each tracked page with the same
headless Chromium stack as the API (`scripts/watch-hltv-pages.ts`, reusing
`src/util/createPage.ts`), checks the CSS selectors each scraper depends on,
and compares the DOM structure skeletons against these baselines.

## Configure Woodpecker

Create a Woodpecker cron named `hltv-watch` (branch `master`, schedule
`0 6 * * *` — daily is enough; twice-daily if HLTV is changing often).

Optional environment variables (also accepted locally):

- `HLTV_WATCH_TEAM_ID` / `HLTV_WATCH_PLAYER_ID` / `HLTV_WATCH_MATCH_ID` /
  `HLTV_WATCH_EVENT_ID`: fixture IDs. Defaults point at historical pages that
  rarely change (`4608`, `7998`, `2376727`, `7148`).
- `HLTV_WATCH_RANKING_YEAR` / `HLTV_WATCH_RANKING_MONTH` /
  `HLTV_WATCH_RANKING_DAY`: fixed ranking date (`2024/july/1`).
- `HLTV_WATCH_RESULTS_OFFSET`: results pagination offset (`100`, avoids the
  always-changing first page).
- `HLTV_WATCH_SEARCH_QUERY`: search fixture (`s1mple`).
- `HLTV_WATCH_BASELINE_DIR` / `HLTV_WATCH_WORK_DIR`: baseline and work dirs.
- `HLTV_WATCH_GOTO_TIMEOUT_MS`: navigation timeout (default `90000`).
- `CF_CHALLENGE_WAIT_MS`, `CAPSOLVER_API_KEY`, `CAPSOLVER_PROXY`: same
  Cloudflare handling as the API.

Optional Woodpecker secret:

- `discord_webhook_url`: Discord webhook URL used by the notification steps.

The pipeline sends a Discord message when the watch passes and another when
it fails.

## Pages and selectors

Baselines are DOM structure skeletons (tag + classes + attribute names +
child-tag skeleton, max 2 nodes per selector, counts capped at 99) — text
content, scores and dates are intentionally excluded so normal HLTV updates
don't trigger false positives.

| Baseline | HLTV page | Required selectors (from `src/scraper/`) |
|---|---|---|
| `matches.normalized` | `/matches` | `.match-wrapper[data-match-id]`, `.match-teamname`, `.match-event[data-event-headline]`, `.match-time[data-unix]` |
| `results.normalized` | `/results?content=recency&offset=100` | `.result-con[data-zonedgrouping-entry-unix]`, `a.a-reset`, `.team-cell`, `.result-score`, `.pagination-data` |
| `match.normalized` | `/matches/2376727/match` | `.teamsBox .team`, `.teamName`, `.mapholder`, `.veto-box`, `a.results-stats` |
| `events.normalized` | `/events` | any of: `.ongoing-event`, `.event-status-upcoming-headline + .events-holder a.big-event`, `... a.small-event` |
| `event.normalized` | `/events/7148/-` | `.event-hub-title`, `.eventdate span[data-unix]`, `td.prizepool` + any of `.placements .placement`, `.teams-attending .team-box` |
| `team.normalized` | `/team/4608/team` | `.profile-team-name`, `.profile-team-stat`, `.bodyshot-team-bg a` |
| `player.normalized` | `/player/7998/player` | `h1.playerNickname`, `div.playerRealname`, `.playerTeam` |
| `ranking.normalized` | `/ranking/teams/2024/july/1` | `.ranked-team`, `.position`, `.name`, `.points` + any of `a.pagination-prev`, `a.pagination-next` |
| `search.normalized` | `/search?query=s1mple` | `table`, `.table-header`, `tbody tr td a` |

## Update the baselines

When the pipeline detects a change, inspect the log diff, update the
scrapers if the HLTV layout really moved, then refresh the accepted
baselines locally:

```bash
pnpm watch:hltv -- --update-baseline
```

Commit the updated `docs/hltv-watch/*.normalized` together with any scraper
fixes. To check a single page: `pnpm watch:hltv -- --pages=team,player`.

## First run

Baselines are committed in this directory. If HLTV changes its layout,
regenerate them after fixing the scrapers (see above). To re-check a single
page: `pnpm watch:hltv -- --pages=team,player`.
