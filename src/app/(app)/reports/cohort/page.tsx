import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import NoAccess from "../../NoAccess";

const BKK = 7 * 60 * 60 * 1000;
const bkkMonth = (d: Date) => new Date(d.getTime() + BKK).toISOString().slice(0, 7);
const offset = (a: string, b: string) => {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
};

type SP = Record<string, string | string[] | undefined>;
function val(sp: SP, k: string): string {
  const v = sp[k];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function CohortPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requireSession();
  if (!can(user, "reports")) return <NoAccess />;
  const sp = await searchParams;
  const brandId = val(sp, "brand");

  const brandFilter = brandId ? { brandId: Number(brandId) } : {};
  const [brands, customers, contacts, deposits] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.customer.findMany({ where: brandFilter, select: { id: true, createdAt: true } }),
    prisma.campaignContact.findMany({ select: { customerId: true, callLogs: { select: { period: true } } } }),
    prisma.depositEvent.findMany({ select: { customerId: true, period: true } }),
  ]);

  // map: customerId → เซ็ตเดือนที่มีการโทร / เดือนที่ฝาก
  const callP = new Map<number, Set<string>>();
  const depP = new Map<number, Set<string>>();
  let latest = "";
  const add = (m: Map<number, Set<string>>, id: number, p: string | null) => {
    if (!p) return;
    if (!m.has(id)) m.set(id, new Set());
    m.get(id)!.add(p);
    if (p > latest) latest = p;
  };
  for (const c of contacts) for (const cl of c.callLogs) add(callP, c.customerId, cl.period);
  for (const d of deposits) add(depP, d.customerId, d.period);

  // สร้าง cohort: เดือนที่เริ่มติดตาม (period แรกสุดของ โทร∪ฝาก, ถ้าไม่มีใช้เดือนที่สร้าง)
  type Cohort = { size: number; byOffset: Map<number, Set<number>> };
  const cohorts = new Map<string, Cohort>();
  let maxOffset = 0;
  for (const cust of customers) {
    const periods = new Set<string>([...(callP.get(cust.id) ?? []), ...(depP.get(cust.id) ?? [])]);
    const cohort = periods.size ? [...periods].sort()[0] : bkkMonth(cust.createdAt);
    let c = cohorts.get(cohort);
    if (!c) {
      c = { size: 0, byOffset: new Map() };
      cohorts.set(cohort, c);
    }
    c.size++;
    for (const dp of depP.get(cust.id) ?? []) {
      const off = offset(cohort, dp);
      if (off < 0) continue;
      if (!c.byOffset.has(off)) c.byOffset.set(off, new Set());
      c.byOffset.get(off)!.add(cust.id);
      if (off > maxOffset) maxOffset = off;
    }
  }

  const rows = [...cohorts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const cols = Array.from({ length: maxOffset + 1 }, (_, i) => i);

  // ระดับสีตาม % (เข้มขึ้นตามอัตรา) — ใช้ badge ที่มีอยู่
  const cellColor = (pct: number) =>
    pct >= 20 ? "badge-green" : pct >= 8 ? "badge-yellow" : pct > 0 ? "badge-gray" : "";

  return (
    <>
      <div className="pill-row">
        <Link href="/reports" className="pill">รายงานสรุป</Link>
        <Link href="/reports/cohort" className="pill active">Cohort Analysis</Link>
      </div>

      <h1 className="page-title">Cohort Analysis — อัตรากลับมาฝาก</h1>
      <p className="page-sub">
        จัดกลุ่มลูกค้าตาม “เดือนที่เริ่มติดตาม” แล้วดูว่ากลับมาฝากกี่ % ในเดือนที่ 0, 1, 2, … ถัดมา
        (เดือน 0 = ฝากในเดือนเดียวกับที่เริ่มติดตาม)
      </p>

      <form className="card toolbar" method="get">
        <label className="field">
          <span className="lbl">เว็บ</span>
          <select className="input" name="brand" defaultValue={brandId}>
            <option value="">ทุกเว็บ</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <button className="btn-primary">กรอง</button>
        {brandId && <Link href="/reports/cohort" className="btn">ล้าง</Link>}
      </form>

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          แต่ละช่อง = % (และจำนวนคน) ของกลุ่มนั้นที่มีการฝากในเดือนนั้น · “—” = เดือนที่ยังมาไม่ถึง
        </p>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>กลุ่ม (เริ่มติดตาม)</th>
                <th className="num">ลูกค้า</th>
                {cols.map((i) => (
                  <th key={i} className="num">เดือน {i}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([month, c]) => {
                const maxAvail = latest ? offset(month, latest) : 0;
                return (
                  <tr key={month}>
                    <td style={{ fontWeight: 600 }}>{month}</td>
                    <td className="num">{c.size.toLocaleString()}</td>
                    {cols.map((i) => {
                      if (i > maxAvail) return <td key={i} className="num muted">—</td>;
                      const n = c.byOffset.get(i)?.size ?? 0;
                      const pct = c.size ? Math.round((n / c.size) * 100) : 0;
                      return (
                        <td key={i} className="num">
                          {n > 0 ? (
                            <span className={`badge ${cellColor(pct)}`}>{pct}%</span>
                          ) : (
                            <span className="muted">0%</span>
                          )}
                          {n > 0 && <div className="muted" style={{ fontSize: 11 }}>{n.toLocaleString()} คน</div>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 2} className="muted" style={{ textAlign: "center", padding: 24 }}>
                    ยังไม่มีข้อมูล
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          💡 ตอนนี้มีข้อมูลไม่กี่เดือน ตารางจะเริ่มเห็นแนวโน้มชัดเมื่อนำเข้าข้อมูลเดือนถัดๆ ไป
          (กลุ่มเดือนเก่าจะมีคอลัมน์เดือนถัดมาให้เทียบมากขึ้น)
        </p>
      </div>
    </>
  );
}
