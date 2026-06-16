import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import NoAccess from "../../NoAccess";
import { ANSWERED_OUTCOMES, ROLE_LABELS, formatMoney } from "@/lib/labels";

export default async function AgentsReportPage() {
  const me = await requireSession();
  if (!can(me, "agents_report")) return <NoAccess />;

  const [users, calls] = await Promise.all([
    // ดึงผู้ใช้ทุก role (รวม ADMIN) เพื่อ map ผู้โทรให้ครบ — สายของแอดมินจะได้ไม่ตกถัง "ไม่ระบุผู้โทร"
    prisma.user.findMany({
      select: { id: true, displayName: true, role: true },
    }),
    prisma.callLog.findMany({ select: { callerId: true, outcome: true, smsSent: true } }),
  ]);

  type Row = {
    name: string;
    role: string;
    calls: number;
    answered: number;
    sms: number;
  };
  const map = new Map<number | "import", Row>();
  for (const u of users)
    map.set(u.id, { name: u.displayName, role: u.role, calls: 0, answered: 0, sms: 0 });
  map.set("import", { name: "ไม่ระบุผู้โทร (ข้อมูลนำเข้า)", role: "—", calls: 0, answered: 0, sms: 0 });

  for (const c of calls) {
    const key = c.callerId ?? "import";
    const r = map.get(key) ?? map.get("import")!;
    r.calls++;
    if (ANSWERED_OUTCOMES.includes(c.outcome)) r.answered++;
    if (c.smsSent) r.sms++;
  }

  const rows = [...map.values()].filter((r) => r.calls > 0).sort((a, b) => b.calls - a.calls);
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  return (
    <>
      <h1 className="page-title">ผลงานรายพนักงาน</h1>
      <p className="page-sub">สรุปจำนวนสายและอัตรารับสายของแต่ละคน (ข้อมูลทั้งหมด)</p>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>พนักงาน</th>
              <th>บทบาท</th>
              <th className="num">สายที่โทร</th>
              <th className="num">รับสาย</th>
              <th className="num">รับสาย %</th>
              <th className="num">ส่ง SMS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td className="muted">{ROLE_LABELS[r.role] ?? r.role}</td>
                <td className="num">{formatMoney(r.calls)}</td>
                <td className="num">{formatMoney(r.answered)}</td>
                <td className="num">{pct(r.answered, r.calls)}%</td>
                <td className="num">{formatMoney(r.sms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
