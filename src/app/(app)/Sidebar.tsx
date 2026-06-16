"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "./actions";
import ThemeToggle from "./ThemeToggle";
import type { SessionUser } from "@/lib/auth";
import type { PermKey } from "@/lib/permissions";

type Tone = "blue" | "green"; // โซนสีเมนู: ฟ้าอ่อน / เขียวอ่อน
type SubItem = { href: string; label: string; perm: PermKey | PermKey[]; icon?: string };
type Node =
  | { kind: "link"; icon: string; label: string; href: string; perm: PermKey | PermKey[]; tone: Tone }
  | { kind: "group"; icon: string; label: string; items: SubItem[]; tone: Tone; noNumber?: boolean };

const DASHBOARD = { href: "/", label: "Dashboard", icon: "📊", perm: "dashboard" as PermKey, tone: "blue" as Tone };

const NODES: Node[] = [
  {
    kind: "group",
    icon: "📈",
    label: "รายงาน",
    tone: "blue",
    items: [
      { href: "/reports", label: "รายงานสรุป", perm: "reports" },
      { href: "/reports/cohort", label: "Cohort Analysis", perm: "reports" },
    ],
  },
  {
    kind: "group",
    icon: "👥",
    label: "สมาชิก",
    tone: "blue",
    items: [
      { href: "/queue", label: "คิวโทร", perm: "queue" },
      { href: "/customers", label: "ลูกค้า", perm: "customers" },
      { href: "/customers/dnc", label: "ห้ามโทร (DNC)", perm: "customers" },
    ],
  },
  {
    kind: "group",
    icon: "📥",
    label: "การนำเข้าข้อมูล",
    tone: "blue",
    items: [
      { href: "/admin/import", label: "ประวัตินำเข้าข้อมูล", perm: "import" },
      { href: "/admin/export", label: "ส่งออกข้อมูล", perm: ["customers_export", "reports"] },
    ],
  },
  {
    kind: "group",
    icon: "🛠️",
    label: "การจัดการแอดมิน",
    tone: "blue",
    items: [
      { href: "/admin/users", label: "ผู้ใช้งาน", perm: ["admin", "manage_users"] },
      { href: "/admin/roles", label: "บทบาทและสิทธิ์", perm: "admin" },
      { href: "/reports/agents", label: "ผลงานพนักงาน", perm: "agents_report" },
    ],
  },
  {
    kind: "group",
    icon: "💬",
    label: "SMS",
    tone: "green",
    items: [
      { href: "/admin/sms", label: "ส่ง SMS", perm: "notifications" },
      { href: "/admin/sms/bulk", label: "ส่งหลายเบอร์", perm: "notifications" },
      { href: "/admin/sms/logs", label: "ประวัติการใช้งาน SMS", perm: "notifications" },
    ],
  },
  {
    kind: "group",
    icon: "⚙️",
    label: "Settings",
    tone: "green",
    items: [
      { href: "/admin/notifications", label: "ตั้งค่าแจ้งเตือน", perm: "notifications" },
      { href: "/admin/audit", label: "บันทึกการใช้งาน", perm: "admin" },
    ],
  },
];

// เลือกได้ลิงก์เดียวที่ "ตรงที่สุด" (prefix ยาวสุด) เพื่อกัน /reports ติด active พร้อม /reports/agents
function matchLen(href: string, pathname: string): number {
  if (href === "/") return pathname === "/" ? 1 : -1;
  if (pathname === href || pathname.startsWith(href + "/")) return href.length;
  return -1;
}

export default function Sidebar({
  user,
  brands,
}: {
  user: SessionUser;
  brands: { id: number; name: string }[];
}) {
  const pathname = usePathname();
  const has = (p: PermKey | PermKey[]) =>
    Array.isArray(p) ? p.some((k) => user.permissions.includes(k)) : user.permissions.includes(p);

  // หัวข้อ 3: เว็บไซต์ — เมนูย่อยไล่ลงมา (🔹 + ชื่อเว็บ ไม่มีเลข) กดแล้วดูลูกค้าที่กลับมาฝากของเว็บนั้น
  const websitesGroup: Node = {
    kind: "group",
    icon: "🗂️",
    label: "เว็บไซต์",
    tone: "blue",
    noNumber: true,
    items: brands.map((b) => ({
      href: `/customers?brand=${b.id}&status=DEPOSITED`,
      label: b.name,
      perm: "customers",
      icon: "🔹",
    })),
  };
  const nodes: Node[] = [...NODES.slice(0, 2), websitesGroup, ...NODES.slice(2)];

  const allHrefs = [DASHBOARD.href, ...nodes.flatMap((n) => (n.kind === "link" ? [n.href] : n.items.map((i) => i.href)))];
  let activeHref = "";
  let best = 0;
  for (const h of allHrefs) {
    const len = matchLen(h, pathname);
    if (len > best) {
      best = len;
      activeHref = h;
    }
  }

  const groupHasActive = (n: Extract<Node, { kind: "group" }>) =>
    n.items.some((i) => i.href === activeHref);
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(nodes.filter((n) => n.kind === "group" && groupHasActive(n)).map((n) => n.label))
  );
  const toggle = (label: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  const visible = nodes.map((n) =>
    n.kind === "link" ? n : { ...n, items: n.items.filter((i) => has(i.perm)) }
  ).filter((n) => (n.kind === "link" ? has(n.perm) : n.items.length > 0));

  return (
    <aside className="sidebar">
      <div className="brand">📞 CRM ติดตามลูกค้า</div>

      <nav className="nav">
        {has(DASHBOARD.perm) && (
          <Link href={DASHBOARD.href} className={activeHref === DASHBOARD.href ? "active" : ""}>
            <span>{DASHBOARD.icon}</span>
            {DASHBOARD.label}
          </Link>
        )}

        {visible.map((n, idx) => {
          const no = idx + 1;
          if (n.kind === "link") {
            return (
              <Link key={n.href} href={n.href} className={activeHref === n.href ? "active" : ""}>
                <span>{n.icon}</span>
                {no}. {n.label}
              </Link>
            );
          }
          const isOpen = open.has(n.label);
          return (
            <div key={n.label} className="nav-group">
              <button
                type="button"
                className={`group-head${isOpen ? " open" : ""}`}
                onClick={() => toggle(n.label)}
                aria-expanded={isOpen}
              >
                <span className="group-label">
                  <span>{n.icon}</span>
                  {no}. {n.label}
                </span>
                <span className="chevron">{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (
                <div className="group-items">
                  {n.items.map((it, j) => (
                    <Link key={it.href} href={it.href} className={activeHref === it.href ? "active" : ""}>
                      {n.noNumber ? (
                        <>{it.icon} {it.label}</>
                      ) : (
                        <>{no}.{j + 1} {it.label}</>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="userbox">
        <Link href="/profile" style={{ display: "block" }}>
          <div className="name">{user.displayName}</div>
          <div className="role">{user.roleName} · ตั้งค่าโปรไฟล์</div>
        </Link>
        <ThemeToggle />
        <form action={logout} style={{ marginTop: 8 }}>
          <button type="submit" className="btn btn-sm" style={{ width: "100%" }}>
            ออกจากระบบ
          </button>
        </form>
      </div>
    </aside>
  );
}
