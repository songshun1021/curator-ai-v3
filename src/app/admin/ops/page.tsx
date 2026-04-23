import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OpsDashboardApp } from "@/components/ops/OpsDashboardApp";
import { getOpsPageState } from "@/lib/ops-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Curator Internal Ops",
  description: "Curator 内部运营与运维后台",
};

export default function OpsDashboardPage() {
  const state = getOpsPageState(cookies());
  if (!state.enabled) {
    notFound();
  }

  return <OpsDashboardApp configured={state.configured} authenticated={state.authenticated} />;
}

