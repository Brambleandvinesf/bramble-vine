import { createFileRoute } from "@tanstack/react-router";
import visitsHtml from "../legacy/visits.html?raw";
import { LegacyPage } from "../lib/LegacyPage";

export const Route = createFileRoute("/visits")({
  head: () => ({
    meta: [
      { title: "Visit Confirmations" },
      { name: "description", content: "Weekly visit confirmation queue and drafts." },
    ],
  }),
  component: () => <LegacyPage html={visitsHtml} />,
});
