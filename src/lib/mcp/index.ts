import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listRecentMessages from "./tools/list-recent-messages";
import searchMessages from "./tools/search-messages";
import getMessage from "./tools/get-message";
import markRead from "./tools/mark-read";
import markUnread from "./tools/mark-unread";
import deleteMessage from "./tools/delete-message";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "bramble-and-vine-mcp",
  title: "Bramble & Vine Inbox",
  version: "0.1.0",
  instructions:
    "Tools for the Bramble & Vine unified inbox (Gmail + Quo). Use `list_recent_messages` " +
    "or `search_messages` to browse, `get_message` for full content, and `mark_read` / " +
    "`mark_unread` / `delete_message` to manage messages.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listRecentMessages,
    searchMessages,
    getMessage,
    markRead,
    markUnread,
    deleteMessage,
  ],
});
