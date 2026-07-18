import { createFileRoute } from "@tanstack/react-router";
import navigateHtml from "../legacy/navigate.html?raw";
import { LegacyPage } from "../lib/LegacyPage";

export const Route = createFileRoute("/navigate")({
  head: () => ({
    meta: [
      { title: "Bramble & Vine — Navigate" },
      { name: "description", content: "Launch turn-by-turn navigation to the next stop." },
    ],
  }),
  component: () => <LegacyPage html={navigateHtml} />,
});
