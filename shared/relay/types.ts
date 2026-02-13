export type RelayDirection = "inbound" | "outbound";

export type RelayFile = {
  filename?: string;
  mimeType?: string;
  size?: number;
  sourceFileId?: string;
  sourceWorkspace?: string;
};

export type RelayEnvelope = {
  relayKey: string;
  teamId: string;
  userId: string;
  direction: RelayDirection;
  text?: string;
  files?: RelayFile[];
  externalId?: string;
};

export const buildRelayKey = (parts: Array<string | undefined | null>) =>
  parts.filter(Boolean).join(":");

export const SOURCE_WORKSPACE_USER_APP = "userApp";
export const SOURCE_WORKSPACE_RESPONDER = "responder";
