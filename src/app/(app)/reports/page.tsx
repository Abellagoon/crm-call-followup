import Link from "next/link";
import { requireSession, can } from "@/lib/auth";
import NoAccess from "../NoAccess";
import { prisma } from "@/lib/db";
import { getBrandSummary } from "@/lib/report";
import { ANSWERED_OUTCOMES, formatMoney } from "@/lib/labels";
import {
  parseThaiDate,
  toDateInputValue,
  bangkokMonthStart,
  bangkokDayStart,
} from "@/lib/dates";

type SP = Record<string, string | string[] | undefined>;
function val(sp: SP, key: string): string {
  const v = sp[key];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requireSession();
  if (!can(user, "reports")) return <NoAccess />;
  const sp = await searchParams;

  const fromStr = val(sp, "from");
  const toStr = val(sp, "to");

  // ค่าเริ่มต้น = เดือนปัจจุบัน
  const defFrom = bangkokMonthStart();
  const defTo = bangkokDayStart(); // ต้นวันนี้
  const from = fromStr ? parseThaiDate(fromStr) : defFrom;
  // ช่วงรวมวันสิ้นสุด → บวก 1 วันตอน query
  const toInclusive = toStr ? parseThaiDate(toStr) : defTo;
  const toExclusive = new Date(toInclusive.getTime() + 24 * 60 * 60 * 1000);

  const invalid = from.getTime() > toInclusive.getTime();

  const rows = invalid ? [] : await getBrandSummary(from, toExclusive);

  // ----- เปรียบเทียบรายเดือน (ทุกเดือนที่นำเข้า) -----
  const [batches, depAll, bonAll, callAll] = await Promise.all([
    prisma.importBatch.findMany({ orderBy: { period: "asc" } }),
    prisma.depositEvent.findMany({ where: { period: { not: null } }, select: { period: true, amount: true } }),
    prisma.bonusAdjustment.findMany({ where: { period: { not: null } }, select: { period: true, amount: true } }),
    prisma.callLog.findMany({ where: { period: { not: null } }, select: { period: true, outcome: true } }),
  ]);
  type MRow = { period: string; label: string; calls: number; answered: number; deposit: number; bonus: number };
  const months = new Map<string, MRow>();
  for (const b of batches) months.set(b.period, { period: b.period, label: b.label, calls: 0, answered: 0, deposit: 0, bonus: 0 });
  const ensure = (p: string | null) => {
    if (!p) return null;
    if (!months.has(p)) months.set(p, { period: p, label: p, calls: 0, answered: 0, deposit: 0, bonus: 0 });
    return months.get(p)!;
  };
  for (const c of callAll) {
    const m = ensure(c.period);
    if (m) { m.calls++; if (ANSWERED_OUTCOMES.includes(c.outcome)) m.answered++; }
  }
  for (const d of depAll) { const m = ensure(d.period); if (m) m.deposit += d.amount; }
  for (const b of bonAll) { const m = ensure(b.period); if (m) m.bonus += b.amount; }
  const monthRows = [...months.values()].sort((a, b) => a.period.localeCompare(b.period));

  const tot = rows.reduce(
    (a, r) => ({
      calls: a.calls + r.calls,
      answered: a.answered + r.answered,
      noAnswer: a.noAnswer + r.noAnswer,
      returnedPeople: a.returnedPeople + r.returnedPeople,
      deposit: a.deposit + r.deposit,
      bonus: a.bonus + r.bonus,
    }),
    { calls: 0, answered: 0, noAnswer: 0, returnedPeople: 0, deposit: 0, bonus: 0 }
  );

  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  // ลิงก์ดาวน์โหลด Excel พกช่วงวันที่ที่เลือกไปด้วย
  const exFrom = fromStr || toDateInputValue(defFrom);
  const exTo = toStr || toDateInputValue(defTo);
  const excelHref = `/api/reports/export?from=${exFrom}&to=${exTo}`;

  return (
    <>
      <div className="pill-row">
        <Link href="/reports" className="pill active">รายงานสรุป</Link>
        <Link href="/reports/cohort" className="pill">Cohort Analysis</Link>
      </div>

      <h1 className="page-title">รายงานสรุป</h1>
      <p className="page-sub">เลือกช่วงวันที่เพื่อดูสรุปผลการติดตามลูกค้ารายเว็บ</p>

      <form className="card toolbar" method="get">
        <label className="field">
          <span className="lbl">วันที่เริ่ม</span>
          <input
            className="input"
            type="date"
            name="from"
            defaultValue={fromStr || toDateInputValue(defFrom)}
          />
        </label>
        <label className="field">
          <span className="lbl">วันที่จบ</span>
          <input
            className="input"
            type="date"
            name="to"
            defaultValue={toStr || toDateInputValue(defTo)}
          />
        </label>
        <button className="btn-primary">ดูรายงาน</button>
        <a className="btn" href={invalid ? undefined : excelHref}>
          ⬇ ดาวน์โหลด Excel
        </a>
      </form>

      {invalid && (
        <div className="alert alert-error">
          วันที่เริ่มต้องไม่อยู่หลังวันที่จบ
        </div>
      )}

      <div className="card">
        <h2 className="card-title">สรุปผลติดตามลูกค้ารายเว็บ</h2>
        <table>
          <thead>
            <tr>
              <th>เว็บ</th>
              <th className="num">โทรติดตาม</th>
              <th className="num">รับสาย</th>
              <th className="num">รับสาย %</th>
              <th className="num">ไม่รับ %</th>
              <th className="num">กลับมาฝาก/คน</th>
              <th className="num">ยอดฝากกลับ</th>
              <th className="num">โบนัส</th>
              <th className="num">โบนัส/ฝาก %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.brandId}>
                <td>{r.name}</td>
                <td className="num">{formatMoney(r.calls)}</td>
                <td className="num">{formatMoney(r.answered)}</td>
                <td className="num">{pct(r.answered, r.calls)}%</td>
                <td className="num">{pct(r.noAnswer, r.calls)}%</td>
                <td className="num">{formatMoney(r.returnedPeople)}</td>
                <td className="num">{formatMoney(r.deposit)}</td>
                <td className="num">{formatMoney(r.bonus)}</td>
                <td className="num">{pct(r.bonus, r.deposit)}%</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="total">
                <td>รวมทุกเว็บ</td>
                <td className="num">{formatMoney(tot.calls)}</td>
                <td className="num">{formatMoney(tot.answered)}</td>
                <td className="num">{pct(tot.answered, tot.calls)}%</td>
                <td className="num">{pct(tot.noAnswer, tot.calls)}%</td>
                <td className="num">{formatMoney(tot.returnedPeople)}</td>
                <td className="num">{formatMoney(tot.deposit)}</td>
                <td className="num">{formatMoney(tot.bonus)}</td>
                <td className="num">{pct(tot.bonus, tot.deposit)}%</td>
              </tr>
            )}
            {!invalid && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="muted" style={{ textAlign: "center", padding: 20 }}>
                  ไม่มีข้อมูล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {monthRows.length > 0 && (
        <div className="card">
          <h2 className="card-title">📈 เปรียบเทียบรายเดือน (ทุกเดือนที่นำเข้า)</h2>
          <table>
            <thead>
              <tr>
                <th>เดือน</th>
                <th className="num">โทร</th>
                <th className="num">รับสาย %</th>
                <th className="num">ยอดฝากกลับ</th>
                <th className="num">โบนัส</th>
                <th className="num">โบนัส/ฝาก %</th>
              </tr>
            </thead>
            <tbody>
              {monthRows.map((m) => (
                <tr key={m.period}>
                  <td style={{ fontWeight: 600 }}>{m.label}</td>
                  <td className="num">{formatMoney(m.calls)}</td>
                  <td className="num">{pct(m.answered, m.calls)}%</td>
                  <td className="num">{formatMoney(m.deposit)}</td>
                  <td className="num">{formatMoney(m.bonus)}</td>
                  <td className="num">{pct(m.bonus, m.deposit)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            ยิ่งนำเข้าหลายเดือน ตารางนี้จะยิ่งเทียบให้เห็นแนวโน้ม — นำเข้าไฟล์รายเดือนได้ที่หน้า “นำเข้า/ส่งออก”
          </p>
        </div>
      )}

      <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>
        💡 <strong>ข้อ 4 + 5</strong> — ตัวเลขในไฟล์ Excel ใช้ฟังก์ชันเดียวกับตารางนี้ จึงตรงกัน 100%
      </p>
    </>
  );
}
