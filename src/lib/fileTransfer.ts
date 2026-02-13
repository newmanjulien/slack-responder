import type { WebClient } from "@slack/web-api";
import { WebClient as SlackWebClient } from "@slack/web-api";
import { retryWithBackoff } from "./retry.js";

const MAX_RELAY_FILE_BYTES = 200 * 1024 * 1024;

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

const resolveFileInfo = async (client: WebClient, fileId: string) => {
  const info = await client.files.info({ file: fileId });
  const file = info.file as
    | {
        url_private_download?: string;
        url_private?: string;
        name?: string;
        mimetype?: string;
        size?: number;
      }
    | undefined;
  if (!file) {
    throw new Error("file_not_found");
  }
  const url =
    typeof file.url_private_download === "string"
      ? file.url_private_download
      : typeof file.url_private === "string"
        ? file.url_private
        : "";
  return {
    url,
    name: file.name || "file",
    mimetype: file.mimetype || "application/octet-stream",
    size: typeof file.size === "number" ? file.size : undefined,
  };
};

export const transferSlackFile = async (payload: {
  sourceToken: string;
  destinationToken: string;
  sourceFileId: string;
  destinationChannelId: string;
}) => {
  const sourceClient = new SlackWebClient(payload.sourceToken);
  const destinationClient = new SlackWebClient(payload.destinationToken);

  const fileInfo = await retryWithBackoff(
    () => resolveFileInfo(sourceClient, payload.sourceFileId),
    {
      attempts: 3,
      baseDelayMs: 500,
      maxDelayMs: 4000,
      jitter: 0.2,
      isRetryable: isSlackRetryable,
      getRetryAfterMs: getSlackRetryAfterMs,
    },
  );

  if (!fileInfo.url || typeof fileInfo.size !== "number") {
    throw new Error("missing_file_metadata");
  }
  const fileSize = fileInfo.size;
  if (fileSize > MAX_RELAY_FILE_BYTES) {
    throw new Error("file_too_large");
  }

  const download = await retryWithBackoff(
    async () => {
      const response = await fetch(fileInfo.url, {
        headers: { Authorization: `Bearer ${payload.sourceToken}` },
      });
      if (!response.ok || !response.body) {
        const error = new Error(`source_fetch_failed:${response.status}`);
        (error as { status?: number }).status = response.status;
        throw error;
      }
      return response;
    },
    {
      attempts: 3,
      baseDelayMs: 500,
      maxDelayMs: 4000,
      jitter: 0.2,
      isRetryable: (err) => {
        const status = (err as { status?: number }).status;
        return status === 429 || (status !== undefined && status >= 500);
      },
      getRetryAfterMs: () => null,
    },
  );

  const uploadInfo = await retryWithBackoff(
    () =>
      destinationClient.files.getUploadURLExternal({
        filename: fileInfo.name,
        length: fileSize,
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
  if (!uploadUrl || !fileId) {
    throw new Error("missing_upload_url");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "content-type": fileInfo.mimetype,
      "content-length": String(fileSize),
    },
    duplex: "half",
    body: download.body,
  } as RequestInit);
  if (!uploadResponse.ok) {
    throw new Error(`upload_failed:${uploadResponse.status}`);
  }

  await retryWithBackoff(
    () =>
      destinationClient.files.completeUploadExternal({
        files: [{ id: fileId, title: fileInfo.name }],
        channel_id: payload.destinationChannelId,
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
};
