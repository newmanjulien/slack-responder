import { getConvexClient } from "../lib/convexClient.js";
import { api } from "@newmanjulien/overbase-contracts";

export const getChannelByTeamUser = async (teamId: string, userId: string) => {
  const client = getConvexClient();
  return client.query(api.relay.channels.getChannelByTeamUser, { teamId, userId });
};

export const setChannelForTeamUser = async (payload: {
  teamId: string;
  userId: string;
  channelId: string;
  channelName?: string;
}) => {
  const client = getConvexClient();
  return client.mutation(api.relay.channels.setChannelForTeamUser, payload);
};

export const enqueueOutbound = async (payload: {
  relayKey: string;
  teamId: string;
  userId: string;
  text?: string;
  files?: Array<{
    filename?: string;
    mimeType?: string;
    size?: number;
    sourceFileId?: string;
    sourceWorkspace?: string;
  }>;
  externalId?: string;
}) => {
  const client = getConvexClient();
  return client.mutation(api.relay.messages.enqueueRelay, {
    relayKey: payload.relayKey,
    direction: "outbound",
    teamId: payload.teamId,
    userId: payload.userId,
    text: payload.text,
    files: payload.files,
    externalId: payload.externalId,
  });
};

export const dispatchOutbound = async (payload: {
  relayKey: string;
  teamId: string;
  userId: string;
  text?: string;
  files?: Array<{
    filename?: string;
    mimeType?: string;
    size?: number;
    sourceFileId?: string;
    sourceWorkspace?: string;
  }>;
  messageId?: string;
}) => {
  const client = getConvexClient();
  return client.action(api.relay.dispatch.dispatchOutbound, payload);
};

export const getUserAppBotToken = async (teamId: string, secret: string) => {
  const client = getConvexClient();
  return client.query(api.relay.installations.getUserAppBotToken, { teamId, secret });
};
