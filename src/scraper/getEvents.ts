import { assertNotChallenged, createPage } from "../util/createPage";

export async function getEvents() {
  const [page, browser] = await createPage();

  await page.goto("https://www.hltv.org/events", {
    waitUntil: "domcontentloaded",
    timeout: 0,
  });

  await assertNotChallenged(page);

  const events = await page.evaluate(() => {
    const toIso = (unix: string | null | undefined) =>
      unix ? new Date(Number(unix)).toISOString() : null;

    const clean = (text: string | null | undefined) =>
      text?.replace(/\s+/g, " ").trim() || "";

    // ---- ongoing events (FEATURED / TODAY / ALL tabs, deduped) ----
    const ongoing: any[] = [];
    const seenOngoing = new Set<string>();

    document.querySelectorAll(".ongoing-event").forEach((el) => {
      const link = el.getAttribute("href") || "";
      const eventId = link.match(/events\/(\d+)/)?.[1] || "";
      const name = clean(
        el.querySelector(".event-name-small .text-ellipsis")?.textContent
      );

      if (!eventId || seenOngoing.has(eventId) || !name) return;
      seenOngoing.add(eventId);

      const dateSpans = [...el.querySelectorAll("[data-unix]")];

      ongoing.push({
        id: eventId,
        link: `/event/info/${eventId}`,
        name,
        date: clean(el.querySelector(".eventDetails")?.textContent),
        startDate: toIso(dateSpans[0]?.getAttribute("data-unix")),
        endDate: toIso(dateSpans[dateSpans.length - 1]?.getAttribute("data-unix")),
        logo: el.querySelector("img.logo")?.getAttribute("src") || "",
      });
    });

    // ---- upcoming events (section after the "Upcoming events" headline) ----
    const upcoming: any[] = [];
    const seenUpcoming = new Set<string>();

    document
      .querySelectorAll(
        ".event-status-upcoming-headline + .events-holder a.big-event, " +
          ".event-status-upcoming-headline + .events-holder a.small-event"
      )
      .forEach((el) => {
        const link = el.getAttribute("href") || "";
        const eventId = link.match(/events\/(\d+)/)?.[1] || "";
        if (!eventId || seenUpcoming.has(eventId)) return;
        seenUpcoming.add(eventId);

        const isBig = el.classList.contains("big-event");
        const dateSpans = [...el.querySelectorAll("[data-unix]")];

        const prizeEl = [...el.querySelectorAll("[title]")].find((n) =>
          /^\$[\d,.]+/.test(n.getAttribute("title") || "")
        );

        const numberTds = [...el.querySelectorAll("td")].filter((td) =>
          /^\d+$/.test(clean(td.textContent))
        );

        upcoming.push({
          id: eventId,
          link: `/event/info/${eventId}`,
          name: clean(
            isBig
              ? el.querySelector(".big-event-name")?.textContent
              : el.querySelector(".event-col .text-ellipsis")?.textContent
          ),
          date: clean(el.querySelector(".eventDetails")?.textContent),
          startDate: toIso(dateSpans[0]?.getAttribute("data-unix")),
          endDate: toIso(
            dateSpans[dateSpans.length - 1]?.getAttribute("data-unix")
          ),
          logo: (isBig
            ? el.querySelector("img.event-header")
            : el.querySelector("img.logo")
          )?.getAttribute("src") || "",
          location:
            clean(
              isBig
                ? el.querySelector(".big-event-location")?.textContent
                : el.querySelector(".smallCountry .col-desc")?.textContent
            ) || null,
          prizePool:
            prizeEl?.getAttribute("title") || clean(prizeEl?.textContent) || null,
          teamsCount: numberTds.length
            ? parseInt(clean(numberTds[numberTds.length - 1].textContent), 10)
            : null,
          big: isBig,
        });
      });

    return { ongoing, upcoming };
  });

  await browser.close();

  return events;
}
