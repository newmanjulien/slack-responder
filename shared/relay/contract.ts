import crypto from "crypto";

export type RelayFileProxyParams = {
  teamId: string;
  fileId: string;
  expiresAt: number;
  filename?: string;
  mimeType?: string;
  size?: number;
  token?: string;
};

const normalize = (value: string | number | undefined) =>
  value === undefined || value === null ? "" : String(value);

export const buildRelayFileSignaturePayload = (payload: RelayFileProxyParams) => {
  return [
    payload.teamId,
    payload.fileId,
    normalize(payload.expiresAt),
    normalize(payload.filename),
    normalize(payload.mimeType),
    normalize(payload.size),
    normalize(payload.token),
  ].join(":");
};

export const signRelayFilePayload = (secret: string, payload: RelayFileProxyParams) => {
  const payloadString = buildRelayFileSignaturePayload(payload);
  return crypto.createHmac("sha256", secret).update(payloadString).digest("hex");
};

export const safeEqual = (left: string, right: string) => {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length !== rightBuf.length) return false;
  return crypto.timingSafeEqual(leftBuf, rightBuf);
};

export const verifyRelayFileSignature = (
  secret: string,
  payload: RelayFileProxyParams,
  signature: string,
) => {
  const expected = signRelayFilePayload(secret, payload);
  return safeEqual(expected, signature);
};

export const buildRelayFileProxyUrl = (
  payload: RelayFileProxyParams,
  secret: string,
  baseUrl: string,
) => {
  const sig = signRelayFilePayload(secret, payload);
  const params = new URLSearchParams({
    teamId: payload.teamId,
    fileId: payload.fileId,
    expiresAt: String(payload.expiresAt),
    filename: payload.filename || "",
    mimeType: payload.mimeType || "",
    size: typeof payload.size === "number" ? String(payload.size) : "",
    token: payload.token || "",
    sig,
  });
  return `${baseUrl.replace(/\/$/, "")}/relay/file?${params.toString()}`;
};
