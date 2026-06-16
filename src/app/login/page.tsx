"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "./actions";

const initial: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initial);
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="login-wrap">
      <div className="login-bg" aria-hidden="true">
        <span className="orb orb-1" />
        <span className="orb orb-2" />
        <span className="orb orb-3" />
        <span className="login-grid" />
      </div>
      <form className="login-card" action={formAction}>
        <h1>📞 CRM ติดตามลูกค้า</h1>
        <p className="sub">เข้าสู่ระบบเพื่อเริ่มงาน</p>

        {state.error && <div className="alert alert-error">{state.error}</div>}

        <label className="field">
          <span className="lbl">ชื่อผู้ใช้</span>
          <input
            className="input"
            name="username"
            autoComplete="username"
            placeholder="เช่น agent1"
            autoFocus
          />
        </label>

        <label className="field">
          <span className="lbl">รหัสผ่าน</span>
          <div style={{ position: "relative" }}>
            <input
              className="input"
              name="password"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              style={{ paddingRight: 42 }}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              title={showPw ? "ซ่อนรหัสผ่าน" : "ดูรหัสผ่าน"}
              aria-label={showPw ? "ซ่อนรหัสผ่าน" : "ดูรหัสผ่าน"}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
                padding: 4,
              }}
            >
              {showPw ? "🙈" : "👁️"}
            </button>
          </div>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "2px 0 16px", cursor: "pointer" }}>
          <input type="checkbox" name="remember" />
          <span>จดจำฉันไว้ (อยู่ในระบบ 30 วัน)</span>
        </label>

        <button className="btn-primary" style={{ width: "100%" }} disabled={pending}>
          {pending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>
    </div>
  );
}
