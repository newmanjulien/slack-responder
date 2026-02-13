import { describe, expect, it } from "vitest";
import { parseRoutingKey } from "../../src/handlers/messages/channelMessage.js";

describe("parseRoutingKey", () => {
  it("parses valid relay topics", () => {
    expect(parseRoutingKey("relay:T123:U456")).toEqual({ teamId: "T123", userId: "U456" });
  });

  it("returns null for invalid topics", () => {
    expect(parseRoutingKey("relay:T123")).toBeNull();
    expect(parseRoutingKey("other:T123:U456")).toBeNull();
    expect(parseRoutingKey("")).toBeNull();
    expect(parseRoutingKey(undefined)).toBeNull();
  });
});
