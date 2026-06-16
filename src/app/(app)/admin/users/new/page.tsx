import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import NoAccess from "../../../NoAccess";
import { createUser } from "../actions";

type SP = Record<string, string | string[] | undefined>;
function val(sp: SP, k: string): string {
  const v = sp[k];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function NewUserPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireSession();
  const full = can(me, "admin");
  if (!full && !can(me, "manage_users")) return <NoAccess />;
  const sp = await searchParams;
  const err = val(sp, "err");

  const roles = await prisma.role.findMany({ orderBy: { id: "asc" } });
  // ไม่ใช่ admin เต็ม → เลือกบทบาทระดับ admin ไม่ได้
  const assignable = full
    ? roles
    : roles.filter((r) => {
        try {
          return !(JSON.parse(r.permissions) as string[]).includes("admin");
        } catch {
          return true;
        }
      });

  return (
    <>
      <p className="page-sub" style={{ marginBottom: 8 }}>
        <Link href="/admin/users" className="muted">← กลับไปรายชื่อผู้ใช้</Link>
      </p>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
          <h1 className="page-title" style={{ margin: 0 }}>＋ ลงทะเบียนผู้ใช้</h1>
          {full && (
            <Link href="/admin/roles" className="btn btn-sm">รายละเอียดบทบาท</Link>
          )}
        </div>

        {err && <div className="alert alert-error">{err}</div>}

        <form action={createUser} style={{ maxWidth: 560 }}>
          <label className="field">
            <span className="lbl">บทบาท *</span>
            <select className="input" name="role" defaultValue="AGENT" required>
              <option value="" disabled>— เลือกบทบาท —</option>
              {assignable.map((r) => (
                <option key={r.key} value={r.key}>{r.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="lbl">ชื่อผู้ใช้ (สำหรับ login) *</span>
            <input className="input" name="username" placeholder="เช่น staff_01" required />
            <span className="muted" style={{ fontSize: 12 }}>ใช้ a-z A-Z 0-9 . _ - · อย่างน้อย 3 ตัว · ห้ามซ้ำ</span>
          </label>
          <label className="field">
            <span className="lbl">ชื่อแสดง</span>
            <input className="input" name="displayName" placeholder="เว้นว่างได้ (จะใช้ชื่อผู้ใช้แทน)" />
          </label>
          <label className="field">
            <span className="lbl">รหัสผ่าน (อย่างน้อย 6 ตัว) *</span>
            <input className="input" type="password" name="password" autoComplete="new-password" required />
          </label>
          <label className="field">
            <span className="lbl">ยืนยันรหัสผ่าน *</span>
            <input className="input" type="password" name="confirm" autoComplete="new-password" required />
          </label>

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button className="btn-primary">✔ บันทึก</button>
            <Link href="/admin/users" className="btn">ยกเลิก</Link>
          </div>
        </form>
      </div>
    </>
  );
}
