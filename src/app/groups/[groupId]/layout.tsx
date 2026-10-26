import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAuth } from "@/auth/page-auth";
import { canEditTransactions, getMembership } from "@/auth/rbac";
import { GroupNav } from "@/components/group-nav";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const auth = await requirePageAuth(`/groups/${groupId}`);
  const membership = await getMembership(groupId, auth.user.id);
  if (!membership) notFound();
  const canEdit = membership.groupStatus === "ACTIVE" && canEditTransactions(membership.role);

  return (
    <>
      <div className="group-head">
        <div className="group-head-inner">
          <div className="group-title-row">
            <div>
              <p className="eyebrow">Group ledger</p>
              <h1>{membership.groupName}</h1>
              <div className="group-meta">
                <Badge variant={membership.role.toLowerCase()}>{membership.role}</Badge>
                <span className="mono">{membership.currency}</span>
                <span aria-hidden="true">·</span>
                <span>one canonical currency</span>
                {membership.groupStatus === "ARCHIVED" ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <Badge variant="archived">Archived</Badge>
                  </>
                ) : null}
              </div>
            </div>
            <div className="page-actions">
              <Link href={`/groups/${groupId}/settlements`} className="button secondary">
                Settlements
              </Link>
              {canEdit ? (
                <Link href={`/groups/${groupId}/expenses/new`} className="button">
                  New expense
                </Link>
              ) : null}
            </div>
          </div>
          <GroupNav groupId={groupId} canEdit={canEdit} />
        </div>
      </div>
      {membership.groupStatus === "ARCHIVED" ? (
        <div className="archived-banner">
          <div className="container">
            <span>This group is archived. Reads and exports still work; new transactions are blocked.</span>
            <Link href={`/groups/${groupId}/participants`} className="small">
              Manage archive
            </Link>
          </div>
        </div>
      ) : null}
      <div className="container group-content">{children}</div>
    </>
  );
}
