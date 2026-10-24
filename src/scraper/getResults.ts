import { HLTV_URL } from ".";
import { createPage } from "../util/createPage";
import { gotoHLTV, throwIfLayoutMissing } from "../util/navigate";

export async function getResults(offset = 0) {
  const [page] = await createPage();

  try {

    await gotoHLTV(page, `${HLTV_URL}/results?content=recency&offset=${offset}`);

    await throwIfLayoutMissing(
      page,
      [".result-con", "a.a-reset", ".result-score"],
      "results"
    );

    const result = await page.evaluate(() => {
      const clean = (text: string | null | undefined) =>
        text?.replace(/\s+/g, " ").trim() || "";

      // Featured (.big-results) entries repeat in the day lists below, but
      // without data-zonedgrouping-entry-unix. Dedupe by id keeping the
      // dated duplicate so every match carries an orderable date.
      const byId = new Map<string, any>();

      const toScore = (raw: string) => {
        const value = parseInt(raw, 10);
        return Number.isFinite(value) ? value : null;
      };

      document.querySelectorAll(".result-con").forEach((con) => {
        const href = con.querySelector("a.a-reset")?.getAttribute("href") || "";
        const matchId = href.match(/matches\/(\d+)/)?.[1] || "";
        if (!matchId) return;

        const dateUnix = con.getAttribute("data-zonedgrouping-entry-unix");
        const existing = byId.get(matchId);
        if (existing && (existing.date !== null || dateUnix === null)) return;

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
          team1Score = toScore(clean(scoreSpans[0].textContent));
          team2Score = toScore(clean(scoreSpans[1].textContent));
        } else {
          const [raw1, raw2] =
            clean(con.querySelector(".result-score")?.textContent).split(" - ");
          team1Score = toScore(raw1);
          team2Score = toScore(raw2);
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

        byId.set(matchId, {
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
          format: isFormat ? mapText.toLowerCase() : null,
          map: isFormat ? null : mapText || null,
          stars: con.querySelectorAll(".stars i").length,
        });
      });

      const matches = [...byId.values()];

      const paginationMatch = clean(
        document.querySelector(".pagination-data")?.textContent
      ).match(/(\d+) - (\d+) of (\d+)/);
      const pagination = paginationMatch
        ? {
            actual: Number(paginationMatch[1]),
            max: Number(paginationMatch[2]),
            total: Number(paginationMatch[3]),
          }
        : { actual: 0, max: 0, total: 0 };

      return { matches, pagination };
    });

    return result;
  } finally {
    await page.close().catch(() => {});
  }
}