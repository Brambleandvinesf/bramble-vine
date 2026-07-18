import { createFileRoute } from "@tanstack/react-router";
import confirmHtml from "../legacy/confirm.html?raw";
import { LegacyPage } from "../lib/LegacyPage";

export const Route = createFileRoute("/confirm")({
  head: () => ({
    meta: [
      { title: "Bramble & Vine — Confirm Special Loading" },
      { name: "description", content: "Confirm today's special project items are loaded." },
    ],
  }),
  component: () => <LegacyPage html={confirmHtml} />,
});
