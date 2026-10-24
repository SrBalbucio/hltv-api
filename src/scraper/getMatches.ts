import { createPage } from "../util/createPage";
import { gotoHLTV, throwIfLayoutMissing } from "../util/navigate";

export async function getMatches() {
  const [page] = await createPage();

  try {

    await gotoHLTV(page, "https://www.hltv.org/matches");

    await throwIfLayoutMissing(page, [".match-wrapper"], "matches");

    // HLTV re-renders (pinned/live) wrappers client-side right after load;
    // wait until every match has its event headline populated, else fall through.
    await page
      .waitForFunction(
        () => {
          const events = document.querySelectorAll(".match-wrapper .match-event");
          return (
            events.length > 0 &&
            Array.from(events).every((e) =>
              Boolean(e.getAttribute("data-event-headline"))
            )
          );
        },
        { timeout: 15000 }
      )
      .catch(() => {});

    const matches = await page.evaluate(() => {
      const matchWrappers = document.querySelectorAll(".match-wrapper");
      const matches: any[] = [];

      matchWrappers.forEach((wrapper) => {
        const matchId = wrapper.getAttribute("data-match-id") || "";
        const stars = parseInt(wrapper.getAttribute("data-stars") || "0", 10);
        const isLive = wrapper.getAttribute("live") === "true";

        // New layout: live containers render teams in ".match-teams .match-team"
        // without the .team1/.team2 classes; upcoming matches keep them.
        const getTeamName = (index: number, side: string) => {
          const bySide = wrapper.querySelector(`.match-team.${side} .match-teamname`);
          if (bySide) return bySide.textContent?.trim() || "TBD";
          const ordered = wrapper.querySelectorAll(
            ".match-teams .match-team .match-teamname"
          );
          return ordered[index]?.textContent?.trim() || "TBD";
        };
        const team1 = getTeamName(0, "team1");
        const team2 = getTeamName(1, "team2");

        const eventEl = wrapper.querySelector(".match-event");
        const eventId =
          wrapper.getAttribute("data-event-id") ||
          eventEl?.getAttribute("data-event-id") ||
          "";
        let eventInfo = eventEl?.getAttribute("data-event-headline") || "";
        if (!eventInfo && eventEl) {
          eventInfo = eventEl.textContent?.replace(/\s+/g, ' ').trim() || "";
        }
        // Strip trailing "Live" badge text that leaks into the event name
        eventInfo = eventInfo.replace(/\s*Live$/i, "").trim();

        // Format (bo1/bo3/...): skip the "Live" status label
        const metas = Array.from(wrapper.querySelectorAll(".match-meta")).map(
          (m) => m.textContent?.replace(/\s+/g, " ").trim() || ""
        );
        const format =
          metas.find((m) => /^bo\d+/i.test(m)) ||
          metas.filter((m) => m && !/^live$/i.test(m)).join(" ");

        const dateUnix = wrapper.querySelector(".match-time")?.getAttribute("data-unix") || "";

        // Extract scores for live matches
        let team1Score: number | null = null;
        let team2Score: number | null = null;
        let team1SeriesScore: number | null = null;
        let team2SeriesScore: number | null = null;

        if (isLive) {
          const scoreEls = wrapper.querySelectorAll(
            ".match-team-livescore .match-team-score"
          );

          const parseScore = (el: Element | undefined) => {
            if (!el) return null;
            const currentMap = parseInt(
              el.querySelector(".current-map-score")?.textContent?.trim() || "",
              10
            );
            return Number.isFinite(currentMap) ? currentMap : null;
          };

          const parseSeries = (el: Element | undefined) => {
            if (!el) return null;
            const mapsWon = parseInt(
              el.querySelector(".map-score span")?.textContent?.trim() || "",
              10
            );
            return Number.isFinite(mapsWon) ? mapsWon : null;
          };

          team1Score = parseScore(scoreEls[0]);
          team2Score = parseScore(scoreEls[1]);
          team1SeriesScore = parseSeries(scoreEls[0]);
          team2SeriesScore = parseSeries(scoreEls[1]);
        }

        // Current map: the wrapper has no explicit "now playing" element;
        // data-maps carries the post-veto play order, so index it by how
        // many maps were already played (null when unknown).
        let currentMap: string | null = null;
        if (isLive) {
          const mapPool = (
            wrapper.querySelector(".match-btn-wrapper")?.getAttribute("data-maps") || ""
          )
            .split(",")
            .map((m) => m.trim())
            .filter(Boolean);

          const playedMaps =
            (team1SeriesScore ?? 0) + (team2SeriesScore ?? 0);
          currentMap = mapPool[playedMaps] || null;
        }
        const matchData: any = {
          id: matchId,
          link: `/match/info/${matchId}`,
          scoreLink: `/match/score/${matchId}`,
          live: isLive,
          team1,
          team2,
          team1Score,
          team2Score,
          team1SeriesScore,
          team2SeriesScore,
          currentMap,
          eventId,
          event: eventInfo,
          format,
          stars,
          date: dateUnix ? parseInt(dateUnix, 10) : null
        };

        matches.push(matchData);
      });

      // The same match can appear more than once (featured/pinned section +
      // day agenda). Keep the entry with the most populated fields.
      const howComplete = (m: any) =>
        (m.event ? 1 : 0) +
        (m.team1 !== "TBD" ? 1 : 0) +
        (m.team2 !== "TBD" ? 1 : 0) +
        (m.date ? 1 : 0);

      const byId = new Map<string, any>();
      matches.forEach((m) => {
        const current = byId.get(m.id);
        if (!current || howComplete(m) > howComplete(current)) {
          byId.set(m.id, m);
        }
      });

      const unique = [...byId.values()];
      return {
        live: unique.filter((m) => m.live),
        upcoming: unique.filter((m) => !m.live),
      };
    });

    return matches;
  } finally {
    await page.close().catch(() => {});
  }
}