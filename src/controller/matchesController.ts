import { Router } from 'express';

import Scraper from '../scraper';
import { cacheRoute } from '../util/cacheRoute';

const ROUND_CACHE_TTL = 90; // 1:30 min - tempo médio de um round

const router = Router();

router.get('/info/:matchId', async (req, res) => {
  const { matchId } = req.params;

  const key = String(matchId).toLowerCase();

  cacheRoute({
    res,
    key,
    field: "match/info",
    fetchData: async () => Scraper.getMatchInfo(matchId),
  });
});

router.get('/score/:matchId', async (req, res) => {
  const { matchId } = req.params;

  const key = `score:${String(matchId).toLowerCase()}`;

  cacheRoute({
    res,
    key,
    field: "match/score",
    expire: ROUND_CACHE_TTL,
    fetchData: async () => Scraper.getMatchScore(matchId),
  });
});

router.get('/results', async (req, res) => {
  const offset = Number(req.query.offset) || 0;

  cacheRoute({
    res,
    key: `results:${offset}`,
    field: "match/results",
    expire: 5 * 60,
    fetchData: async () => Scraper.getResults(offset),
  });
});

router.get('/', async (req, res) => {
  cacheRoute({
    res,
    key: "matches",
    field: "matches/list",
    expire: ROUND_CACHE_TTL,
    fetchData: async () => Scraper.getMatches(),
  });
});

export default router;
