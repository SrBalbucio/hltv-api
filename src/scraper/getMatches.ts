import { createPage } from "../util/createPage";

export async function getMatches() {
  const [page, browser] = await createPage();

  await page.goto("https://www.hltv.org/matches", {
    waitUntil: "domcontentloaded",
    timeout: 0,
  });

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
    const live: any[] = [];
    const upcoming: any[] = [];

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

      // Extract current map info if available
      let currentMap: string | null = null;
      if (isLive) {
        const mapText = metas[0] || "";
        if (mapText && !/^(bo\d+|live)$/i.test(mapText)) {
          currentMap = mapText;
        }
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
        event: eventInfo,
        format,
        stars,
        date: dateUnix ? parseInt(dateUnix, 10) : null
      };

      if (isLive) {
        live.push(matchData);
      } else {
        upcoming.push(matchData);
      }
    });

    return { live, upcoming };
  });

  await browser.close();

  return matches;
}
