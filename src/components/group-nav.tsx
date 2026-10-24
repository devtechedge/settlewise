"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function GroupNav({ groupId, canEdit }: { groupId: string; canEdit: boolean }) {
  const pathname = usePathname();
  const base = `/groups/${groupId}`;
  const items = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/expenses`, label: "Expenses" },
    { href: `${base}/settlements`, label: "Settlements" },
    ...(canEdit ? [{ href: `${base}/imports`, label: "Imports" }] : []),
    { href: `${base}/participants`, label: "Participants" },
    { href: `${base}/reports`, label: "Reports" },
    { href: `${base}/audit`, label: "Audit" },
  ];

  return (
    <nav className="group-nav" aria-label="Group sections">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
