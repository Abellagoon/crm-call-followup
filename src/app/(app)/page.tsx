import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import { getBrandSummary } from "@/lib/report";
import { ANSWERED_OUTCOMES, formatMoney, formatDate } from "@/lib/labels";
import {
  parseThaiDate,
  toDateInputValue,
  bangkokDayStart,
  bangkokWeekStart,
  bangkokMonthStart,
} from "@/lib/dates";
import BarChart from "./BarChart";
import NoAccess from "./NoAccess";

const DAY = 24 * 60 * 60 * 1000;

type SP = Record<string, string | string[] | undefined>;
function val(sp: SP, key: string): string {
  const v = sp[key];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requireSession();
  if (!can(user, "dashboard")) return <NoAccess />;
  const sp = await searchParams;

  // ----- ช่วงวันที่ (ค่าเริ่ม = เดือนนี้) -----
  const fromStr = val(sp, "from");
  const toStr = val(sp, "to");
  const today = bangkokDayStart();
  const defFrom = bangkokMonthStart();
  const from = fromStr ? parseThaiDate(fromStr) : defFrom;
  const toInclusive = toStr ? parseThaiDate(toStr) : today;
  const toExcl = new Date(toInclusive.getTime() + DAY);
  const range = { gte: from, lt: toExcl };

  // เกณฑ์การบ้าน: agent (ไม่มี view_all) เห็นเฉพาะตัวเลขของตัวเอง (งาน/ลูกค้าที่ตัวเองรับผิดชอบ)
  const scoped = !can(user, "view_all");
  const myId = user.id;
  const custWhere = scoped ? { contacts: { some: { assigneeId: myId } } } : {};
  const callScope = scoped ? { contact: { assigneeId: myId } } : {};
  const custScope = scoped ? { customer: { contacts: { some: { assigneeId: myId } } } } : {};

  // ปุ่มลัด
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
  const presetLink = (f: Date, t: Date) =>
    `/?from=${toDateInputValue(f)}&to=${toDateInputValue(t)}`;

  const [brandRows, customerCount, deps, bons, calls] = await Promise.all([
    getBrandSummary(from, toExcl, scoped ? myId : undefined),
    prisma.customer.count({ where: custWhere }),
    prisma.depositEvent.findMany({ where: { date: range, ...custScope }, select: { date: true, amount: true } }),
    prisma.bonusAdjustment.findMany({ where: { date: range, ...custScope }, select: { date: true, amount: true } }),
    prisma.callLog.findMany({ where: { calledAt: range, ...callScope }, select: { calledAt: true, outcome: true } }),
  ]);

  const tot = brandRows.reduce(
    (a, r) => ({
      calls: a.calls + r.calls,
      answered: a.answered + r.answered,
      deposit: a.deposit + r.deposit,
      bonus: a.bonus + r.bonus,
    }),
    { calls: 0, answered: 0, deposit: 0, bonus: 0 }
  );
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  // ----- บัคเก็ตรายสัปดาห์ -----
  type Week = { start: Date; end: Date; calls: number; answered: number; deposit: number; bonus: number };
  const weeks: Week[] = [];
  for (let s = from.getTime(); s < toExcl.getTime(); s += 7 * DAY) {
    const e = Math.min(s + 7 * DAY, toExcl.getTime());
    weeks.push({ start: new Date(s), end: new Date(e), calls: 0, answered: 0, deposit: 0, bonus: 0 });
  }
  const bucket = (t: number) => weeks.find((w) => t >= w.start.getTime() && t < w.end.getTime());
  for (const d of deps) {
    const w = bucket(d.date.getTime());
    if (w) w.deposit += d.amount;
  }
  for (const b of bons) {
    const w = bucket(b.date.getTime());
    if (w) w.bonus += b.amount;
  }
  for (const c of calls) {
    const w = bucket(c.calledAt.getTime());
    if (w) {
      w.calls++;
      if (ANSWERED_OUTCOMES.includes(c.outcome)) w.answered++;
    }
  }

  // ----- เปรียบเทียบรายเดือน/รายปี (ทุกเดือนที่นำเข้า) -----
  const [mBatches, mDep, mBon, mCall] = await Promise.all([
    prisma.importBatch.findMany({ orderBy: { period: "asc" } }),
    prisma.depositEvent.findMany({ where: { period: { not: null }, ...custScope }, select: { period: true, amount: true } }),
    prisma.bonusAdjustment.findMany({ where: { period: { not: null }, ...custScope }, select: { period: true, amount: true } }),
    prisma.callLog.findMany({ where: { period: { not: null }, ...callScope }, select: { period: true, outcome: true } }),
  ]);
  type MRow = { period: string; label: string; calls: number; answered: number; deposit: number; bonus: number };
  const mMap = new Map<string, MRow>();
  for (const b of mBatches) mMap.set(b.period, { period: b.period, label: b.label, calls: 0, answered: 0, deposit: 0, bonus: 0 });
  const ensureM = (p: string | null) => {
    if (!p) return null;
    if (!mMap.has(p)) mMap.set(p, { period: p, label: p, calls: 0, answered: 0, deposit: 0, bonus: 0 });
    return mMap.get(p)!;
  };
  for (const c of mCall) {
    const m = ensureM(c.period);
    if (m) { m.calls++; if (ANSWERED_OUTCOMES.includes(c.outcome)) m.answered++; }
  }
  for (const d of mDep) { const m = ensureM(d.period); if (m) m.deposit += d.amount; }
  for (const b of mBon) { const m = ensureM(b.period); if (m) m.bonus += b.amount; }
  const monthRows = [...mMap.values()].sort((a, b) => a.period.localeCompare(b.period));

  const rangeLabel = `${formatDate(from)} – ${formatDate(toInclusive)}`;

  return (
    <>
      <h1 className="page-title">สวัสดี, {user.displayName} 👋</h1>
      <p className="page-sub">
        ภาพรวมผลงาน{scoped ? "ของฉัน" : ""} · ช่วง {rangeLabel}
      </p>

      {/* เลือกช่วงวันที่ */}
      <form className="card" method="get" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {presets.map((p) => (
            <Link key={p.label} href={presetLink(p.from, p.to)} className="pill">
              {p.label}
            </Link>
          ))}
        </div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <label className="field">
            <span className="lbl">วันที่เริ่ม</span>
            <input className="input" type="date" name="from" defaultValue={fromStr || toDateInputValue(defFrom)} />
          </label>
          <label className="field">
            <span className="lbl">วันที่จบ</span>
            <input className="input" type="date" name="to" defaultValue={toStr || toDateInputValue(today)} />
          </label>
          <button className="btn-primary">ดูช่วงนี้</button>
          {can(user, "customers") && (
            <a className="btn" href="/customers">ไปหน้าค้นหาลูกค้า →</a>
          )}
        </div>
      </form>

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <div className="card stat">
          <div className="stat-row">
            <span className="stat-ico blue">👥</span>
            <div>
              <div className="label">{scoped ? "ลูกค้าของฉัน" : "ลูกค้าทั้งหมด"}</div>
              <div className="value">{formatMoney(customerCount)}</div>
            </div>
          </div>
        </div>
        <div className="card stat">
          <div className="stat-row">
            <span className="stat-ico violet">📞</span>
            <div>
              <div className="label">โทรในช่วง</div>
              <div className="value">{formatMoney(tot.calls)}</div>
            </div>
          </div>
        </div>
        <div className="card stat">
          <div className="stat-row">
            <span className="stat-ico amber">✅</span>
            <div>
              <div className="label">รับสาย</div>
              <div className="value">{pct(tot.answered, tot.calls)}%</div>
            </div>
          </div>
        </div>
        <div className="card stat">
          <div className="stat-row">
            <span className="stat-ico green">💰</span>
            <div>
              <div className="label">ยอดกลับมาฝาก</div>
              <div className="value green">{formatMoney(tot.deposit)} ฿</div>
            </div>
          </div>
        </div>
      </div>

      {/* สรุปรายสัปดาห์ */}
      <div className="card">
        <h2 className="card-title">📅 สรุปรายสัปดาห์ ({rangeLabel})</h2>
        <table>
          <thead>
            <tr>
              <th>สัปดาห์</th>
              <th className="num">โทร</th>
              <th className="num">รับสาย</th>
              <th className="num">รับสาย %</th>
              <th className="num">ยอดฝากกลับ</th>
              <th className="num">โบนัส</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w, i) => (
              <tr key={i}>
                <td>
                  สัปดาห์ {i + 1}{" "}
                  <span className="muted">
                    ({formatDate(w.start)} – {formatDate(new Date(w.end.getTime() - DAY))})
                  </span>
                </td>
                <td className="num">{formatMoney(w.calls)}</td>
                <td className="num">{formatMoney(w.answered)}</td>
                <td className="num">{pct(w.answered, w.calls)}%</td>
                <td className="num">{formatMoney(w.deposit)}</td>
                <td className="num">{formatMoney(w.bonus)}</td>
              </tr>
            ))}
            <tr className="total">
              <td>รวม</td>
              <td className="num">{formatMoney(tot.calls)}</td>
              <td className="num">{formatMoney(tot.answered)}</td>
              <td className="num">{pct(tot.answered, tot.calls)}%</td>
              <td className="num">{formatMoney(tot.deposit)}</td>
              <td className="num">{formatMoney(tot.bonus)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* เปรียบเทียบรายเดือน/รายปี */}
      {monthRows.length > 0 && (
        <div className="grid grid-2" style={{ marginBottom: 18 }}>
          <div className="card">
            <h2 className="card-title">📈 ยอดฝากกลับ — เทียบรายเดือน</h2>
            <BarChart
              data={monthRows.map((m) => ({ label: m.label, value: Math.round(m.deposit) }))}
              color="var(--primary)"
            />
            {monthRows.length === 1 && (
              <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                มีข้อมูล 1 เดือน — นำเข้าไฟล์เดือนถัดไปที่หน้า “นำเข้า/ส่งออก” แล้วกราฟจะเทียบให้เห็นแนวโน้ม
              </p>
            )}
          </div>
          <div className="card">
            <h2 className="card-title">📊 สรุปเทียบรายเดือน</h2>
            <table>
              <thead>
                <tr>
                  <th>เดือน</th>
                  <th className="num">โทร</th>
                  <th className="num">รับสาย %</th>
                  <th className="num">ยอดฝากกลับ</th>
                  <th className="num">โบนัส</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* กราฟ */}
      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <h2 className="card-title">💰 ยอดฝากกลับรายเว็บ (บาท)</h2>
          <BarChart
            data={[...brandRows].sort((a, b) => b.deposit - a.deposit).map((r) => ({ label: r.name, value: Math.round(r.deposit) }))}
            color="var(--green)"
          />
        </div>
        <div className="card">
          <h2 className="card-title">📞 จำนวนสายที่โทรรายเว็บ</h2>
          <BarChart
            data={[...brandRows].sort((a, b) => b.calls - a.calls).map((r) => ({ label: r.name, value: r.calls }))}
          />
        </div>
      </div>

      {/* สรุปรายเว็บ */}
      <div className="card">
        <h2 className="card-title">สรุปรายเว็บ ({rangeLabel})</h2>
        <table>
          <thead>
            <tr>
              <th>เว็บ</th>
              <th className="num">โทร</th>
              <th className="num">รับสาย</th>
              <th className="num">รับสาย %</th>
              <th className="num">กลับมาฝาก/คน</th>
              <th className="num">ยอดฝากกลับ</th>
              <th className="num">โบนัส</th>
            </tr>
          </thead>
          <tbody>
            {brandRows.map((r) => (
              <tr key={r.brandId}>
                <td>{r.name}</td>
                <td className="num">{formatMoney(r.calls)}</td>
                <td className="num">{formatMoney(r.answered)}</td>
                <td className="num">{pct(r.answered, r.calls)}%</td>
                <td className="num">{formatMoney(r.returnedPeople)}</td>
                <td className="num">{formatMoney(r.deposit)}</td>
                <td className="num">{formatMoney(r.bonus)}</td>
              </tr>
            ))}
            <tr className="total">
              <td>รวมทุกเว็บ</td>
              <td className="num">{formatMoney(tot.calls)}</td>
              <td className="num">{formatMoney(tot.answered)}</td>
              <td className="num">{pct(tot.answered, tot.calls)}%</td>
              <td className="num">-</td>
              <td className="num">{formatMoney(tot.deposit)}</td>
              <td className="num">{formatMoney(tot.bonus)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
