import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "../lib/coming-soon";

export const Route = createFileRoute("/messages")({
  head: () => ({ meta: [{ title: "Bramble & Vine — Messages" }] }),
  component: () => <ComingSoon label="MESSAGES" />,
});
