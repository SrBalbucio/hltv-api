import { Router } from 'express';

import Scraper from '../scraper';
import { cacheRoute } from '../util/cacheRoute';

const router = Router();

router.get('/', async (req, res) => {
  cacheRoute({
    res,
    key: "events",
    field: "events/list",
    fetchData: async () => Scraper.getEvents(),
  });
});

export default router;
