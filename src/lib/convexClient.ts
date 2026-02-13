import { ConvexClient } from "convex/browser";
import { getConfig } from "./config.js";

let cached: ConvexClient | null = null;

export const getConvexClient = (): ConvexClient => {
  if (cached) return cached;
  const { CONVEX_URL } = getConfig();
  cached = new ConvexClient(CONVEX_URL);
  return cached;
};
