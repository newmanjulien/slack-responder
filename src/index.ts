import "dotenv/config";
import { pathToFileURL } from "node:url";
import { createBoltApp } from "./app/createBoltApp.js";
import { getConfig } from "./lib/config.js";
import { logger } from "./lib/logger.js";

const { app } = createBoltApp();
const { port } = getConfig();

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  (async () => {
    await app.start(port);
    logger.info({ port }, "⚡️ Slack responder app is running");
  })();
}

export { app };
