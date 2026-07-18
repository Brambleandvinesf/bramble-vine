import { createFileRoute } from "@tanstack/react-router";
import messagesHtml from "../legacy/messages.html?raw";
import { LegacyPage } from "../lib/LegacyPage";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "Message Center" },
      { name: "description", content: "Unified inbox across Gmail and Quo." },
    ],
  }),
  component: () => <LegacyPage html={messagesHtml} />,
});
