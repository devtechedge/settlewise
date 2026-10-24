import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAuth } from "@/auth/page-auth";
import { getMembership } from "@/auth/rbac";
import { listParticipants } from "@/repositories/groups";
import { listImportBatches } from "@/services/imports";
import { ImportPanel } from "@/components/import-panel";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Imports", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ImportsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const auth = await requirePageAuth(`/groups/${groupId}/imports`);
  const membership = await getMembership(groupId, auth.user.id);
  if (!membership) notFound();
  const canEdit = membership.role === "OWNER" || membership.role === "EDITOR";

  if (!canEdit) {
    return (
      <div className="card">
        <div className="card-body stack">
          <p className="eyebrow">Authorization denied</p>
          <h2>Imports require the editor role</h2>
          <p className="muted">Members can read the ledger and settlements, but cannot upload statement data.</p>
          <Link href={`/groups/${groupId}`} className="button">Back to overview</Link>
        </div>
      </div>
    );
  }

  const [participants, batches] = await Promise.all([
    listParticipants(groupId),
    listImportBatches(groupId, auth.user),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Statement import"
        title="Import a CSV with a preview"
        description="Map columns, normalise rows, inspect duplicates, and choose a duplicate policy. Commit revalidates the batch and writes ledger records in one transaction."
      />
      {membership.groupStatus === "ARCHIVED" ? (
        <div className="alert" role="alert" style={{ marginBottom: "1rem" }}>
          This group is archived. Restore it before importing.
        </div>
      ) : null}
      <div className="notice" style={{ marginBottom: "1.25rem" }}>
        <strong>Need a test file?</strong> Download the{" "}
        <a href="/samples/household-expenses.csv">household example</a>, the{" "}
        <a href="/samples/travel-expenses.csv">travel example</a>, or the{" "}
        <a href="/samples/malformed-expenses.csv">intentionally malformed sample</a> to see row-level errors.
      </div>
      <ImportPanel
        groupId={groupId}
        participants={participants
          .filter((participant) => participant.status === "ACTIVE")
          .map((participant) => ({ id: participant.id, displayName: participant.displayName }))}
        batches={batches.map((batch) => ({
          ...batch,
          createdAt: batch.createdAt.toISOString(),
          committedAt: batch.committedAt?.toISOString() ?? null,
          expiresAt: batch.expiresAt.toISOString(),
        }))}
      />
    </div>
  );
}
