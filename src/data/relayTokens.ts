import { getConvexClient } from "../lib/convexClient.js";
import { api } from "../../shared/convex-api/api.js";

export const createRelayFileToken = async (payload: {
  teamId: string;
  fileId: string;
  expiresAt: number;
}) => {
  const client = getConvexClient();
  return client.mutation(api.responder.relayTokens.createToken, payload);
};

export const claimRelayFileToken = async (payload: {
  teamId: string;
  fileId: string;
  token: string;
  ttlMs: number;
}) => {
  const client = getConvexClient();
  return client.mutation(api.responder.relayTokens.claimToken, payload);
};

export const finalizeRelayFileToken = async (payload: {
  teamId: string;
  fileId: string;
  token: string;
}) => {
  const client = getConvexClient();
  return client.mutation(api.responder.relayTokens.finalizeToken, payload);
};

export const releaseRelayFileToken = async (payload: {
  teamId: string;
  fileId: string;
  token: string;
}) => {
  const client = getConvexClient();
  return client.mutation(api.responder.relayTokens.releaseToken, payload);
};
