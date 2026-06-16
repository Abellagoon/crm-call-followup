import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import NoAccess from "../../../NoAccess";
import { formatDateTime } from "@/lib/labels";
import {
  updateUsername,
  updateUserDisplayName,
  setUserRole,
  resetUserPassword,
  toggleUserActive,
} from "../actions";

type SP = Record<string, string | string[] | undefined>;
function val(sp: SP, k: string): string {
  const v = sp[k];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}
const grantsAdmin = (perms: string) => {
  try {
    return (JSON.parse(perms) as string[]).includes("admin");
  } catch {
    return false;
  }
};

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const me = await requireSession();
  const full = can(me, "admin");
  if (!full && !can(me, "manage_users")) return <NoAccess />;
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) notFound();
  const sp = await searchParams;

  const [u, roles] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.role.findMany({ orderBy: { id: "asc" } }),
  ]);
  if (!u) notFound();

  const roleName = new Map(roles.map((r) => [r.key, r.name]));
  const adminRoleKeys = new Set(roles.filter((r) => grantsAdmin(r.permissions)).map((r) => r.key));
  const assignable = full ? roles : roles.filter((r) => !adminRoleKeys.has(r.key));
  const targetIsAdmin = adminRoleKeys.has(u.role);
  const lockedForMe = !full && targetIsAdmin; // ผู้จัดการที่ไม่ใช่ admin แตะผู้ใช้ระดับ admin ไม่ได้

  const back = (
    <p className="page-sub" style={{ marginBottom: 8 }}>
      <Link href="/admin/users" className="muted">← กลับไปรายชื่อผู้ใช้</Link>
    </p>
  );

  return (
    <>
      {back}
      <h1 className="page-title">
        {u.username}{" "}
        <span className={`badge ${u.active ? "badge-green" : "badge-red"}`}>{u.active ? "ใช้งาน" : "ปิด"}</span>
      </h1>
      <p className="page-sub">
        {u.displayName} · บทบาท {roleName.get(u.role) ?? u.role} · สร้างเมื่อ {formatDateTime(u.createdAt)}
      </p>

      {val(sp, "saved") === "1" && <div className="alert alert-success">{val(sp, "msg") || "บันทึกแล้ว"} ✅</div>}
      {val(sp, "msg") && val(sp, "saved") !== "1" && <div className="alert alert-error">{val(sp, "msg")}</div>}

      {lockedForMe ? (
        <div className="card">
          <p style={{ margin: 0 }}>🔒 ผู้ใช้รายนี้เป็นระดับ <strong>ผู้ดูแลระบบ</strong> — เฉพาะ Administrator เท่านั้นที่จัดการได้</p>
        </div>
      ) : (
        <div className="grid grid-2">
          <div className="card">
            <h2 className="card-title">ชื่อผู้ใช้ (login)</h2>
            <form action={updateUsername} style={{ display: "flex", gap: 8 }}>
              <input type="hidden" name="userId" value={u.id} />
              <input type="hidden" name="back" value={`/admin/users/${u.id}`} />
              <input className="input" name="username" defaultValue={u.username} required style={{ flex: 1 }} />
              <button className="btn-primary btn-sm">บันทึก</button>
            </form>
          </div>

          <div className="card">
            <h2 className="card-title">ชื่อแสดง</h2>
            <form action={updateUserDisplayName} style={{ display: "flex", gap: 8 }}>
              <input type="hidden" name="userId" value={u.id} />
              <input type="hidden" name="back" value={`/admin/users/${u.id}`} />
              <input className="input" name="displayName" defaultValue={u.displayName} maxLength={60} required style={{ flex: 1 }} />
              <button className="btn-primary btn-sm">บันทึก</button>
            </form>
          </div>

          <div className="card">
            <h2 className="card-title">บทบาท</h2>
            <form action={setUserRole} style={{ display: "flex", gap: 8 }}>
              <input type="hidden" name="userId" value={u.id} />
              <input type="hidden" name="back" value={`/admin/users/${u.id}`} />
              <select className="input" name="role" defaultValue={u.role} style={{ flex: 1 }}>
                {assignable.map((r) => (
                  <option key={r.key} value={r.key}>{r.name}</option>
                ))}
              </select>
              <button className="btn-primary btn-sm">ตั้ง</button>
            </form>
          </div>

          <div className="card">
            <h2 className="card-title">รีเซ็ตรหัสผ่าน</h2>
            <form action={resetUserPassword} style={{ display: "flex", gap: 8 }}>
              <input type="hidden" name="userId" value={u.id} />
              <input type="hidden" name="back" value={`/admin/users/${u.id}`} />
              <input className="input" name="password" type="text" placeholder="รหัสใหม่ (≥6 ตัว)" required style={{ flex: 1 }} />
              <button className="btn-primary btn-sm">รีเซ็ต</button>
            </form>
          </div>

          {u.id !== me.id && (
            <div className="card">
              <h2 className="card-title">สถานะบัญชี</h2>
              <form action={toggleUserActive}>
                <input type="hidden" name="userId" value={u.id} />
              <input type="hidden" name="back" value={`/admin/users/${u.id}`} />
                <button className="btn">{u.active ? "ปิดบัญชี" : "เปิดบัญชี"}</button>
                <span className="muted" style={{ marginLeft: 10, fontSize: 13 }}>
                  ปัจจุบัน: {u.active ? "ใช้งาน" : "ปิด"}
                </span>
              </form>
            </div>
          )}
        </div>
      )}
    </>
  );
}
