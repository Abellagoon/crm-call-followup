"use client";

import { useActionState } from "react";
import { changePassword, type ChangePwState } from "./actions";

const initial: ChangePwState = {};

export default function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, initial);

  return (
    <form action={formAction} style={{ maxWidth: 420 }}>
      {state.error && <div className="alert alert-error">{state.error}</div>}
      {state.success && <div className="alert alert-success">{state.success}</div>}

      <label className="field">
        <span className="lbl">รหัสผ่านเดิม</span>
        <input className="input" type="password" name="current" autoComplete="current-password" />
      </label>
      <label className="field">
        <span className="lbl">รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</span>
        <input className="input" type="password" name="next" autoComplete="new-password" />
      </label>
      <label className="field">
        <span className="lbl">ยืนยันรหัสผ่านใหม่</span>
        <input className="input" type="password" name="confirm" autoComplete="new-password" />
      </label>

      <button className="btn-primary" disabled={pending}>
        {pending ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
      </button>
    </form>
  );
}
