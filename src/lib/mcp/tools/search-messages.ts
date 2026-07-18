import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthorized } from "../supabase";

export default defineTool({
  name: "search_messages",
  title: "Search messages",
  description: "Case-insensitive search over sender name and message content.",
  inputSchema: {
    query: z.string().min(1).describe("Text to search for."),
    limit: z.number().int().min(1).max(100).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthorized();
    const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
    const { data, error } = await supabaseForUser(ctx)
      .from("messages")
      .select("id, source, sender_name, content, received_at, status")
      .or(`sender_name.ilike.${pattern},content.ilike.${pattern}`)
      .order("received_at", { ascending: false })
      .limit(limit ?? 25);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { messages: data ?? [] },
    };
  },
});
