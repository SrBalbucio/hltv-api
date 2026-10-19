import { HLTV_URL } from ".";
import { assertNotChallenged, createPage } from "../util/createPage";

export async function getResults(offset = 0) {
  const [page, browser] = await createPage();

  await page.goto(`${HLTV_URL}/results?content=recency&offset=${offset}`, {
    waitUntil: "domcontentloaded",
    timeout: 0,
  });

  await assertNotChallenged(page);

  const result = await page.evaluate(() => {
    const clean = (text: string | null | undefined) =>
      text?.replace(/\s+/g, " ").trim() || "";

    // Featured (.big-results) entries repeat in the day lists below.
    const matches: any[] = [];
    const seen = new Set<string>();

    document.querySelectorAll(".result-con").forEach((con) => {
      const href = con.querySelector("a.a-reset")?.getAttribute("href") || "";
      const matchId = href.match(/matches\/(\d+)/)?.[1] || "";
      if (!matchId || seen.has(matchId)) return;
      seen.add(matchId);

      const dateUnix = con.getAttribute("data-zonedgrouping-entry-unix");

      // Teams: current markup uses .team-cell pairs; fall back to div.team.
      const teamCells = con.querySelectorAll(".team-cell");
      const nameEls =
        teamCells.length >= 2
          ? [
              teamCells[0].querySelector(".team"),
              teamCells[1].querySelector(".team"),
            ]
          : [...con.querySelectorAll("div.team")].slice(0, 2);
      const logoEls = [...con.querySelectorAll("img.team-logo")];

      // Score: spans inside .result-score, or "X - Y" text.
      const scoreSpans = con.querySelectorAll(".result-score span");
      let team1Score: number | null = null;
      let team2Score: number | null = null;
      if (scoreSpans.length >= 2) {
        team1Score = parseInt(clean(scoreSpans[0].textContent), 10);
        team2Score = parseInt(clean(scoreSpans[1].textContent), 10);
      } else {
        const [raw1, raw2] =
          clean(con.querySelector(".result-score")?.textContent).split(" - ");
        team1Score = parseInt(raw1, 10) || null;
        team2Score = parseInt(raw2, 10) || null;
      }
      if (!Number.isFinite(team1Score)) team1Score = null;
      if (!Number.isFinite(team2Score)) team2Score = null;

      const team1Won =
        nameEls[0]?.classList.contains("team-won") ||
        (team1Score !== null &&
          team2Score !== null &&
          team1Score > team2Score);
      const team2Won =
        nameEls[1]?.classList.contains("team-won") ||
        (team1Score !== null &&
          team2Score !== null &&
          team2Score > team1Score);

      const mapText = clean(con.querySelector(".map-text")?.textContent);
      const isFormat = /^bo\d+/i.test(mapText);

      const eventLogo = con.querySelector(".event-logo");
      const eventName =
        clean(con.querySelector(".event-name")?.textContent) ||
        eventLogo?.getAttribute("title") ||
        "";

      matches.push({
        id: matchId,
        link: `/match/info/${matchId}`,
        scoreLink: `/match/score/${matchId}`,
        date: dateUnix ? parseInt(dateUnix, 10) : null,
        team1: {
          name: clean(nameEls[0]?.textContent),
          logo: logoEls[0]?.getAttribute("src") || "",
          score: team1Score,
          won: team1Won,
        },
        team2: {
          name: clean(nameEls[1]?.textContent),
          logo: logoEls[1]?.getAttribute("src") || "",
          score: team2Score,
          won: team2Won,
        },
        event: {
          name: eventName,
          logo: eventLogo?.getAttribute("src") || "",
        },
        format: isFormat ? mapText.toLowerCase() : "bo1",
        map: isFormat ? null : mapText || null,
        stars: con.querySelectorAll(".stars i").length,
      });
    });

    const paginationElement = document.querySelector(".pagination-data");
    const [actual, max, total] = paginationElement
      ? clean(paginationElement.textContent)
          .match(/(\d+) - (\d+) of (\d+)/)!
          .splice(1)
          .map(Number)
      : [0, 0, 0];

    return { matches, pagination: { actual, max, total } };
  });

  await browser.close();

  return result;
}
