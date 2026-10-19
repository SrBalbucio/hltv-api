import { Response } from "express";

import { redisClient } from "../service/redis";
import { handleRoute } from "./handleRoute";

interface HandleRouteParams {
  res: Response<any, Record<string, any>>;

  expire?: number;
  key: string;
  field: string;
  fetchData: () => Promise<any>;
}

const STALE_EXPIRE_SECONDS = 60 * 60 * 24 * 7; // one week

const staleKey = (key: string, field: string) => `stale:${key}:${field}`;

export async function cacheRoute({
  res,
  key,
  field,
  fetchData,
  expire = 60 * 60, // one hour
}: HandleRouteParams) {
  const valueFound = await redisClient.hGet(key, field);

  if (valueFound) {
    return res.json(JSON.parse(valueFound));
  }

  handleRoute(async () => {
    try {
      const value = await fetchData();

      if (value.notCache) {
        return res.status(value.status).send();
      }

      await redisClient.hSet(key, field, JSON.stringify(value));

      await redisClient.expire(key, expire)

      // Last-known-good copy, served when the scraper fails (e.g. HLTV
      // behind a Cloudflare challenge) so consumers keep degrading
      // gracefully instead of losing the feed.
      await redisClient.set(staleKey(key, field), JSON.stringify(value), {
        EX: STALE_EXPIRE_SECONDS,
      });

      res.json(value);
    } catch (error) {
      const stale = await redisClient
        .get(staleKey(key, field))
        .catch(() => null);

      if (stale) {
        return res.set("X-Stale", "true").json(JSON.parse(stale));
      }

      throw error;
    }
  }, res);
}
