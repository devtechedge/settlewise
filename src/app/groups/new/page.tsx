import type { Metadata } from "next";
import { requirePageAuth } from "@/auth/page-auth";
import { GroupCreateForm } from "@/components/group-create-form";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "New group", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NewGroupPage() {
  await requirePageAuth("/groups/new");
  return (
    <div className="container">
      <PageHeader
        eyebrow="New ledger"
        title="Create a group"
        description="Choose the one currency this group will use, then invite the people who share costs. You can add non-account participants later."
      />
      <GroupCreateForm siteUrl={process.env.APP_URL ?? "http://localhost:3000"} />
    </div>
  );
}
