import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import { getSetting } from "@/lib/telegram";
import NoAccess from "../../NoAccess";
import {
  saveSmsGateway,
  createSmsTemplate,
  updateSmsTemplate,
  toggleSmsTemplate,
  deleteSmsTemplate,
} from "./actions";

type SP = Record<string, string | string[] | undefined>;
function val(sp: SP, k: string): string {
  const v = sp[k];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function SmsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireSession();
  if (!can(me, "notifications")) return <NoAccess />;
  const sp = await searchParams;
  const editId = Number(val(sp, "edit")) || 0;

  const [gatewayUrl, enabled, templates] = await Promise.all([
    getSetting("sms_gateway_url"),
    getSetting("sms_enabled", "0"),
    prisma.smsTemplate.findMany({ orderBy: { id: "asc" } }),
  ]);

  return (
    <>
      <h1 className="page-title">ส่ง SMS — ตั้งค่า & คลังข้อความ</h1>
      <p className="page-sub">
        ตั้งค่า gateway และจัดการข้อความสำเร็จรูป · ส่งจริงทำที่หน้าลูกค้า · ดูประวัติทั้งหมดที่{" "}
        <Link href="/admin/sms/logs" style={{ color: "var(--primary)" }}>ประวัติการใช้งาน SMS</Link>
      </p>

      {val(sp, "saved") === "1" && <div className="alert alert-success">บันทึกแล้ว ✅</div>}
      {val(sp, "err") && <div className="alert alert-error">{val(sp, "err")}</div>}

      <details className="card" open>
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 16 }}>📖 วิธีใช้งาน (กดเพื่อย่อ/ขยาย)</summary>
        <ol style={{ margin: "12px 0 0", paddingLeft: 20, lineHeight: 1.9 }}>
          <li>
            ขอ <strong>API ส่ง SMS</strong> จากผู้ให้บริการ (เช่น ThaiBulkSMS, SMSMKT, Twilio) — จะได้ลิงก์สำหรับส่ง + API key
          </li>
          <li>
            เอาลิงก์มาวางในช่อง <strong>“URL ของ gateway”</strong> ด้านล่าง แล้วแทนตำแหน่ง <em>เบอร์</em> ด้วย <code>{"{phone}"}</code> และ <em>ข้อความ</em> ด้วย <code>{"{message}"}</code>
            <div className="hint" style={{ marginTop: 4 }}>
              ตัวอย่าง: <code>https://api.thaibulksms.com/sms?key=KEY&secret=SEC&msisdn={"{phone}"}&message={"{message}"}&sender=CRM</code>
            </div>
          </li>
          <li>ติ๊ก <strong>“เปิดใช้งานการส่ง SMS จริง”</strong> แล้วกด <strong>บันทึกการตั้งค่า</strong></li>
          <li>
            เพิ่ม <strong>เทมเพลตข้อความ</strong> ด้านล่าง — ในข้อความใส่ <code>{"{brand}"}</code> (ชื่อเว็บ) หรือ <code>{"{phone}"}</code> (เบอร์ลูกค้า) ได้ ระบบจะแทนค่าให้ตอนส่ง
          </li>
          <li>
            ไปที่ <strong>หน้าลูกค้า</strong> (คลิกเบอร์ในคิว/รายชื่อ) → การ์ด <strong>“ส่ง SMS”</strong> → เลือกเทมเพลตหรือพิมพ์เอง → กดส่ง
          </li>
          <li>ดูผลการส่งได้ที่ <strong>“ประวัติ SMS”</strong> ในหน้าลูกค้า (ส่งแล้ว/ข้าม/ล้มเหลว) และที่เมนู <strong>4.5 บันทึกการใช้งาน</strong></li>
        </ol>
        <div className="hint" style={{ marginTop: 12 }}>
          ⚠️ <strong>ตัวแปร 2 ชุดอย่าสับสน:</strong> ในช่อง <u>URL</u> ใช้ <code>{"{phone}"}</code> <code>{"{message}"}</code> (gateway แทนเบอร์+ข้อความทั้งก้อน) ·
          ส่วนใน <u>ข้อความเทมเพลต</u> ใช้ <code>{"{brand}"}</code> <code>{"{phone}"}</code> (ข้อมูลลูกค้า) ·
          ถ้ายังไม่เปิด/ตั้งค่า gateway ก็ยังสร้างเทมเพลตเก็บไว้ได้ แต่กดส่งจะขึ้นสถานะ “ข้าม”
        </div>
      </details>

      <div className="card">
        <h2 className="card-title">⚙️ ตั้งค่า SMS Gateway</h2>
        <form action={saveSmsGateway}>
          <label className="field">
            <span className="lbl">URL ของ gateway (ใส่ {"{phone}"} และ {"{message}"} ตรงที่ต้องการ)</span>
            <input
              className="input"
              name="sms_gateway_url"
              defaultValue={gatewayUrl}
              placeholder="https://api.gateway.com/send?key=XXX&to={phone}&text={message}"
            />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0 14px" }}>
            <input type="checkbox" name="sms_enabled" defaultChecked={enabled === "1"} />
            <span>เปิดใช้งานการส่ง SMS จริง</span>
          </label>
          <button className="btn-primary">บันทึกการตั้งค่า</button>
        </form>
        <div className="hint" style={{ marginTop: 14 }}>
          ระบบจะแทน <code>{"{phone}"}</code> ด้วยเบอร์ลูกค้า และ <code>{"{message}"}</code> ด้วยข้อความ (เข้ารหัส URL ให้อัตโนมัติ)
          แล้วยิง HTTP GET ไปที่ URL นี้ · ถ้าไม่เปิด/ไม่ตั้งค่า จะยังใช้คลังเทมเพลต+ปุ่มคัดลอกได้ แต่กดส่งจะถูกข้าม
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">📋 คลังเทมเพลตข้อความ ({templates.length})</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: 150 }}>ชื่อ</th>
              <th>ข้อความ</th>
              <th style={{ width: 80 }}>สถานะ</th>
              <th style={{ width: 150 }}></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) =>
              editId === t.id ? (
                <tr key={t.id}>
                  <td colSpan={4}>
                    <form action={updateSmsTemplate} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <input type="hidden" name="id" value={t.id} />
                      <input className="input" name="name" defaultValue={t.name} style={{ width: 150 }} required />
                      <input className="input" name="body" defaultValue={t.body} style={{ flex: "1 1 320px" }} required />
                      <button className="btn-primary btn-sm">บันทึก</button>
                      <Link href="/admin/sms" className="btn btn-sm">ยกเลิก</Link>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td className="muted">{t.body}</td>
                  <td>
                    <span className={`badge ${t.active ? "badge-green" : "badge-gray"}`}>
                      {t.active ? "ใช้งาน" : "ปิด"}
                    </span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Link href={`/admin/sms?edit=${t.id}`} className="btn btn-sm">แก้</Link>
                    <form action={toggleSmsTemplate} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className="btn btn-sm" style={{ marginLeft: 6 }}>{t.active ? "ปิด" : "เปิด"}</button>
                    </form>
                    <form action={deleteSmsTemplate} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className="btn btn-sm" style={{ marginLeft: 6 }}>ลบ</button>
                    </form>
                  </td>
                </tr>
              )
            )}
            {templates.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 20 }}>ยังไม่มีเทมเพลต</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ borderStyle: "dashed" }}>
        <h2 className="card-title">+ เพิ่มเทมเพลต</h2>
        <form action={createSmsTemplate}>
          <div className="grid grid-2">
            <label className="field">
              <span className="lbl">ชื่อเทมเพลต *</span>
              <input className="input" name="name" placeholder="เช่น โปรโมชั่น 20%" required />
            </label>
            <label className="field">
              <span className="lbl">ข้อความ * (ใช้ {"{phone}"} {"{brand}"} ได้)</span>
              <input className="input" name="body" placeholder="เช่น สวัสดีค่ะ {brand} มีโปรโมชั่นพิเศษสำหรับคุณ..." required />
            </label>
          </div>
          <button className="btn-primary">เพิ่มเทมเพลต</button>
        </form>
      </div>
    </>
  );
}
