import { createClient } from "redis";

import { REDIS_URL } from "./env";

export const redisClient = createClient({ url: REDIS_URL,  });

redisClient.on("error", (err) => {
  console.error(
    `[redis] error on ${REDIS_URL}: ${(err as Error)?.message || err}`
  );
});

redisClient.on("connect", () => {
  console.log(`[redis] connecting to ${REDIS_URL}`);
});

redisClient.on("ready", () => {
  console.log(`[redis] ready`);
});

redisClient.on("reconnecting", () => {
  console.log(`[redis] reconnecting...`);
});
