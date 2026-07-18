import { createFileRoute } from "@tanstack/react-router";
import loadingHtml from "../legacy/loading.html?raw";
import { LegacyPage } from "../lib/LegacyPage";

export const Route = createFileRoute("/loading")({
  head: () => ({
    meta: [
      { title: "Bramble & Vine — Loading Checklist" },
      { name: "description", content: "Per-client loading checklist for today's route." },
    ],
  }),
  component: () => <LegacyPage html={loadingHtml} />,
});
