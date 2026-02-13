import type { WebClient } from "@slack/web-api";
import { WebClient as SlackWebClient } from "@slack/web-api";
import express from "express";
import { getConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { getChannelByTeamUser, setChannelForTeamUser } from "../data/relay.js";
import { retryWithBackoff, sleep } from "../lib/retry.js";
import { getRateLimiter } from "../lib/rateLimit.js";

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

const ensureChannel = async (client: WebClient, teamId: string, userId: string) => {
  const existing = await getChannelByTeamUser(teamId, userId);
  if (existing?.channelId) return existing.channelId;

  const name = buildChannelName(teamId, userId);
  const create = await client.conversations.create({ name });
  const channelId = create.channel?.id;
  if (!channelId) {
    throw new Error("channel_create_failed");
  }

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

const uploadFiles = async (client: WebClient, channel: string, files: Array<{ proxyUrl?: string; filename?: string; mimeType?: string; size: number; expiresAt?: number; }>) => {
  for (const file of files) {
    if (typeof file.expiresAt === "number" && Date.now() > file.expiresAt) {
      throw new Error("proxy_expired");
    }
    if (!file.proxyUrl) throw new Error("missing_proxy");
    if (!file.size) throw new Error("missing_size");

    const download = await fetch(file.proxyUrl);
    if (!download.ok || !download.body) {
      throw new Error(`proxy_fetch_failed:${download.status}`);
    }

    const uploadInfo = await retryWithBackoff(
      () =>
        client.files.getUploadURLExternal({
          filename: file.filename || "file",
          length: file.size,
        }),
      {
        attempts: 3,
        baseDelayMs: 500,
        maxDelayMs: 4000,
        jitter: 0.2,
        isRetryable: isSlackRetryable,
        getRetryAfterMs: getSlackRetryAfterMs,
      },
    );

    const uploadUrl = uploadInfo.upload_url as string | undefined;
    const fileId = uploadInfo.file_id as string | undefined;
    if (!uploadUrl || !fileId) throw new Error("missing_upload_url");

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "content-type": file.mimeType || "application/octet-stream",
        "content-length": String(file.size),
      },
      duplex: "half",
      body: download.body,
    });

    if (!uploadResponse.ok) {
      throw new Error(`upload_failed:${uploadResponse.status}`);
    }

    await retryWithBackoff(
      () =>
        client.files.completeUploadExternal({
          files: [{ id: fileId, title: file.filename || "file" }],
          channel_id: channel,
        }),
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
      const teamId = body.teamId;
      const userId = body.userId;
      const text = typeof body.text === "string" ? body.text : "";
      const files = Array.isArray(body.files) ? body.files : [];

      if (!teamId || !userId) {
        return res.status(400).json({ ok: false, error: "missing_team_or_user" });
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
        await uploadFiles(client, channelId, files);
      }

      return res.json({ ok: true });
    } catch (error) {
      logger.error({ error }, "Relay inbound failed");
      return res.status(503).json({ ok: false, error: "retry" });
    }
  });
};
