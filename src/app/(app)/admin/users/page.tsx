import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import NoAccess from "../../NoAccess";
import { formatDateTime } from "@/lib/labels";
import type { Prisma } from "@prisma/client";

type SP = Record<string, string | string[] | undefined>;
function val(sp: SP, k: string): string {
  const v = sp[k];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}
function arr(sp: SP, k: string): string[] {
  const v = sp[k];
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireSession();
  const full = can(me, "admin");
  if (!full && !can(me, "manage_users")) return <NoAccess />;
  const sp = await searchParams;

  const q = val(sp, "q").trim();
  const selectedRoles = arr(sp, "role");
  const showAll = val(sp, "all") === "1" || selectedRoles.length === 0;

  const roles = await prisma.role.findMany({ orderBy: { id: "asc" } });
  const roleName = new Map(roles.map((r) => [r.key, r.name]));

  const where: Prisma.UserWhereInput = {};
  if (!showAll) where.role = { in: selectedRoles };
  if (q) where.username = { contains: q };
  const users = await prisma.user.findMany({ where, orderBy: { id: "asc" } });

  return (
    <>
      {/* แถบหัว + ปุ่มเพิ่ม */}
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>ผู้ใช้งาน</h1>
          <p className="page-sub" style={{ margin: 0 }}>รายชื่อผู้ใช้ทั้งหมด · คลิกชื่อผู้ใช้เพื่อแก้ไข</p>
        </div>
        <Link href="/admin/users/new" className="btn-primary" title="เพิ่มผู้ใช้">
          ＋ เพิ่มผู้ใช้
        </Link>
      </div>

      {val(sp, "saved") === "1" && <div className="alert alert-success">{val(sp, "msg") || "บันทึกแล้ว"} ✅</div>}
      {val(sp, "msg") && val(sp, "saved") !== "1" && <div className="alert alert-error">{val(sp, "msg")}</div>}

      {/* ตัวกรองบทบาท + ค้นหาชื่อผู้ใช้ */}
      <form className="card" method="get">
        <span className="lbl">บทบาท</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, margin: "6px 0 14px" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" name="all" value="1" defaultChecked={showAll} /> ทั้งหมด
          </label>
          {roles.map((r) => (
            <label key={r.key} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" name="role" value={r.key} defaultChecked={!showAll && selectedRoles.includes(r.key)} />
              {r.name}
            </label>
          ))}
        </div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <label className="field" style={{ flex: "1 1 240px" }}>
            <span className="lbl">ชื่อผู้ใช้</span>
            <input className="input" name="q" defaultValue={q} placeholder="พิมพ์ชื่อผู้ใช้" />
          </label>
          <button className="btn-primary">ค้นหา</button>
          <Link href="/admin/users" className="btn">ล้าง</Link>
        </div>
      </form>

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>ทั้งหมด {users.length.toLocaleString()} คน</p>
        <table>
          <thead>
            <tr>
              <th>ชื่อผู้ใช้</th>
              <th>ชื่อแสดง</th>
              <th>บทบาท</th>
              <th>สถานะ</th>
              <th>สร้างเมื่อ</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>
                  <Link href={`/admin/users/${u.id}`} style={{ color: "var(--primary)" }}>
                    {u.username}
                  </Link>
                </td>
                <td>{u.displayName}</td>
                <td>{roleName.get(u.role) ?? u.role}</td>
                <td>
                  <span className={`badge ${u.active ? "badge-green" : "badge-red"}`}>
                    {u.active ? "ใช้งาน" : "ปิด"}
                  </span>
                </td>
                <td className="muted" style={{ fontSize: 13 }}>{formatDateTime(u.createdAt)}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 24 }}>ไม่พบผู้ใช้ตามเงื่อนไข</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
