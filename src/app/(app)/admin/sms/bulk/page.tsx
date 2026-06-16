import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import NoAccess from "../../../NoAccess";
import { STATUS_LABELS, STATUS_COLORS, formatPhone } from "@/lib/labels";
import type { Prisma } from "@prisma/client";
import { sendBulkSms } from "../actions";
import SelectAll from "./SelectAll";

const CAP = 200;

type SP = Record<string, string | string[] | undefined>;
function val(sp: SP, k: string): string {
  const v = sp[k];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function BulkSmsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireSession();
  if (!can(me, "notifications")) return <NoAccess />;
  const sp = await searchParams;

  const q = val(sp, "q").trim();
  const brandId = val(sp, "brand");
  const status = val(sp, "status");
  const msg = val(sp, "msg");

  const where: Prisma.CustomerWhereInput = { status: { not: "DO_NOT_CALL" } }; // ไม่ดึง DNC มาตั้งแต่แรก
  if (q) where.phone = { contains: q.replace(/\D/g, "") };
  if (brandId) where.brandId = Number(brandId);
  if (status) where.status = status;

  const [brands, templates, total, customers] = await Promise.all([
    prisma.brand.findMany({ orderBy: { id: "asc" } }),
    prisma.smsTemplate.findMany({ where: { active: true }, orderBy: { id: "asc" } }),
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      include: { brand: { select: { name: true } } },
      orderBy: { id: "asc" },
      take: CAP,
    }),
  ]);

  const qsStr = new URLSearchParams();
  if (q) qsStr.set("q", q);
  if (brandId) qsStr.set("brand", brandId);
  if (status) qsStr.set("status", status);
  const backUrl = `/admin/sms/bulk${qsStr.toString() ? `?${qsStr}` : ""}`;

  return (
    <>
      <h1 className="page-title">ส่ง SMS หลายเบอร์</h1>
      <p className="page-sub">กรองลูกค้า → ติ๊กเลือก → เลือกเทมเพลต → ส่งทีเดียว (ข้าม “ห้ามโทร” อัตโนมัติ · สูงสุด {CAP} เบอร์/ครั้ง)</p>

      {msg && <div className="alert alert-success">{msg}</div>}

      {/* ตัวกรอง */}
      <form className="card toolbar" method="get">
        <label className="field" style={{ flex: "1 1 180px" }}>
          <span className="lbl">ค้นหาเบอร์</span>
          <input className="input" name="q" defaultValue={q} placeholder="เช่น 0891" />
        </label>
        <label className="field">
          <span className="lbl">เว็บ</span>
          <select className="input" name="brand" defaultValue={brandId}>
            <option value="">ทุกเว็บ</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="lbl">สถานะ</span>
          <select className="input" name="status" defaultValue={status}>
            <option value="">ทุกสถานะ</option>
            {Object.entries(STATUS_LABELS)
              .filter(([k]) => k !== "DO_NOT_CALL")
              .map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
          </select>
        </label>
        <button className="btn-primary">กรอง</button>
        <Link href="/admin/sms/bulk" className="btn">ล้าง</Link>
      </form>

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          พบ {total.toLocaleString()} ราย{total > CAP ? ` · แสดง/ส่งได้ ${CAP} แรก (กรองให้แคบลงถ้าต้องการเลือกรายอื่น)` : ""}
        </p>

        {templates.length === 0 ? (
          <p className="muted">ยังไม่มีเทมเพลต — เพิ่มที่เมนู <strong>5.1 ส่ง SMS</strong> ก่อน</p>
        ) : (
          <form action={sendBulkSms}>
            <input type="hidden" name="back" value={backUrl} />
            <div className="toolbar" style={{ marginBottom: 12, alignItems: "center" }}>
              <span className="lbl" style={{ alignSelf: "center" }}>📱 เทมเพลต:</span>
              <select className="input" name="templateId" defaultValue="" style={{ width: 220 }} required>
                <option value="">— เลือกเทมเพลต —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button className="btn-primary btn-sm">ส่งให้ที่เลือก</button>
            </div>

            <table>
              <thead>
                <tr>
                  <th style={{ width: 28 }}><SelectAll /></th>
                  <th>เบอร์โทร</th>
                  <th>เว็บ</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td><input type="checkbox" name="ids" value={c.id} /></td>
                    <td style={{ fontWeight: 600 }}>
                      <Link href={`/customers/${c.id}`} style={{ color: "var(--primary)" }}>{formatPhone(c.phone)}</Link>
                    </td>
                    <td>{c.brand.name}</td>
                    <td><span className={`badge ${STATUS_COLORS[c.status]}`}>{STATUS_LABELS[c.status]}</span></td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>ไม่พบลูกค้าตามเงื่อนไข</td>
                  </tr>
                )}
              </tbody>
            </table>
          </form>
        )}
      </div>
    </>
  );
}
