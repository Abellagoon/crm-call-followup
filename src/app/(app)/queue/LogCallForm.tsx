"use client";

import { useActionState } from "react";
import { logCall, type LogCallState } from "./actions";
import { OUTCOME_LABELS, DISPOSITION_LABELS } from "@/lib/labels";

const initial: LogCallState = {};

export default function LogCallForm({ contactId }: { contactId: number }) {
  const [state, formAction, pending] = useActionState(logCall, initial);

  return (
    <form action={formAction}>
      <input type="hidden" name="contactId" value={contactId} />

      {state.error && <div className="alert alert-error">{state.error}</div>}

      <div className="grid grid-2">
        <label className="field">
          <span className="lbl">ผลสาย *</span>
          <select className="input" name="outcome" defaultValue="">
            <option value="" disabled>
              — เลือกผลสาย —
            </option>
            {Object.entries(OUTCOME_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="lbl">การเสนอ</span>
          <select className="input" name="disposition" defaultValue="">
            <option value="">— ไม่มี —</option>
            {Object.entries(DISPOSITION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span className="lbl">นัดโทรอีกครั้ง (ไม่บังคับ)</span>
        <input className="input" type="datetime-local" name="nextCall" />
        <span className="muted" style={{ fontSize: 12 }}>
          ถ้ากรอก ระบบจะนำรายการกลับเข้าคิวตามเวลานัด และแจ้งเตือนเข้ากลุ่มทีม
        </span>
      </label>

      <label className="field">
        <span className="lbl">หมายเหตุ</span>
        <textarea className="input" name="note" rows={2} placeholder="เช่น ลูกค้าขอคิดดูก่อน" />
      </label>

      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <input type="checkbox" name="smsSent" />
        <span>ส่ง SMS หลังโทรแล้ว</span>
      </label>

      <button className="btn-primary" disabled={pending}>
        {pending ? "กำลังบันทึก..." : "บันทึกผลสาย"}
      </button>
    </form>
  );
}
