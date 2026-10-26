import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageAuth } from "@/auth/page-auth";
import { canManagePeople, getMembership } from "@/auth/rbac";
import { listMembers, listParticipants, listPendingInvitations } from "@/repositories/groups";
import { getParticipantBalances } from "@/repositories/ledger";
import { Badge, PageHeader } from "@/components/ui";
import { Money } from "@/components/money";
import { AddParticipantForm, InviteMemberForm, ParticipantStatusButton } from "@/components/participant-admin";
import { MemberActions } from "@/components/member-admin";
import { GroupSettings } from "@/components/group-settings";

export const metadata: Metadata = { title: "Participants", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ParticipantsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const auth = await requirePageAuth(`/groups/${groupId}/participants`);
  const membership = await getMembership(groupId, auth.user.id);
  if (!membership) notFound();
  const isOwner = membership.role === "OWNER";
  const canManage = membership.groupStatus === "ACTIVE" && canManagePeople(membership.role);
  // Archiving and deletion stay reachable for an owner; only writes that the server blocks while a
  // group is archived are hidden here.
  const canChangeMembership = isOwner && membership.groupStatus === "ACTIVE";

  const [participants, members, pendingInvites, balanceData] = await Promise.all([
    listParticipants(groupId),
    listMembers(groupId),
    isOwner ? listPendingInvitations(groupId) : Promise.resolve([]),
    getParticipantBalances(groupId),
  ]);
  const balanceById = new Map(balanceData.balances.map((row) => [row.participantId, row.netMinor]));
  const activeMembers = members.filter((member) => member.status === "ACTIVE");

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="People and permissions"
        title="Participants"
        description="Participants carry ledger history and do not require accounts. Members sign in and have a role. The two can be linked through an invitation."
      />

      <section className="card">
        <div className="card-header">
          <h2>Participant ledger profiles</h2>
          <span className="small muted">{participants.filter((participant) => participant.status === "ACTIVE").length} active</span>
        </div>
        <div className="card-body">
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th scope="col">Participant</th>
                  <th scope="col">Linked account</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Net balance</th>
                  {canManage ? <th scope="col">Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {participants.map((participant) => (
                  <tr key={participant.id}>
                    <td className="name">{participant.displayName}</td>
                    <td className="small">
                      {participant.linkedName
                        ? canManage
                          ? `${participant.linkedName} · ${participant.linkedEmail}`
                          : participant.linkedName
                        : "No account"}
                    </td>
                    <td><Badge variant={participant.status === "ACTIVE" ? "active" : "inactive"}>{participant.status.toLowerCase()}</Badge></td>
                    <td className="num">
                      <Money minor={balanceById.get(participant.id) ?? 0n} currency={membership.currency} signed note />
                    </td>
                    {canManage ? (
                      <td>
                        <ParticipantStatusButton
                          groupId={groupId}
                          participantId={participant.id}
                          displayName={participant.displayName}
                          status={participant.status}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canManage ? <AddParticipantForm groupId={groupId} /> : null}
          <p className="small muted" style={{ marginTop: "0.8rem" }}>
            Deactivating a participant hides them from new expenses but keeps every historical split and balance. A
            participant with a non-zero balance still appears in the settlement plan.
          </p>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Members and roles</h2>
          <span className="small muted">signed-in accounts</span>
        </div>
        <div className="card-body">
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  {canManage ? <th scope="col">Email</th> : null}
                  <th scope="col">Role</th>
                  <th scope="col">Joined</th>
                  {canChangeMembership ? <th scope="col">Controls</th> : null}
                </tr>
              </thead>
              <tbody>
                {activeMembers.map((member) => (
                  <tr key={member.userId}>
                    <td className="name">
                      {member.displayName}
                      {member.userId === auth.user.id ? <span className="small muted"> · you</span> : null}
                    </td>
                    {canManage ? <td className="small">{member.email}</td> : null}
                    <td><Badge variant={member.role.toLowerCase()}>{member.role.toLowerCase()}</Badge></td>
                    <td className="mono small">{member.joinedAt.toISOString().slice(0, 10)}</td>
                    {canChangeMembership ? (
                      <td>
                        <MemberActions
                          groupId={groupId}
                          member={{ userId: member.userId, displayName: member.displayName, role: member.role }}
                          isOwner={isOwner}
                          isSelf={member.userId === auth.user.id}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="notice" style={{ marginTop: "1rem" }}>
            <strong>Role boundaries.</strong> Owners manage membership, currency, and deletion. Editors create and correct
            transactions, imports, and budgets. Members read everything and can record only payments they send themselves.
          </div>
        </div>
      </section>

      {canChangeMembership ? (
        <section className="card">
          <div className="card-header">
            <h2>Invite a member</h2>
            <span className="small muted">owner only</span>
          </div>
          <div className="card-body">
            <InviteMemberForm
              groupId={groupId}
              siteUrl={process.env.APP_URL ?? "http://localhost:3000"}
              pendingInvites={pendingInvites.map((invite) => ({
                id: invite.id,
                email: invite.email,
                role: invite.role,
                expiresAt: invite.expiresAt.toISOString(),
              }))}
            />
          </div>
        </section>
      ) : null}

      {isOwner ? (
        <GroupSettings groupId={groupId} groupName={membership.groupName} archived={membership.groupStatus === "ARCHIVED"} />
      ) : null}

      {!canManage ? (
        <p className="notice">
          You have the member role. The participant list and balances are visible, but adding people, inviting members,
          archiving, and deletion are owner or editor actions.
        </p>
      ) : null}
    </div>
  );
}
