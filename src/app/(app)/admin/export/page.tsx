import { requireSession, can } from "@/lib/auth";
import NoAccess from "../../NoAccess";
import { toDateInputValue, bangkokMonthStart, bangkokDayStart } from "@/lib/dates";

export default async function ExportPage() {
  const me = await requireSession();
  // เห็นหน้านี้ได้ถ้ามีสิทธิ์ส่งออกอย่างใดอย่างหนึ่ง
  if (!can(me, "customers_export") && !can(me, "reports")) return <NoAccess />;

  const defFrom = toDateInputValue(bangkokMonthStart());
  const defTo = toDateInputValue(bangkokDayStart());

  return (
    <>
      <h1 className="page-title">ส่งออกข้อมูล</h1>
      <p className="page-sub">ดาวน์โหลดข้อมูลลูกค้าและรายงานสรุป เปิดต่อใน Excel / Google Sheets ได้</p>

      <div className="grid grid-2">
        <div className="card">
          <h2 className="card-title">📤 ส่งออกข้อมูลลูกค้า</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            ดาวน์โหลดรายชื่อลูกค้าทั้งหมด (เบอร์โทร เว็บ สถานะ ฯลฯ)
          </p>
          {can(me, "customers_export") ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a className="btn-primary" href="/api/customers/export?format=xlsx">⬇ Excel (.xlsx)</a>
              <a className="btn" href="/api/customers/export">⬇ CSV</a>
            </div>
          ) : (
            <p className="muted">บัญชีของคุณไม่มีสิทธิ์ส่งออกข้อมูลลูกค้า</p>
          )}
        </div>

        <div className="card">
          <h2 className="card-title">📈 ส่งออกรายงานสรุป</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            เลือกช่วงวันที่แล้วดาวน์โหลดสรุปรายเว็บเป็น Excel (.xlsx)
          </p>
          {can(me, "reports") ? (
            <form method="get" action="/api/reports/export">
              <div className="toolbar" style={{ marginBottom: 0 }}>
                <label className="field">
                  <span className="lbl">ตั้งแต่วันที่</span>
                  <input className="input" type="date" name="from" defaultValue={defFrom} required />
                </label>
                <label className="field">
                  <span className="lbl">ถึงวันที่</span>
                  <input className="input" type="date" name="to" defaultValue={defTo} required />
                </label>
                <button className="btn-primary">⬇ ดาวน์โหลด Excel</button>
              </div>
            </form>
          ) : (
            <p className="muted">บัญชีของคุณไม่มีสิทธิ์ส่งออกรายงาน</p>
          )}
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        💡 ดูสรุปบนหน้าจอได้ที่ <strong>หัวข้อ 1 · รายงาน</strong> · นำเข้าข้อมูลที่ <strong>3.1 ประวัตินำเข้าข้อมูล</strong>
      </p>
    </>
  );
}
