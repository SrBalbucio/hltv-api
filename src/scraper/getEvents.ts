import { createPage } from "../util/createPage";

export async function getEvents() {
  const [page, browser] = await createPage();

  await page.goto("https://www.hltv.org/events", {
    waitUntil: "domcontentloaded",
    timeout: 0,
  });

  const events = await page.evaluate(() => {
    let elements = document.querySelectorAll("#ALL .a-reset.ongoing-event");
    if (elements.length === 0) {
      elements = document.querySelectorAll(".ongoing-events-holder .ongoing-event");
    }

    const result: any[] = [];
    const seen = new Set();

    elements.forEach((eventLink) => {
      const link = eventLink.getAttribute("href");
      const matchEventId = link?.match(/events\/(\d+)/);
      const eventId = matchEventId ? matchEventId[1] : "";

      if (eventId && !seen.has(eventId)) {
        seen.add(eventId);
        const name = eventLink.querySelector(".event-name-small .text-ellipsis")?.textContent?.trim() || "";
        const date = eventLink.querySelector("td .col-desc")?.textContent?.trim() || "";
        const logo = eventLink.querySelector(".logo")?.getAttribute("src") || "";

        result.push({
          id: eventId,
          link: `/event/info/${eventId}`,
          name,
          date,
          logo
        });
      }
    });

    return result;
  });

  await browser.close();

  return events;
}
