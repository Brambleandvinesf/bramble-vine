import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "../lib/coming-soon";

export const Route = createFileRoute("/more")({
  head: () => ({ meta: [{ title: "Bramble & Vine — More" }] }),
  component: () => <ComingSoon label="MORE" />,
});
