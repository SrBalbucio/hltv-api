import express from "express";
import swaggerUi from "swagger-ui-express";

import indexController from "./controller/indexController";
import teamsController from "./controller/teamsController";
import matchesController from "./controller/matchesController";
import playersController from "./controller/playersController";
import utilsController from "./controller/utilsController";
import eventsController from "./controller/eventsController";

import { PORT } from "./service/env";
import { redisClient } from "./service/redis";
import { createPage } from "./util/createPage";

import swaggerDocs from './documentation/swagger.json';

const DEFAULT_RESPONSE = {
  status: "online",
  site: "https://www.hltv.org/",
  version: 1,
};

const app = express();

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs))

app.use((req, res, next) => {
  const startedAt = Date.now();
  console.log(`[http] ${req.method} ${req.originalUrl} -> started`);
  res.on("finish", () => {
    const ms = Date.now() - startedAt;
    const stale = res.getHeader("X-Stale") ? " stale=true" : "";
    console.log(`[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${ms}ms${stale}`);
  });
  next();
});

app.get("/", (req, res) => {
  res.json(DEFAULT_RESPONSE);
});

app.get("/api/v1", (req, res) => {
  res.json(DEFAULT_RESPONSE);
});

app.get("/api/v1/health", async (_req, res) => {
  const startedAt = Date.now();
  const checks: Record<string, string> = {};
  let ok = true;

  try {
    await redisClient.ping();
    checks.redis = "up";
  } catch {
    checks.redis = "down";
    ok = false;
  }

  checks.browser = "unknown";
  try {
    const [page] = await createPage();
    await page.close().catch(() => {});
    checks.browser = "up";
  } catch {
    checks.browser = "down";
    ok = false;
  }
  checks.checkMs = String(Date.now() - startedAt);

  console.log(`[health] redis=${checks.redis} browser=${checks.browser} ${checks.checkMs}ms`);
  res.status(ok ? 200 : 503).json({ status: ok ? "online" : "degraded", ...checks });
});

app.use("/api/v1", indexController);
app.use("/api/v1/team", teamsController);
app.use("/api/v1/match", matchesController);
app.use("/api/v1/player", playersController);
app.use("/api/v1/event", eventsController);
app.use("/api/v1/util", utilsController);

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(`[unhandled] ${req.method} ${req.originalUrl} ${detail}`);
  if (res.headersSent) return;
  res.status(500).json({ message: "Error on server.", code: "UNHANDLED_ERROR" });
});

app.listen(PORT, async () => {
  console.log(`[boot] starting api on port ${PORT} (env: REDIS_URL=${process.env.REDIS_URL ? "set" : "missing"}, HEADLESS=${process.env.HEADLESS}, CF_CHALLENGE_WAIT_MS=${process.env.CF_CHALLENGE_WAIT_MS || "default"}, NAV_TIMEOUT_MS=${process.env.NAV_TIMEOUT_MS || "default"}, capsolver=${process.env.CAPSOLVER_API_KEY ? "on" : "off"})`);
  try {
    await redisClient.connect();
    console.log(`[boot] redis connected`);
  } catch (error) {
    console.error(`[boot] redis connect failed: ${(error as Error)?.message || error} (continuing without cache)`);
  }

  console.log(`Listening on port: ${PORT}`);
});
