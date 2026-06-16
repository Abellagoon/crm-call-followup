import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import { toDateInputValue, bangkokMonthStart } from "@/lib/dates";
import { formatMoney, formatDateTime } from "@/lib/labels";
import NoAccess from "../../NoAccess";

type SP = Record<string, string | string[] | undefined>;
function val(sp: SP, k: string): string {
  const v = sp[k];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const me = await requireSession();
  if (!can(me, "import")) return <NoAccess />;
  const sp = await searchParams;

  const batches = await prisma.importBatch.findMany({ orderBy: { period: "desc" } });
  const curPeriod = toDateInputValue(bangkokMonthStart()).slice(0, 7);

  const ok = val(sp, "ok") === "1" || val(sp, "saved") === "1";
  const msg = val(sp, "msg");
  const err = val(sp, "err");

  return (
    <>
      <h1 className="page-title">นำเข้าข้อมูล</h1>
      <p className="page-sub">นำเข้าข้อมูลรายเดือนจากไฟล์ Excel (เก็บสะสมทุกเดือนเพื่อเปรียบเทียบ) · ส่งออกข้อมูลอยู่ที่หัวข้อ 3.2</p>

      {ok && <div className="alert alert-success">{msg || "สำเร็จ"} ✅</div>}
      {err && <div className="alert alert-error">{err}</div>}

      {/* นำเข้าไฟล์ Excel รายเดือน */}
      <div className="card">
        <h2 className="card-title">📊 นำเข้าไฟล์ Excel รายเดือน</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          อัปโหลดไฟล์ CRM รายเดือน (รูปแบบเดียวกับไฟล์ต้นฉบับ) — ระบบจะ <strong>เก็บแยกตามเดือน ไม่ทับเดือนอื่น</strong>{" "}
          เพื่อให้เปรียบเทียบรายเดือน/รายปีได้ · นำเข้าเดือนเดิมซ้ำ = แทนที่เฉพาะเดือนนั้น
        </p>
        <form action="/api/import/crm" method="post" encType="multipart/form-data">
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <label className="field" style={{ flex: "1 1 280px" }}>
              <span className="lbl">ไฟล์ Excel (.xlsx) *</span>
              <input className="input" type="file" name="file" accept=".xlsx,.xls" required />
            </label>
            <label className="field">
              <span className="lbl">เดือนของข้อมูล *</span>
              <input className="input" type="month" name="period" defaultValue={curPeriod} required />
            </label>
            <button className="btn-primary">อัปโหลด & นำเข้า</button>
          </div>
        </form>
        <div className="hint">
          แต่ละชีต = 1 เว็บ · ลูกค้าเบอร์เดิมจะใช้ต่อ (ไม่สร้างซ้ำ) แต่ผลโทร/ยอดฝาก/โบนัสจะถูกบันทึกแยกตามเดือนที่เลือก
        </div>
      </div>

      {/* ประวัติการนำเข้า */}
      {batches.length > 0 && (
        <div className="card">
          <h2 className="card-title">🗂️ เดือนที่นำเข้าแล้ว ({batches.length})</h2>
          <table>
            <thead>
              <tr>
                <th>เดือน</th>
                <th className="num">ลูกค้า</th>
                <th className="num">โทร</th>
                <th className="num">ยอดฝาก (รายการ)</th>
                <th className="num">โบนัส (รายการ)</th>
                <th>ไฟล์</th>
                <th>นำเข้าเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 600 }}>{b.label} <span className="muted">({b.period})</span></td>
                  <td className="num">{formatMoney(b.customers)}</td>
                  <td className="num">{formatMoney(b.calls)}</td>
                  <td className="num">{formatMoney(b.deposits)}</td>
                  <td className="num">{formatMoney(b.bonuses)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{b.fileName || "-"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{formatDateTime(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            ดูสรุปเปรียบเทียบรายเดือนได้ที่หน้า <strong>รายงาน</strong>
          </p>
        </div>
      )}
    </>
  );
}
