import type { App, AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { GenericMessageEvent } from "@slack/types";
import { WebClient } from "@slack/web-api";
import { logger } from "../../lib/logger.js";
import { enqueueOutbound, dispatchOutbound } from "../../data/relay.js";
import { getConfig } from "../../lib/config.js";
import { buildRelayFileProxyUrl } from "../../../shared/relay/contract.js";
import { createRelayFileToken } from "../../data/relayTokens.js";

type MessageArgs = SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs;

type RoutingKey = { teamId: string; userId: string } | null;

type ChannelInfo = {
  id: string;
  name?: string;
  topic?: { value?: string };
};

const isUserMessage = (message: MessageArgs["message"]): message is GenericMessageEvent => {
  return Boolean(
    message &&
      message.type === "message" &&
      (message.subtype === undefined || message.subtype === "file_share") &&
      typeof (message as GenericMessageEvent).user === "string",
  );
};

export const parseRoutingKey = (topic?: string): RoutingKey => {
  if (!topic) return null;
  const match = topic.match(/^relay:([^:]+):([^:]+)$/);
  if (!match) return null;
  return { teamId: match[1], userId: match[2] };
};

const isResponderChannelName = (name?: string) => {
  if (!name) return false;
  return name.startsWith("ob-");
};

const isResponderChannel = (channel: ChannelInfo) => {
  const topicValue = channel.topic?.value;
  return (
    Boolean(parseRoutingKey(typeof topicValue === "string" ? topicValue : undefined)) ||
    isResponderChannelName(channel.name)
  );
};

const getRoutingKeyFromChannel = async (
  client: WebClient,
  channel: string,
): Promise<{ routing: RoutingKey; channelInfo: ChannelInfo | null }> => {
  const info = await client.conversations.info({ channel });
  const channelInfo = info.channel as ChannelInfo | undefined;
  if (!channelInfo) return { routing: null, channelInfo: null };
  const topic = channelInfo.topic?.value;
  return {
    routing: parseRoutingKey(typeof topic === "string" ? topic : undefined),
    channelInfo,
  };
};

export const registerChannelMessageHandler = (app: App) => {
  app.message(async ({ message, body, client }: MessageArgs) => {
    if (!message || !isUserMessage(message)) return;
    if (!message.channel || typeof message.channel !== "string") return;

    try {
      const { routing, channelInfo } = await getRoutingKeyFromChannel(
        client as WebClient,
        message.channel,
      );
      if (!channelInfo || !isResponderChannel(channelInfo)) return;
      if (!routing) return;

      const userText = typeof message.text === "string" ? message.text.trim() : "";
      const files = Array.isArray(message.files) ? message.files : [];

      const { APP_BASE_URL, RELAY_WEBHOOK_SECRET } = getConfig();
      const expiresAt = Date.now() + 15 * 60 * 1000;

      const outboundFiles = await Promise.all(
        files.map(async (file) => {
          if (!file || typeof file.id !== "string" || typeof file.size !== "number") return null;
          const tokenResult = await createRelayFileToken({
            teamId: routing.teamId,
            fileId: file.id,
            expiresAt,
          });
          const token = tokenResult?.token;
          if (!token) return null;
          const filename = typeof file.name === "string" ? file.name : undefined;
          const mimeType = typeof file.mimetype === "string" ? file.mimetype : undefined;
          const size = typeof file.size === "number" ? file.size : undefined;
          if (!size) return null;
          return {
            filename,
            mimeType,
            size,
            expiresAt,
            proxyUrl: buildRelayFileProxyUrl(
              {
                teamId: routing.teamId,
                fileId: file.id,
                expiresAt,
                filename,
                mimeType,
                size,
                token,
              },
              RELAY_WEBHOOK_SECRET,
              APP_BASE_URL,
            ),
          };
        }),
      );

      const filteredFiles = outboundFiles.filter(
        (file): file is NonNullable<typeof file> => Boolean(file && file.size > 0),
      );

      const enqueueResult = await enqueueOutbound({
        teamId: routing.teamId,
        userId: routing.userId,
        text: userText || undefined,
        files: filteredFiles.length > 0 ? filteredFiles : undefined,
        externalId: body?.event_id || message.ts,
      });

      await dispatchOutbound({
        teamId: routing.teamId,
        userId: routing.userId,
        text: userText || undefined,
        files: filteredFiles.length > 0 ? filteredFiles : undefined,
        messageId: enqueueResult?.id as string | undefined,
      });
    } catch (error) {
      logger.error({ error }, "Responder message handling failed");
    }
  });
};
