import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import NoAccess from "../../NoAccess";
import { formatDateTime } from "@/lib/labels";
import { parseThaiDate } from "@/lib/dates";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE = 30;

// ป้ายชนิดข้อมูล + สีของ badge
const ENTITY_LABELS: Record<string, string> = {
  user: "ผู้ใช้",
  role: "บทบาท",
  call: "การโทร",
  deposit: "ยอดฝาก",
  bonus: "โบนัส",
  customer: "ลูกค้า",
  appointment: "นัดโทร",
  import: "นำเข้า",
  export: "ส่งออก",
  settings: "ตั้งค่า",
  sms: "SMS",
};
const ENTITY_COLOR: Record<string, string> = {
  user: "badge-gray",
  role: "badge-gray",
  call: "badge-yellow",
  deposit: "badge-green",
  bonus: "badge-green",
  customer: "badge-yellow",
  appointment: "badge-yellow",
  import: "badge-gray",
  export: "badge-red",
  settings: "badge-gray",
  sms: "badge-yellow",
};

type SP = Record<string, string | string[] | undefined>;
function val(sp: SP, k: string): string {
  const v = sp[k];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const me = await requireSession();
  if (!can(me, "admin")) return <NoAccess />;
  const sp = await searchParams;

  const actor = val(sp, "actor");
  const entity = val(sp, "entity");
  const q = val(sp, "q").trim();
  const fromStr = val(sp, "from");
  const toStr = val(sp, "to");
  const page = Math.max(1, Number(val(sp, "page")) || 1);

  const where: Prisma.AuditLogWhereInput = {};
  if (actor) where.actorId = Number(actor);
  if (entity) where.entity = entity;
  if (q) where.summary = { contains: q };
  if (fromStr || toStr) {
    where.createdAt = {};
    if (fromStr) where.createdAt.gte = parseThaiDate(fromStr);
    if (toStr) where.createdAt.lt = new Date(parseThaiDate(toStr).getTime() + 24 * 60 * 60 * 1000);
  }

  const [users, total, rows] = await Promise.all([
    prisma.user.findMany({ orderBy: { id: "asc" }, select: { id: true, displayName: true } }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams();
    if (actor) p.set("actor", actor);
    if (entity) p.set("entity", entity);
    if (q) p.set("q", q);
    if (fromStr) p.set("from", fromStr);
    if (toStr) p.set("to", toStr);
    for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
    return `/admin/audit?${p.toString()}`;
  };

  return (
    <>
      <h1 className="page-title">บันทึกการใช้งาน (Audit Log)</h1>
      <p className="page-sub">ติดตามว่าใครทำอะไรในระบบเมื่อไหร่ — เรียงล่าสุดก่อน</p>

      <form className="card toolbar" method="get">
        <label className="field">
          <span className="lbl">ผู้ทำ</span>
          <select className="input" name="actor" defaultValue={actor}>
            <option value="">ทุกคน</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="lbl">ประเภท</span>
          <select className="input" name="entity" defaultValue={entity}>
            <option value="">ทั้งหมด</option>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: "1 1 160px" }}>
          <span className="lbl">ค้นหาในรายละเอียด</span>
          <input className="input" name="q" defaultValue={q} placeholder="เช่น ลบ, บทบาท, เบอร์" />
        </label>
        <label className="field">
          <span className="lbl">ตั้งแต่วันที่</span>
          <input className="input" type="date" name="from" defaultValue={fromStr} />
        </label>
        <label className="field">
          <span className="lbl">ถึงวันที่</span>
          <input className="input" type="date" name="to" defaultValue={toStr} />
        </label>
        <button className="btn-primary">กรอง</button>
        <Link href="/admin/audit" className="btn">ล้าง</Link>
      </form>

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>พบ {total.toLocaleString()} รายการ</p>
        <table>
          <thead>
            <tr>
              <th style={{ width: 150 }}>วันเวลา</th>
              <th style={{ width: 130 }}>ผู้ทำ</th>
              <th style={{ width: 90 }}>ประเภท</th>
              <th>รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="muted" style={{ fontSize: 13 }}>{formatDateTime(r.createdAt)}</td>
                <td>{r.actorName}</td>
                <td>
                  <span className={`badge ${ENTITY_COLOR[r.entity] ?? "badge-gray"}`}>
                    {ENTITY_LABELS[r.entity] ?? r.entity}
                  </span>
                </td>
                <td>{r.summary}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  ยังไม่มีบันทึกที่ตรงเงื่อนไข
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
            {page > 1 && (
              <Link className="btn btn-sm" href={qs({ page: page - 1 })}>← ก่อนหน้า</Link>
            )}
            <span className="muted">หน้า {page} / {totalPages}</span>
            {page < totalPages && (
              <Link className="btn btn-sm" href={qs({ page: page + 1 })}>ถัดไป →</Link>
            )}
          </div>
        )}
      </div>
    </>
  );
}
