import { createRequire } from "node:module";
import type { Request, Response } from "express";
import { getConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { registerRelayInboundRoutes } from "../routes/relayInbound.js";
import { registerRelayFileRoutes } from "../routes/relayFile.js";
import { registerChannelMessageHandler } from "../handlers/messages/channelMessage.js";

const require = createRequire(import.meta.url);
const bolt = require("@slack/bolt") as typeof import("@slack/bolt");
const { App, ExpressReceiver } = bolt;

export const createBoltApp = () => {
  const config = getConfig();

  const receiver = new ExpressReceiver({
    signingSecret: config.SLACK_SIGNING_SECRET,
    endpoints: "/slack/events",
    processBeforeResponse: false,
  });

  registerRelayInboundRoutes({ receiver });
  registerRelayFileRoutes({ receiver });

  const app = new App({
    receiver,
    token: config.SLACK_BOT_TOKEN,
  });

  registerChannelMessageHandler(app);

  receiver.app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  return { app, receiver };
};
