import type { WebClient } from "@slack/web-api";
import { WebClient as SlackWebClient } from "@slack/web-api";
import express from "express";
import { getConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { verifyRelayFileSignature } from "../../shared/relay/contract.js";
import { claimRelayFileToken, finalizeRelayFileToken, releaseRelayFileToken } from "../data/relayTokens.js";

const resolveFileInfo = async (client: WebClient, fileId: string) => {
  const info = await client.files.info({ file: fileId });
  const file = info.file as { url_private_download?: string; url_private?: string; name?: string; mimetype?: string; size?: number } | undefined;
  if (!file) throw new Error("file_not_found");
  return {
    url: typeof file.url_private_download === "string" ? file.url_private_download : typeof file.url_private === "string" ? file.url_private : "",
    name: file.name || "file",
    mimetype: file.mimetype || "application/octet-stream",
    size: typeof file.size === "number" ? file.size : undefined,
  };
};

export const registerRelayFileRoutes = (payload: { receiver: { app: express.Application } }) => {
  const { receiver } = payload;

  receiver.app.get("/relay/file", async (req, res) => {
    try {
      const { RELAY_WEBHOOK_SECRET, SLACK_BOT_TOKEN } = getConfig();
      const teamId = String(req.query.teamId || "");
      const fileId = String(req.query.fileId || "");
      const expiresAt = Number(req.query.expiresAt || 0);
      const filename = String(req.query.filename || "");
      const mimeType = String(req.query.mimeType || "");
      const size = String(req.query.size || "");
      const token = String(req.query.token || "");
      const sig = String(req.query.sig || "");

      if (!teamId || !fileId || !expiresAt || !sig || !token) {
        return res.status(400).json({ ok: false, error: "missing_params" });
      }
      if (Date.now() > expiresAt) {
        return res.status(401).json({ ok: false, error: "expired" });
      }

      const validSig = verifyRelayFileSignature(RELAY_WEBHOOK_SECRET, {
        teamId,
        fileId,
        expiresAt,
        filename,
        mimeType,
        size: size ? Number(size) : undefined,
        token,
      }, sig);
      if (!validSig) {
        return res.status(401).json({ ok: false, error: "invalid_signature" });
      }

      const claimed = await claimRelayFileToken({ teamId, fileId, token, ttlMs: 60_000 });
      if (!claimed?.ok) {
        return res.status(401).json({ ok: false, error: "token_unavailable" });
      }

      const client = new SlackWebClient(SLACK_BOT_TOKEN);
      const file = await resolveFileInfo(client, fileId);
      if (!file.url) {
        return res.status(404).json({ ok: false, error: "missing_file_url" });
      }

      const response = await fetch(file.url, { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } });
      if (!response.ok || !response.body) {
        return res.status(502).json({ ok: false, error: "file_fetch_failed" });
      }

      res.setHeader("content-type", file.mimetype);
      if (file.size) {
        res.setHeader("content-length", String(file.size));
      }
      const safeName = file.name
        .replace(/[^\x20-\x7E]+/g, "")
        .replace(/["\\]/g, "")
        .trim();
      if (safeName) {
        res.setHeader("content-disposition", `attachment; filename="${safeName}"`);
      }

      const readable = Readable.fromWeb(response.body as unknown as ReadableStream);
      await pipeline(readable, res);
      await finalizeRelayFileToken({ teamId, fileId, token });
    } catch (error) {
      if (typeof req.query.token === "string" && typeof req.query.teamId === "string" && typeof req.query.fileId === "string") {
        await releaseRelayFileToken({
          teamId: String(req.query.teamId || ""),
          fileId: String(req.query.fileId || ""),
          token: String(req.query.token || ""),
        });
      }
      logger.error({ error }, "Relay file proxy failed");
      return res.status(500).json({ ok: false, error: "server_error" });
    }
  });
};
