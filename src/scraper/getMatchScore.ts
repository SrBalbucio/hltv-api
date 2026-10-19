import { HLTV_URL } from ".";
import { HLTVError } from '../error/HLTVError';
import { assertNotChallenged, createPage } from "../util/createPage";

export async function getMatchScore(id: string) {
  const [page, browser] = await createPage();

  await page.goto(`${HLTV_URL}/matches/${id}/match`, {
    timeout: 0,
    waitUntil: "domcontentloaded",
  });

  const has500Error = await page.evaluate(() => {
    return Boolean(document.querySelector('.error-background'));
  });

  if (has500Error) {
    await browser.close();
    throw new HLTVError(404, 'Not Found Match');
  }

  const score = await page.evaluate((hltvURL) => {
    function formatImage(image: string) {
      return image.startsWith("/img/static") ? `${hltvURL}${image}` : image;
    }

    // --- Match status ---
    const countdownEl = document.querySelector(".countdown");
    const statusText = countdownEl?.textContent?.trim()?.toLowerCase() || "";
    const isLive = statusText === "live";
    const isOver = statusText === "match over";

    let status = "upcoming";
    if (isLive) status = "live";
    else if (isOver) status = "over";

    // --- Teams with series score ---
    const teamsData: any[] = [];
    const teamElements = document.querySelectorAll(".teamsBox .team");

    teamElements.forEach((element) => {
      const nameEl = element.querySelector(".teamName");
      const logoEl = element.querySelector("a img") as HTMLImageElement;
      const scoreEl = element.querySelector("div div:not(.teamName)");
      const teamLink = element.querySelector("a")?.getAttribute("href") || "";

      // Extract team ID from the link
      const teamIdMatch = teamLink.match(/team\/(\d+)\//);
      const teamId = teamIdMatch ? teamIdMatch[1] : "";

      teamsData.push({
        id: teamId,
        name: nameEl?.textContent?.trim() || "TBD",
        logo: logoEl ? formatImage(logoEl.getAttribute("src") || "") : "",
        seriesScore: parseInt(scoreEl?.textContent?.trim() || "0", 10),
        won: scoreEl?.classList.contains("won") || false,
      });
    });

    // --- Current map score (live round-by-round) ---
    const currentMapScore: any = {};

    // Try to get the live current score from the scoreboard area
    const scoreboardEl = document.querySelector(".match-scoreboard-module");
    if (scoreboardEl) {
      const ctScoreEl = scoreboardEl.querySelector(".ct-score, .score-ct");
      const tScoreEl = scoreboardEl.querySelector(".t-score, .score-t");

      currentMapScore.ctScore = parseInt(ctScoreEl?.textContent?.trim() || "0", 10);
      currentMapScore.tScore = parseInt(tScoreEl?.textContent?.trim() || "0", 10);
    }

    // Alternative: get scores from the live scoreboard
    const liveScoreEl = document.querySelector(".liveScoreContainer, .live-score");
    if (liveScoreEl) {
      const scores = liveScoreEl.querySelectorAll(".team-score, .score");
      if (scores.length >= 2) {
        currentMapScore.team1Score = parseInt(scores[0]?.textContent?.trim() || "0", 10);
        currentMapScore.team2Score = parseInt(scores[1]?.textContent?.trim() || "0", 10);
      }
    }

    // --- Map details per map played ---
    const maps: any[] = [];
    const mapHolders = document.querySelectorAll(".mapholder");

    mapHolders.forEach((mapHolder) => {
      const mapNameEl = mapHolder.querySelector(".mapname, img.minimap");
      const mapName = mapNameEl?.getAttribute("title") 
        || mapNameEl?.textContent?.trim() 
        || "TBD";

      const resultsLeft = mapHolder.querySelector(".results-left");
      const resultsRight = mapHolder.querySelector(".results-right, .results-center-half-score");

      // Map scores for each team
      const team1ScoreEl = mapHolder.querySelector(".results-team-score:first-child, .results-left .score");
      const team2ScoreEl = mapHolder.querySelector(".results-team-score:last-child, .results-right .score");

      // Half scores (first half / second half)
      const halfScores = mapHolder.querySelectorAll(".results-center-half-score span");

      const mapData: any = {
        name: mapName,
        picked: false,
      };

      // Check if map has been played
      const resultElements = mapHolder.querySelectorAll(".results-team-score");
      if (resultElements.length >= 2) {
        mapData.team1Score = parseInt(resultElements[0]?.textContent?.trim() || "0", 10);
        mapData.team2Score = parseInt(resultElements[1]?.textContent?.trim() || "0", 10);
        mapData.played = true;

        // Try to detect who picked this map
        const pickEl = mapHolder.querySelector(".pick");
        if (pickEl) {
          mapData.picked = true;
          mapData.pickedBy = pickEl.textContent?.trim() || "";
        }

        // CT/T half scores if available
        if (halfScores.length >= 2) {
          mapData.firstHalf = {
            team1: parseInt(halfScores[0]?.textContent?.trim() || "0", 10),
            team2: parseInt(halfScores[1]?.textContent?.trim() || "0", 10),
          };
        }
        if (halfScores.length >= 4) {
          mapData.secondHalf = {
            team1: parseInt(halfScores[2]?.textContent?.trim() || "0", 10),
            team2: parseInt(halfScores[3]?.textContent?.trim() || "0", 10),
          };
        }

        // Stats link
        const statsLink = mapHolder.querySelector("a.results-stats");
        mapData.statsLink = statsLink?.getAttribute("href") || null;
      } else {
        mapData.played = false;
        mapData.team1Score = 0;
        mapData.team2Score = 0;
      }

      maps.push(mapData);
    });

    // --- Event info ---
    const eventLink = document.querySelector(".event a");
    const event = {
      name: eventLink?.getAttribute("title") || eventLink?.textContent?.trim() || "",
      link: eventLink?.getAttribute("href") || "",
    };

    // --- Best Of ---
    const vetoBox = document.querySelector(".veto-box, .standard-box.veto-box");
    const preformatted = document.querySelector(".preformatted-text");
    let bestOf = 1;
    if (maps.length > 0) {
      // Infer bestOf from number of map holders
      if (maps.length === 1) bestOf = 1;
      else if (maps.length <= 3) bestOf = 3;
      else if (maps.length <= 5) bestOf = 5;
    }

    return {
      status,
      teams: teamsData,
      currentMapScore: Object.keys(currentMapScore).length > 0 ? currentMapScore : null,
      maps,
      event,
      bestOf,
    };
  }, HLTV_URL);

  await browser.close();

  return score;
}
