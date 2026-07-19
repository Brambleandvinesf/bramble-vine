import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "../lib/coming-soon";

export const Route = createFileRoute("/field")({
  head: () => ({ meta: [{ title: "Bramble & Vine — Field" }] }),
  component: () => <ComingSoon label="FIELD" />,
});
