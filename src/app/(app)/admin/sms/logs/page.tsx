import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import NoAccess from "../../../NoAccess";
import { formatPhone, formatDateTime } from "@/lib/labels";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE = 30;
const STATUS_LABEL: Record<string, string> = { SENT: "ส่งแล้ว", FAILED: "ล้มเหลว", SKIPPED: "ข้าม" };
const STATUS_COLOR: Record<string, string> = { SENT: "badge-green", FAILED: "badge-red", SKIPPED: "badge-gray" };

type SP = Record<string, string | string[] | undefined>;
function val(sp: SP, k: string): string {
  const v = sp[k];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function SmsLogsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireSession();
  if (!can(me, "notifications")) return <NoAccess />;
  const sp = await searchParams;
  const q = val(sp, "q").trim();
  const status = val(sp, "status");
  const page = Math.max(1, Number(val(sp, "page")) || 1);

  const where: Prisma.SmsLogWhereInput = {};
  if (q) where.phone = { contains: q.replace(/\D/g, "") };
  if (status) where.status = status;

  const [total, logs, users] = await Promise.all([
    prisma.smsLog.count({ where }),
    prisma.smsLog.findMany({
      where,
      orderBy: { sentAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { customer: { select: { id: true, brand: { select: { name: true } } } } },
    }),
    prisma.user.findMany({ select: { id: true, displayName: true } }),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.displayName]));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
    return `/admin/sms/logs?${p.toString()}`;
  };

  return (
    <>
      <h1 className="page-title">ประวัติการใช้งาน SMS</h1>
      <p className="page-sub">รายการ SMS ที่ส่งทั้งหมด — เรียงล่าสุดก่อน</p>

      <form className="card toolbar" method="get">
        <label className="field" style={{ flex: "1 1 160px" }}>
          <span className="lbl">ค้นหาเบอร์</span>
          <input className="input" name="q" defaultValue={q} placeholder="เช่น 0891" />
        </label>
        <label className="field">
          <span className="lbl">สถานะ</span>
          <select className="input" name="status" defaultValue={status}>
            <option value="">ทั้งหมด</option>
            <option value="SENT">ส่งแล้ว</option>
            <option value="SKIPPED">ข้าม</option>
            <option value="FAILED">ล้มเหลว</option>
          </select>
        </label>
        <button className="btn-primary">กรอง</button>
        <Link href="/admin/sms/logs" className="btn">ล้าง</Link>
      </form>

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>พบ {total.toLocaleString()} รายการ</p>
        <table>
          <thead>
            <tr>
              <th style={{ width: 150 }}>วันเวลา</th>
              <th>เบอร์</th>
              <th>เว็บ</th>
              <th>ข้อความ</th>
              <th style={{ width: 90 }}>สถานะ</th>
              <th>ผู้ส่ง</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((s) => (
              <tr key={s.id}>
                <td className="muted" style={{ fontSize: 13 }}>{formatDateTime(s.sentAt)}</td>
                <td style={{ fontWeight: 600 }}>
                  {s.customer ? (
                    <Link href={`/customers/${s.customer.id}`} style={{ color: "var(--primary)" }}>
                      {formatPhone(s.phone)}
                    </Link>
                  ) : (
                    formatPhone(s.phone)
                  )}
                </td>
                <td>{s.customer?.brand?.name ?? "—"}</td>
                <td>
                  {s.body}
                  {s.error && <div className="muted" style={{ fontSize: 11, color: "var(--danger,#ef4444)" }}>{s.error}</div>}
                </td>
                <td>
                  <span className={`badge ${STATUS_COLOR[s.status] ?? "badge-gray"}`}>
                    {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                </td>
                <td className="muted">{s.sentById ? (userName.get(s.sentById) ?? `#${s.sentById}`) : "—"}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>ยังไม่มีประวัติการส่ง SMS</td>
              </tr>
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
            {page > 1 && <Link className="btn btn-sm" href={qs({ page: page - 1 })}>← ก่อนหน้า</Link>}
            <span className="muted">หน้า {page} / {totalPages}</span>
            {page < totalPages && <Link className="btn btn-sm" href={qs({ page: page + 1 })}>ถัดไป →</Link>}
          </div>
        )}
      </div>
    </>
  );
}
