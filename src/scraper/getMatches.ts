import { createPage } from "../util/createPage";

export async function getMatches() {
  const [page, browser] = await createPage();

  await page.goto("https://www.hltv.org/matches", {
    waitUntil: "domcontentloaded",
    timeout: 0,
  });

  const matches = await page.evaluate(() => {
    const matchWrappers = document.querySelectorAll(".match-wrapper");
    const live: any[] = [];
    const upcoming: any[] = [];

    matchWrappers.forEach((wrapper) => {
      const matchId = wrapper.getAttribute("data-match-id") || "";
      const stars = parseInt(wrapper.getAttribute("data-stars") || "0", 10);
      const isLive = wrapper.getAttribute("live") === "true";
      
      const team1El = wrapper.querySelector(".match-team.team1 .match-teamname");
      const team2El = wrapper.querySelector(".match-team.team2 .match-teamname");
      const team1 = team1El ? team1El.textContent?.trim() : "TBD";
      const team2 = team2El ? team2El.textContent?.trim() : "TBD";
      
      const eventEl = wrapper.querySelector(".match-event .match-event-name") || wrapper.querySelector(".match-event");
      let eventInfo = eventEl?.getAttribute("data-event-headline") || "";
      if (!eventInfo && eventEl) {
         eventInfo = eventEl.textContent?.replace(/\s+/g, ' ').trim() || "";
      }
      
      const format = wrapper.querySelector(".match-meta")?.textContent?.trim() || "";
      const dateUnix = wrapper.querySelector(".match-time")?.getAttribute("data-unix") || "";
      
      const matchData = {
        id: matchId,
        link: `/match/info/${matchId}`,
        live: isLive,
        team1,
        team2,
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
