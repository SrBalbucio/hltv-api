import { Request, Response } from "express";

import { redisClient } from "../service/redis";
import { handleRoute } from "./handleRoute";

interface HandleRouteParams {
  res: Response<any, Record<string, any>>;
  req?: Request;

  expire?: number;
  key: string;
  field: string;
  fetchData: () => Promise<any>;
}

const STALE_EXPIRE_SECONDS = 60 * 60 * 24 * 7; // one week

const staleKey = (key: string, field: string) => `stale:${key}:${field}`;

export async function cacheRoute({
  res,
  req,
  key,
  field,
  fetchData,
  expire = 60 * 60, // one hour
}: HandleRouteParams) {
  let valueFound: unknown = null;
  try {
    valueFound = await redisClient.hGet(key, field);
  } catch (error) {
    console.error(
      `[cache] hGet failed key=${key} field=${field} ${(error as Error)?.message || error}`
    );
  }

  if (typeof valueFound === "string") {
    try {
      const parsed = JSON.parse(valueFound);
      console.log(`[cache] hit key=${key} field=${field}`);
      return res.json(parsed);
    } catch (error) {
      console.error(
        `[cache] corrupted cache key=${key} field=${field}, evicting: ${(error as Error)?.message || error}`
      );
      try {
        await redisClient.hDel(key, field);
      } catch {}
    }
  }

  handleRoute(async () => {
    console.log(`[cache] miss key=${key} field=${field} -> scraping`);
    const scrapeStartedAt = Date.now();
    try {
      const value = await fetchData();
      console.log(`[cache] scrape ok key=${key} field=${field} ${Date.now() - scrapeStartedAt}ms`);

      if (value.notCache) {
        return res.status(value.status).send();
      }

      try {
        await redisClient.hSet(key, field, JSON.stringify(value));

        await redisClient.expire(key, expire)

        // Last-known-good copy, served when the scraper fails (e.g. HLTV
        // behind a Cloudflare challenge) so consumers keep degrading
        // gracefully instead of losing the feed.
        await redisClient.set(staleKey(key, field), JSON.stringify(value), {
          EX: STALE_EXPIRE_SECONDS,
        });
      } catch (error) {
        console.error(
          `[cache] hSet failed key=${key} field=${field} ${(error as Error)?.message || error}`
        );
      }

      res.json(value);
    } catch (error) {
      console.error(`[cache] scrape fail key=${key} field=${field} ${Date.now() - scrapeStartedAt}ms: ${(error as Error)?.message || error}`);
      let stale: unknown = null;
      try {
        stale = await redisClient.get(staleKey(key, field));
      } catch (staleError) {
        console.error(
          `[cache] stale get failed key=${key} field=${field} ${(staleError as Error)?.message || staleError}`
        );
      }

      if (typeof stale === "string" && stale) {
        try {
          console.log(`[cache] stale hit key=${key} field=${field} (X-Stale)`);
          return res.set("X-Stale", "true").json(JSON.parse(stale));
        } catch (parseError) {
          console.error(
            `[cache] corrupted stale key=${key} field=${field}: ${(parseError as Error)?.message || parseError}`
          );
        }
      }

      throw error;
    }
  }, res, req);
}
