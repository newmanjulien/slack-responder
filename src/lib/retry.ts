type RetryOptions = {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: number;
  isRetryable?: (error: unknown) => boolean;
  getRetryAfterMs?: (error: unknown) => number | null;
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> => {
  const { attempts, baseDelayMs, maxDelayMs, jitter, isRetryable, getRetryAfterMs } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryable = isRetryable ? isRetryable(error) : true;
      if (!retryable || attempt === attempts) {
        throw error;
      }
      const retryAfter = getRetryAfterMs ? getRetryAfterMs(error) : null;
      const baseDelay = retryAfter ?? Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitterAmount = baseDelay * jitter;
      const delay = baseDelay + (Math.random() * 2 - 1) * jitterAmount;
      await sleep(Math.max(0, Math.floor(delay)));
    }
  }

  throw lastError;
};
