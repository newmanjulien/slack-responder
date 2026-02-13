import { getConvexClient } from "../lib/convexClient.js";
import { api } from "../../shared/convex-api/api.js";

export const getChannelByTeamUser = async (teamId: string, userId: string) => {
  const client = getConvexClient();
  return client.query(api.responder.relayChannels.getChannelByTeamUser, { teamId, userId });
};

export const setChannelForTeamUser = async (payload: {
  teamId: string;
  userId: string;
  channelId: string;
  channelName?: string;
}) => {
  const client = getConvexClient();
  return client.mutation(api.responder.relayChannels.setChannelForTeamUser, payload);
};

export const enqueueOutbound = async (payload: {
  teamId: string;
  userId: string;
  text?: string;
  files?: Array<{
    filename?: string;
    mimeType?: string;
    size: number;
    proxyUrl?: string;
    expiresAt?: number;
  }>;
  externalId?: string;
}) => {
  const client = getConvexClient();
  return client.mutation(api.responder.relay.enqueueOutbound, payload);
};

export const dispatchOutbound = async (payload: {
  teamId: string;
  userId: string;
  text?: string;
  files?: Array<{
    filename?: string;
    mimeType?: string;
    size: number;
    proxyUrl?: string;
    expiresAt?: number;
  }>;
  messageId?: string;
}) => {
  const client = getConvexClient();
  return client.action(api.responder.dispatch.dispatchOutbound, payload);
};
