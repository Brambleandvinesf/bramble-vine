import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthorized } from "../supabase";

export default defineTool({
  name: "list_recent_messages",
  title: "List recent messages",
  description: "Return the most recent messages in the unified inbox, newest first.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).optional().describe("Max messages to return (default 25)."),
    status: z.enum(["read", "unread", "all"]).optional().describe("Filter by status (default all)."),
    source: z.enum(["gmail", "quo", "all"]).optional().describe("Filter by source (default all)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status, source }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthorized();
    let q = supabaseForUser(ctx)
      .from("messages")
      .select("id, source, sender_name, content, received_at, status")
      .order("received_at", { ascending: false })
      .limit(limit ?? 25);
    if (status && status !== "all") q = q.eq("status", status);
    if (source && source !== "all") q = q.eq("source", source);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { messages: data ?? [] },
    };
  },
});
