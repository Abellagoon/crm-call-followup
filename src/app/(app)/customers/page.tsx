import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  formatPhone,
  formatMoney,
  formatDate,
} from "@/lib/labels";
import {
  parseThaiDate,
  toDateInputValue,
  bangkokDayStart,
  bangkokWeekStart,
  bangkokMonthStart,
} from "@/lib/dates";
import type { Prisma } from "@prisma/client";
import NoAccess from "../NoAccess";

const PAGE_SIZE = 15;
const DAY = 24 * 60 * 60 * 1000;

type SP = Record<string, string | string[] | undefined>;
function val(sp: SP, key: string): string {
  const v = sp[key];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requireSession();
  if (!can(user, "customers")) return <NoAccess />;
  const sp = await searchParams;

  const q = val(sp, "q").trim();
  const brandId = val(sp, "brand");
  const status = val(sp, "status");
  const onlyActive = val(sp, "active") === "1";
  const page = Math.max(1, Number(val(sp, "page")) || 1);

  // ----- ช่วงวันที่ (ค่าเริ่ม = เดือนนี้) -----
  const fromStr = val(sp, "from");
  const toStr = val(sp, "to");
  const today = bangkokDayStart();
  const defFrom = bangkokMonthStart();
  const from = fromStr ? parseThaiDate(fromStr) : defFrom;
  const toInclusive = toStr ? parseThaiDate(toStr) : today;
  const toExcl = new Date(toInclusive.getTime() + DAY);
  const range = { gte: from, lt: toExcl };

  // ปุ่มลัดช่วงวันที่
  const weekStart = bangkokWeekStart();
  const prevWeekStart = new Date(weekStart.getTime() - 7 * DAY);
  const prevWeekEnd = new Date(weekStart.getTime() - DAY);
  const monthStart = bangkokMonthStart();
  const prevMonthEnd = new Date(monthStart.getTime() - DAY);
  const prevMonthStart = bangkokMonthStart(prevMonthEnd);
  const presets = [
    { label: "สัปดาห์นี้", from: weekStart, to: today },
    { label: "สัปดาห์ก่อน", from: prevWeekStart, to: prevWeekEnd },
    { label: "เดือนนี้", from: monthStart, to: today },
    { label: "เดือนก่อน", from: prevMonthStart, to: prevMonthEnd },
  ];
  const presetLink = (f: Date, t: Date) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (brandId) p.set("brand", brandId);
    if (status) p.set("status", status);
    if (onlyActive) p.set("active", "1");
    p.set("from", toDateInputValue(f));
    p.set("to", toDateInputValue(t));
    return `/customers?${p.toString()}`;
  };

  const where: Prisma.CustomerWhereInput = {};
  if (q) where.phone = { contains: q.replace(/\D/g, "") };
  if (brandId) where.brandId = Number(brandId);
  if (status) where.status = status;
  if (onlyActive) {
    where.OR = [
      { deposits: { some: { date: range } } },
      { bonuses: { some: { date: range } } },
      { contacts: { some: { callLogs: { some: { calledAt: range } } } } },
    ];
  }
  // เกณฑ์การบ้าน: agent (ไม่มี view_all) เห็นเฉพาะลูกค้าที่ตัวเองรับผิดชอบ
  const scopeOwn = !can(user, "view_all");
  if (scopeOwn) where.contacts = { some: { assigneeId: user.id } };

  const [brands, total, customers] = await Promise.all([
    prisma.brand.findMany({ orderBy: { id: "asc" } }),
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      include: {
        brand: true,
        deposits: { where: { date: range }, select: { amount: true } },
        bonuses: { where: { date: range }, select: { amount: true } },
        contacts: { select: { callLogs: { where: { calledAt: range }, select: { id: true } } } },
      },
      orderBy: { id: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (brandId) p.set("brand", brandId);
    if (status) p.set("status", status);
    if (onlyActive) p.set("active", "1");
    if (fromStr) p.set("from", fromStr);
    if (toStr) p.set("to", toStr);
    for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
    return `/customers?${p.toString()}`;
  };
  const exportParams = new URLSearchParams();
  if (q) exportParams.set("q", q);
  if (brandId) exportParams.set("brand", brandId);
  if (status) exportParams.set("status", status);
  const exportHref = `/api/customers/export?${exportParams.toString()}`;

  const rangeLabel = `${formatDate(from)} – ${formatDate(toInclusive)}`;

  return (
    <>
      <h1 className="page-title">ลูกค้า</h1>
      <p className="page-sub">
        ค้นหาและจัดการข้อมูลลูกค้า · ยอดอิงช่วง {rangeLabel}
        {scopeOwn && " · เฉพาะลูกค้าของฉัน"}
      </p>

      <form className="card" method="get">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {presets.map((p) => (
            <Link key={p.label} href={presetLink(p.from, p.to)} className="pill">
              {p.label}
            </Link>
          ))}
        </div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <label className="field" style={{ flex: "1 1 180px" }}>
            <span className="lbl">ค้นหาเบอร์</span>
            <input className="input" name="q" defaultValue={q} placeholder="เช่น 0891234567" />
          </label>
          <label className="field">
            <span className="lbl">วันที่เริ่ม</span>
            <input className="input" type="date" name="from" defaultValue={fromStr || toDateInputValue(defFrom)} />
          </label>
          <label className="field">
            <span className="lbl">วันที่จบ</span>
            <input className="input" type="date" name="to" defaultValue={toStr || toDateInputValue(today)} />
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
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ alignSelf: "center" }}>
            <span className="lbl">&nbsp;</span>
            <span style={{ display: "flex", gap: 6, alignItems: "center", padding: "9px 0" }}>
              <input type="checkbox" name="active" value="1" defaultChecked={onlyActive} />
              เฉพาะที่มีความเคลื่อนไหว
            </span>
          </label>
          <button className="btn-primary">ค้นหา</button>
          {can(user, "customers_export") && (
            <>
              <a className="btn" href={exportHref}>⬇ CSV</a>
              <a className="btn" href={`${exportHref}&format=xlsx`}>⬇ Excel/Sheet</a>
            </>
          )}
        </div>
      </form>

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          พบ {formatMoney(total)} ราย{onlyActive ? " (เฉพาะที่มีความเคลื่อนไหวในช่วงนี้)" : ""}
        </p>
        <table>
          <thead>
            <tr>
              <th>เบอร์โทร</th>
              <th>เว็บ</th>
              <th>สถานะ</th>
              <th className="num">โทรในช่วง</th>
              <th className="num">ยอดฝากกลับ</th>
              <th className="num">โบนัส</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => {
              const dep = c.deposits.reduce((a, d) => a + d.amount, 0);
              const bon = c.bonuses.reduce((a, b) => a + b.amount, 0);
              const callsN = c.contacts.reduce((a, ct) => a + ct.callLogs.length, 0);
              return (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>
                    <Link href={`/customers/${c.id}`} style={{ color: "var(--primary)" }}>
                      {formatPhone(c.phone)}
                    </Link>
                  </td>
                  <td>{c.brand.name}</td>
                  <td>
                    <span className={`badge ${STATUS_COLORS[c.status]}`}>{STATUS_LABELS[c.status]}</span>
                  </td>
                  <td className="num">{callsN || "-"}</td>
                  <td className="num" style={dep > 0 ? { color: "var(--green)", fontWeight: 600 } : undefined}>
                    {dep > 0 ? formatMoney(dep) : "-"}
                  </td>
                  <td className="num">{bon > 0 ? formatMoney(bon) : "-"}</td>
                  <td>
                    <Link href={`/customers/${c.id}`} className="btn btn-sm">ดู</Link>
                  </td>
                </tr>
              );
            })}
            {customers.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty">
                    <span className="ico">🔍</span>
                    ไม่พบลูกค้าตามเงื่อนไข — ลองปรับตัวกรองหรือล้างการค้นหา
                  </div>
                </td>
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
