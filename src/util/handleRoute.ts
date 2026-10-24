import { Request, Response } from "express";
import { HLTVError } from '../error/HLTVError';

function errorCode(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|net::|navigation|goto/i.test(`${name} ${message}`)) return "NAV_TIMEOUT";
  if (/redis|hget|hset|ECONNREFUSED|WRONGTYPE/i.test(`${name} ${message}`)) return "REDIS_ERROR";
  return "SCRAPE_PARSE_ERROR";
}

export async function handleRoute(
  callback: () => Promise<any>,
  res: Response<any, Record<string, any>>,
  req?: Request
) {
  try {
    await callback();
  } catch (error) {
    if (error instanceof HLTVError) {
      if (req) {
        console.error(
          `[route] ${req.method} ${req.originalUrl} -> HLTVError status=${error.status} code=${error.code || "-"} message=${error.message}`
        );
      }
      return res.status(error.status).json({ error });
    }

    const code = errorCode(error);
    if (req) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error(`[route] ${req.method} ${req.originalUrl} -> 500 code=${code} ${detail}`);
    }

    res.status(500).json({
      message: "Error on server.",
      code,
      error,
    });
  }
}
