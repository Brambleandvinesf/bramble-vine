import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "../lib/coming-soon";

export const Route = createFileRoute("/receipts")({
  head: () => ({ meta: [{ title: "Bramble & Vine — Receipts" }] }),
  component: () => <ComingSoon label="RECEIPTS" />,
});
