import { requireSession, can } from "@/lib/auth";
import { getSetting } from "@/lib/telegram";
import { saveNotificationSettings, testSend, sendSummaryNow } from "./actions";
import NoAccess from "../../NoAccess";

type SP = Record<string, string | string[] | undefined>;
function val(sp: SP, key: string): string {
  const v = sp[key];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const me = await requireSession();
  if (!can(me, "notifications")) return <NoAccess />;
  const sp = await searchParams;

  const [teamChat, headChat, threshold, notifyCallback, notifyBigDeposit, notifyDaily, notifyWeekly, summaryTime, weeklyDow] =
    await Promise.all([
      getSetting("team_chat_id"),
      getSetting("head_chat_id"),
      getSetting("big_deposit_threshold", "5000"),
      getSetting("notify_callback", "1"),
      getSetting("notify_big_deposit", "1"),
      getSetting("notify_daily_summary", "0"),
      getSetting("notify_weekly_summary", "0"),
      getSetting("summary_time", "23:00"),
      getSetting("weekly_summary_dow", "1"),
    ]);

  const hasToken = !!process.env.TELEGRAM_BOT_TOKEN;
  const saved = val(sp, "saved") === "1";
  const test = val(sp, "test");
  const testMsg = val(sp, "msg");

  return (
    <>
      <h1 className="page-title">ตั้งค่าแจ้งเตือน Telegram</h1>
      <p className="page-sub">ตั้งกลุ่มผู้รับ เกณฑ์ และเปิด-ปิดการแจ้งเตือนแต่ละประเภท</p>

      {saved && <div className="alert alert-success">บันทึกการตั้งค่าเรียบร้อยแล้ว ✅</div>}
      {test === "ok" && <div className="alert alert-success">✅ {testMsg}</div>}
      {test === "warn" && <div className="alert alert-error">⚠️ {testMsg}</div>}
      {test === "err" && <div className="alert alert-error">❌ {testMsg}</div>}

      {!hasToken && (
        <div className="alert alert-error">
          ยังไม่ได้ตั้งค่า <code>TELEGRAM_BOT_TOKEN</code> ในไฟล์ <code>.env</code> —
          ระบบจะ "ข้าม" การส่งจริง (แต่จะไม่ทำให้งานหลักพัง) เมื่อใส่ token แล้วปุ่มทดสอบจะส่งได้จริง
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h2 className="card-title">การตั้งค่า</h2>
          <form action={saveNotificationSettings}>
            <label className="field">
              <span className="lbl">Chat ID กลุ่มทีม</span>
              <input className="input" name="team_chat_id" defaultValue={teamChat} placeholder="เช่น -1001234567890" />
            </label>
            <label className="field">
              <span className="lbl">Chat ID กลุ่มหัวหน้า</span>
              <input className="input" name="head_chat_id" defaultValue={headChat} placeholder="เช่น -1009876543210" />
            </label>
            <label className="field">
              <span className="lbl">เกณฑ์ยอดฝากใหญ่ (บาท)</span>
              <input className="input" type="number" name="big_deposit_threshold" defaultValue={threshold} />
            </label>

            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <input type="checkbox" name="notify_callback" defaultChecked={notifyCallback === "1"} />
              <span>แจ้งเตือนเมื่อมีการนัดโทรกลับ</span>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <input type="checkbox" name="notify_big_deposit" defaultChecked={notifyBigDeposit === "1"} />
              <span>แจ้งเตือนยอดฝาก/โบนัสก้อนใหญ่ (เกินเกณฑ์)</span>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <input type="checkbox" name="notify_daily_summary" defaultChecked={notifyDaily === "1"} />
              <span>ส่งสรุปรายวัน (จ–ส หรือทุกวันยกเว้นวันสรุปสัปดาห์)</span>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <input type="checkbox" name="notify_weekly_summary" defaultChecked={notifyWeekly === "1"} />
              <span>ส่งสรุปรายสัปดาห์ (ตามวันที่เลือก)</span>
            </label>

            <div className="toolbar" style={{ marginBottom: 14 }}>
              <label className="field">
                <span className="lbl">เวลาส่งสรุปอัตโนมัติ</span>
                <input className="input" type="time" name="summary_time" defaultValue={summaryTime} style={{ width: 130 }} />
              </label>
              <label className="field">
                <span className="lbl">วันส่งสรุปรายสัปดาห์</span>
                <select className="input" name="weekly_summary_dow" defaultValue={weeklyDow}>
                  <option value="1">จันทร์</option>
                  <option value="2">อังคาร</option>
                  <option value="3">พุธ</option>
                  <option value="4">พฤหัสบดี</option>
                  <option value="5">ศุกร์</option>
                  <option value="6">เสาร์</option>
                  <option value="0">อาทิตย์</option>
                </select>
              </label>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 14 }}>
              ⏰ ส่งอัตโนมัติตามเวลานี้ (เวลาไทย): <strong>รายวันทุกวันยกเว้น “วันส่งสรุปรายสัปดาห์”</strong> ส่วนวันนั้นจะส่งสรุปรายสัปดาห์แทน
              (เช่น ตั้งอาทิตย์ = จ–ส ส่งรายวัน, อาทิตย์ส่งรายสัปดาห์) · เปลี่ยนแล้วมีผลทันที
              <br />⚠️ scheduler อยู่ในแอป — <strong>เครื่อง/เว็บต้องเปิดและไม่หลับ</strong>ตอนถึงเวลา ถ้าพับฝา/เครื่องหลับจะไม่ส่ง (ใช้จริงควรรันบน server หรือตั้ง cron ภายนอกยิง /api/cron/summary)
            </p>

            <button className="btn-primary">บันทึกการตั้งค่า</button>
          </form>
        </div>

        <div className="card">
          <h2 className="card-title">ทดสอบส่ง</h2>
          <p className="muted">
            ส่งข้อความทดสอบไปยังกลุ่มที่ตั้งไว้ เพื่อตรวจว่า token และ chat id ถูกต้อง
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <form action={testSend}>
              <input type="hidden" name="target" value="team" />
              <button className="btn">ทดสอบส่งกลุ่มทีม</button>
            </form>
            <form action={testSend}>
              <input type="hidden" name="target" value="head" />
              <button className="btn">ทดสอบส่งกลุ่มหัวหน้า</button>
            </form>
          </div>

          <p className="muted" style={{ marginTop: 18, marginBottom: 6 }}>ส่งสรุปทันที (ทดสอบ):</p>
          <div style={{ display: "flex", gap: 10 }}>
            <form action={sendSummaryNow}>
              <input type="hidden" name="period" value="daily" />
              <button className="btn">📊 ส่งสรุปรายวัน</button>
            </form>
            <form action={sendSummaryNow}>
              <input type="hidden" name="period" value="weekly" />
              <button className="btn">📈 ส่งสรุปรายสัปดาห์</button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
