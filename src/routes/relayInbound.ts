import type { WebClient } from "@slack/web-api";
import { WebClient as SlackWebClient } from "@slack/web-api";
import express from "express";
import { getConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { getChannelByTeamUser, setChannelForTeamUser } from "../data/relay.js";
import { retryWithBackoff, sleep } from "../lib/retry.js";
import { getRateLimiter } from "../lib/rateLimit.js";
import { transferSlackFile } from "../lib/fileTransfer.js";
import { getUserAppBotToken } from "../data/relay.js";
import { SOURCE_WORKSPACE_USER_APP } from "@newmanjulien/overbase-contracts";

const sanitizeChannelName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 65);

const hashSuffix = (input: string) =>
  Math.abs(
    input.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0),
  )
    .toString(36)
    .slice(0, 4);

const buildChannelName = (teamId: string, userId: string) => {
  const base = sanitizeChannelName(`ob-${teamId}-${userId}`);
  return `${base}-${hashSuffix(`${teamId}:${userId}`)}`;
};

const findChannelByName = async (client: WebClient, name: string) => {
  let cursor: string | undefined;
  do {
    const result = await client.conversations.list({
      limit: 1000,
      cursor,
      types: "public_channel,private_channel",
    });
    const channels = (result.channels || []) as Array<{ id?: string; name?: string }>;
    const match = channels.find((channel) => channel.name === name);
    if (match?.id) return match.id;
    cursor = result.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return null;
};

const ensureChannel = async (client: WebClient, teamId: string, userId: string) => {
  const existing = await getChannelByTeamUser(teamId, userId);
  if (existing?.channelId) {
    try {
      await client.conversations.join({ channel: existing.channelId });
    } catch {
      // Ignore join failures for private channels; the bot may already be a member.
    }
    return existing.channelId;
  }

  const name = buildChannelName(teamId, userId);
  let channelId: string | null = null;
  try {
    const create = await client.conversations.create({ name });
    channelId = create.channel?.id || null;
  } catch (error) {
    const err = error as { data?: { error?: string } };
    if (err?.data?.error === "name_taken") {
      channelId = await findChannelByName(client, name);
    } else {
      throw error;
    }
  }
  if (!channelId) {
    throw new Error("channel_create_failed");
  }

  // Bot should already be a member of channels it creates.

  await client.conversations.setTopic({
    channel: channelId,
    topic: `relay:${teamId}:${userId}`,
  });

  await setChannelForTeamUser({
    teamId,
    userId,
    channelId,
    channelName: name,
  });

  return channelId;
};

const isSlackRetryable = (error: unknown) => {
  const err = error as { data?: { error?: string } };
  const code = err?.data?.error;
  return code === "ratelimited" || code === "timeout" || code === "internal_error";
};

const getSlackRetryAfterMs = (error: unknown) => {
  const err = error as { data?: { retry_after?: number } };
  const retryAfter = err?.data?.retry_after;
  if (typeof retryAfter === "number" && retryAfter > 0) {
    return retryAfter * 1000;
  }
  return null;
};

const uploadFiles = async (
  destinationToken: string,
  channel: string,
  files: Array<{ sourceFileId?: string; sourceWorkspace?: string }>,
  teamId: string,
  secret: string,
) => {
  if (files.length === 0) return;
  const tokenResult = await getUserAppBotToken(teamId, secret);
  if (!tokenResult?.ok) {
    throw new Error("missing_userapp_token");
  }
  const sourceToken = tokenResult.token;
  if (!sourceToken) {
    throw new Error("missing_userapp_token");
  }
  for (const file of files) {
    if (!file.sourceFileId) throw new Error("missing_source_file");
    if (file.sourceWorkspace !== SOURCE_WORKSPACE_USER_APP) {
      throw new Error("unexpected_source_workspace");
    }
    await transferSlackFile({
      sourceToken,
      destinationToken,
      sourceFileId: file.sourceFileId,
      destinationChannelId: channel,
    });
  }
};

export const registerRelayInboundRoutes = (payload: {
  receiver: { app: express.Application };
}) => {
  const { receiver } = payload;

  receiver.app.post("/relay/inbound", express.json({ limit: "2mb" }), async (req, res) => {
    try {
      const { RELAY_WEBHOOK_SECRET, SLACK_BOT_TOKEN } = getConfig();
      const providedKey =
        req.get("x-relay-key") ||
        req.get("authorization")?.replace("Bearer ", "");

      if (!RELAY_WEBHOOK_SECRET || !providedKey || providedKey !== RELAY_WEBHOOK_SECRET) {
        return res.status(401).json({ ok: false, error: "unauthorized" });
      }

      const body = req.body || {};
      const relayKey = body.relayKey;
      const teamId = body.teamId;
      const userId = body.userId;
      const text = typeof body.text === "string" ? body.text : "";
      const files = Array.isArray(body.files) ? body.files : [];

      if (!relayKey || !teamId || !userId) {
        return res.status(400).json({ ok: false, error: "missing_required_fields" });
      }

      const client = new SlackWebClient(SLACK_BOT_TOKEN);
      const limiter = getRateLimiter(`relay-in:${teamId}`, {
        capacity: 5,
        refillPerMs: 5 / 1000,
      });
      const delay = limiter.take(1);
      if (delay > 0) {
        await sleep(delay);
      }

      const channelId = await retryWithBackoff(
        () => ensureChannel(client, teamId, userId),
        {
          attempts: 3,
          baseDelayMs: 500,
          maxDelayMs: 4000,
          jitter: 0.2,
          isRetryable: isSlackRetryable,
          getRetryAfterMs: getSlackRetryAfterMs,
        },
      );

      if (text) {
        await retryWithBackoff(
          () => client.chat.postMessage({ channel: channelId, text }),
          {
            attempts: 3,
            baseDelayMs: 500,
            maxDelayMs: 4000,
            jitter: 0.2,
            isRetryable: isSlackRetryable,
            getRetryAfterMs: getSlackRetryAfterMs,
          },
        );
      }

      if (files.length > 0) {
        await uploadFiles(SLACK_BOT_TOKEN, channelId, files, teamId, RELAY_WEBHOOK_SECRET);
      }

      return res.json({ ok: true });
    } catch (error) {
      logger.error({ error }, "Relay inbound failed");
      return res.status(503).json({ ok: false, error: "retry" });
    }
  });
};
