import { createFileRoute } from "@tanstack/react-router";
import calendarHtml from "../legacy/calendar.html?raw";
import { LegacyPage } from "../lib/LegacyPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bramble & Vine — Schedule" },
      { name: "description", content: "Daily and weekly schedule for Bramble & Vine crews." },
      { property: "og:title", content: "Bramble & Vine — Schedule" },
      { property: "og:description", content: "Daily and weekly schedule for Bramble & Vine crews." },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  return <LegacyPage html={calendarHtml} />;
}
