import { Router } from 'express';

import Scraper from '../scraper';
import { cacheRoute } from '../util/cacheRoute';

const router = Router();

router.get('/info/:eventId', async (req, res) => {
  const { eventId } = req.params;

  cacheRoute({
    res,
    key: String(eventId).toLowerCase(),
    field: "event/info",
    fetchData: async () => Scraper.getEventInfo(eventId),
  });
});

router.get('/', async (req, res) => {
  cacheRoute({
    res,
    key: "events",
    field: "events/list",
    fetchData: async () => Scraper.getEvents(),
  });
});

export default router;
