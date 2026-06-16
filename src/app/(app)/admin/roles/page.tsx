import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import { PERMISSIONS, parsePermissions } from "@/lib/permissions";
import NoAccess from "../../NoAccess";
import { createRole, updateRole, deleteRole } from "./actions";

type SP = Record<string, string | string[] | undefined>;
function val(sp: SP, k: string): string {
  const v = sp[k];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function PermChecks({ selected }: { selected: string[] }) {
  const groups = [...new Set(PERMISSIONS.map((p) => p.group))];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", margin: "10px 0" }}>
      {groups.map((g) => (
        <div key={g} style={{ gridColumn: "1 / -1", marginTop: 6 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{g}</div>
          {PERMISSIONS.filter((p) => p.group === g).map((p) => (
            <label key={p.key} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0" }}>
              <input type="checkbox" name="perm" value={p.key} defaultChecked={selected.includes(p.key)} />
              <span>{p.label}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const me = await requireSession();
  if (!can(me, "admin")) return <NoAccess />;
  const sp = await searchParams;

  const roles = await prisma.role.findMany({ orderBy: { id: "asc" } });
  const userCounts = await prisma.user.groupBy({ by: ["role"], _count: true });
  const countByKey = new Map(userCounts.map((u) => [u.role, u._count]));

  return (
    <>
      <h1 className="page-title">บทบาท & สิทธิ์</h1>
      <p className="page-sub">สร้างบทบาทใหม่ เปลี่ยนชื่อ และกำหนดว่าแต่ละบทบาทเข้าถึงอะไรได้</p>

      {val(sp, "saved") === "1" && <div className="alert alert-success">บันทึกแล้ว ✅</div>}
      {val(sp, "err") && <div className="alert alert-error">{val(sp, "err")}</div>}

      {roles.map((r) => {
        const perms = parsePermissions(r.permissions);
        return (
          <div className="card" key={r.id}>
            <form action={updateRole}>
              <input type="hidden" name="roleId" value={r.id} />
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span className="badge badge-gray">{r.key}</span>
                {r.isSystem && <span className="badge badge-yellow">พื้นฐาน</span>}
                <span className="muted">ผู้ใช้ {countByKey.get(r.key) ?? 0} คน</span>
              </div>
              <label className="field" style={{ maxWidth: 320, marginTop: 10 }}>
                <span className="lbl">ชื่อบทบาท</span>
                <input className="input" name="name" defaultValue={r.name} />
              </label>
              <PermChecks selected={perms} />
              <button className="btn-primary">บันทึก</button>
            </form>
            {!r.isSystem && (
              <form action={deleteRole} style={{ display: "inline", marginLeft: 8 }}>
                <input type="hidden" name="roleId" value={r.id} />
                <button className="btn btn-sm">ลบบทบาท</button>
              </form>
            )}
          </div>
        );
      })}

      <div className="card" style={{ borderStyle: "dashed" }}>
        <h2 className="card-title">+ สร้างบทบาทใหม่</h2>
        <form action={createRole}>
          <div className="grid grid-2">
            <label className="field">
              <span className="lbl">ชื่อบทบาท *</span>
              <input className="input" name="name" placeholder="เช่น ฝ่ายตรวจสอบคุณภาพ" />
            </label>
            <label className="field">
              <span className="lbl">รหัสบทบาท (ไม่ใส่ก็ได้)</span>
              <input className="input" name="key" placeholder="เช่น QA (เว้นว่างให้สร้างอัตโนมัติ)" />
            </label>
          </div>
          <PermChecks selected={["dashboard", "queue", "customers"]} />
          <button className="btn-primary">สร้างบทบาท</button>
        </form>
      </div>
    </>
  );
}
