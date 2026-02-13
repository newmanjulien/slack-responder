/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as portal_assets from "../portal/assets.js";
import type * as portal_auth from "../portal/auth.js";
import type * as portal_billing from "../portal/billing.js";
import type * as portal_connectors from "../portal/connectors.js";
import type * as portal_people from "../portal/people.js";
import type * as portal_session from "../portal/session.js";
import type * as relay_channels from "../relay/channels.js";
import type * as relay_cleanup from "../relay/cleanup.js";
import type * as relay_dispatch from "../relay/dispatch.js";
import type * as relay_installations from "../relay/installations.js";
import type * as relay_messages from "../relay/messages.js";
import type * as relay_monitoring from "../relay/monitoring.js";
import type * as slack_conversations from "../slack/conversations.js";
import type * as slack_datasources from "../slack/datasources.js";
import type * as slack_dedup from "../slack/dedup.js";
import type * as slack_events from "../slack/events.js";
import type * as slack_installations from "../slack/installations.js";
import type * as slack_preferences from "../slack/preferences.js";
import type * as slack_recurring from "../slack/recurring.js";
import type * as slack_templates from "../slack/templates.js";
import type * as slack_templatesSeed from "../slack/templatesSeed.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  "portal/assets": typeof portal_assets;
  "portal/auth": typeof portal_auth;
  "portal/billing": typeof portal_billing;
  "portal/connectors": typeof portal_connectors;
  "portal/people": typeof portal_people;
  "portal/session": typeof portal_session;
  "relay/channels": typeof relay_channels;
  "relay/cleanup": typeof relay_cleanup;
  "relay/dispatch": typeof relay_dispatch;
  "relay/installations": typeof relay_installations;
  "relay/messages": typeof relay_messages;
  "relay/monitoring": typeof relay_monitoring;
  "slack/conversations": typeof slack_conversations;
  "slack/datasources": typeof slack_datasources;
  "slack/dedup": typeof slack_dedup;
  "slack/events": typeof slack_events;
  "slack/installations": typeof slack_installations;
  "slack/preferences": typeof slack_preferences;
  "slack/recurring": typeof slack_recurring;
  "slack/templates": typeof slack_templates;
  "slack/templatesSeed": typeof slack_templatesSeed;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
