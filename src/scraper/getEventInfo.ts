import { HLTV_URL } from ".";
import { HLTVError } from "../error/HLTVError";
import { assertNotChallenged, createPage } from "../util/createPage";

export async function getEventInfo(id: string) {
  const [page, browser] = await createPage();

  await page.goto(`${HLTV_URL}/events/${id}/-`, {
    timeout: 0,
    waitUntil: "domcontentloaded",
  });

  await assertNotChallenged(page);

  const has500Error = await page.evaluate(() => {
    return Boolean(document.querySelector(".error-background"));
  });

  if (has500Error) {
    await browser.close();
    throw new HLTVError(404, "Not Found Event");
  }

  const event = await page.evaluate(
    (hltvURL) => {
      const toIso = (unix: string | null | undefined) =>
        unix ? new Date(Number(unix)).toISOString() : null;

      const formatImage = (image: string | null | undefined) => {
        if (!image) return "";
        return image.startsWith("/img") ? `${hltvURL}${image}` : image;
      };

      const clean = (text: string | null | undefined) =>
        text?.replace(/\s+/g, " ").trim() || "";

      // "Finished" | "Live" | "Upcoming" badge on the event hub
      const indicator = document.querySelector(".event-hub-indicator");
      const status = indicator
        ? indicator.classList.contains("event-ended")
          ? "finished"
          : indicator.classList.contains("event-live")
          ? "live"
          : "upcoming"
        : "upcoming";

      const dateSpans = [
        ...document.querySelectorAll(".eventdate span[data-unix]"),
      ];

      const placements = [
        ...document.querySelectorAll(".placements .placement"),
      ].map((p) => ({
        team: clean(p.querySelector(".team a")?.textContent),
        teamUrl: p.querySelector(".team a")?.getAttribute("href") || null,
        position:
          [...p.children]
            .map((c) => clean(c.textContent))
            .find((t) => /^\d+(st|nd|rd|th)$/.test(t)) || null,
        prize: clean(p.querySelector(".prize")?.textContent) || null,
        logo: formatImage(
          p.querySelector(".team-logo img")?.getAttribute("src")
        ),
      }));

      const teams = [
        ...document.querySelectorAll(".teams-attending .team-box"),
      ].map((box) => ({
        name: clean(box.querySelector(".team-name .text")?.textContent),
        url: box.querySelector(".team-name a")?.getAttribute("href") || null,
        logo: formatImage(
          box.querySelector(".logo-box img")?.getAttribute("src")
        ),
        worldRank:
          clean(box.querySelector(".event-world-rank")?.textContent) || null,
        vrsRank:
          clean(box.querySelector(".event-vrs-rank")?.textContent) || null,
      }));

      const relatedEvents = [
        ...document.querySelectorAll(".related-event"),
      ].map((r) => ({
        id: r.querySelector("a")?.getAttribute("href")?.match(/events\/(\d+)/)?.[1] || "",
        name:
          clean(r.querySelector(".event-name")?.textContent) ||
          r.querySelector("a img")?.getAttribute("title") ||
          "",
      }));

      const prizePoolEl = document.querySelector(".prizepool");

      return {
        name:
          clean(document.querySelector(".event-hub-title")?.textContent) ||
          document.title.replace(" overview | HLTV.org", "").trim(),
        banner: formatImage(
          document.querySelector(".event-hub-image")?.getAttribute("src")
        ),
        status,
        date: clean(document.querySelector(".eventdate")?.textContent),
        startDate: toIso(dateSpans[0]?.getAttribute("data-unix")),
        endDate: toIso(
          dateSpans[dateSpans.length - 1]?.getAttribute("data-unix")
        ),
        prizePool:
          prizePoolEl?.getAttribute("title") || clean(prizePoolEl?.textContent),
        teamsCount: clean(document.querySelector(".teamsNumber")?.textContent),
        location: {
          name: clean(
            document.querySelector(".location .text-ellipsis")?.textContent
          ),
          flag: formatImage(
            document.querySelector(".location img.flag")?.getAttribute("src")
          ),
        },
        links: {
          results:
            document
              .querySelector(".event-hub-bottom a[href*='/results']")
              ?.getAttribute("href") || null,
          stats:
            document
              .querySelector(".event-hub-bottom a[href*='/stats']")
              ?.getAttribute("href") || null,
        },
        placements,
        teams,
        relatedEvents,
      };
    },
    HLTV_URL
  );

  await browser.close();

  return { id, ...event };
}
