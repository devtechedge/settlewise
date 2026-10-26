import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAuth } from "@/auth/page-auth";
import { getMembership } from "@/auth/rbac";
import { listParticipants } from "@/repositories/groups";
import { ExpenseForm } from "@/components/expense-form";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "New expense", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NewExpensePage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const auth = await requirePageAuth(`/groups/${groupId}/expenses/new`);
  const membership = await getMembership(groupId, auth.user.id);
  if (!membership) notFound();

  if (membership.role === "MEMBER") {
    return (
      <div className="card">
        <div className="card-body stack">
          <p className="eyebrow">Authorization denied</p>
          <h2>Your role can read this ledger, not add to it</h2>
          <p className="muted">Members can view transactions and record payments they send. Ask an owner for the editor role if you also enter expenses.</p>
          <Link href={`/groups/${groupId}/expenses`} className="button">Back to expenses</Link>
        </div>
      </div>
    );
  }

  const participants = await listParticipants(groupId);
  const linked = participants.find((participant) => participant.userId === auth.user.id);
  const defaultPayer = linked?.id ?? participants.find((participant) => participant.status === "ACTIVE")?.id ?? "";

  return (
    <div>
      <PageHeader
        eyebrow="New ledger entry"
        title="Record an expense"
        description={`One canonical currency: ${membership.currency}. The server recalculates every allocation before saving, so the preview cannot drift from the stored result.`}
      />
      {membership.groupStatus === "ARCHIVED" ? (
        <div className="card">
          <div className="card-body stack">
            <p className="eyebrow">Archived group</p>
            <h2>This ledger is read-only</h2>
            <p className="muted">Restore the group from the participants page before adding expenses.</p>
            <Link href={`/groups/${groupId}/expenses`} className="button">Back to expenses</Link>
          </div>
        </div>
      ) : (
        <ExpenseForm
          groupId={groupId}
          currency={membership.currency}
          participants={participants.map((participant) => ({
            id: participant.id,
            displayName: participant.displayName,
            status: participant.status,
          }))}
          mode="create"
          defaultPayerId={defaultPayer}
        />
      )}
    </div>
  );
}
