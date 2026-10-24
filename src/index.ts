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

import swaggerDocs from './documentation/swagger.json';

const DEFAULT_RESPONSE = {
  status: "online",
  site: "https://www.hltv.org/",
  version: 1,
};

const app = express();

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs))

app.use((req, _res, next) => {
  console.log(`[http] ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/", (req, res) => {
  res.json(DEFAULT_RESPONSE);
});

app.get("/api/v1", (req, res) => {
  res.json(DEFAULT_RESPONSE);
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
  await redisClient.connect();

  console.log(`Listening on port: ${PORT}`);
});
