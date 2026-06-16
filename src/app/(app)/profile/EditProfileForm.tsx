"use client";

import { useActionState } from "react";
import { updateDisplayName, type ProfileState } from "./actions";

const initial: ProfileState = {};

export default function EditProfileForm({
  displayName,
  username,
  roleName,
}: {
  displayName: string;
  username: string;
  roleName: string;
}) {
  const [state, formAction, pending] = useActionState(updateDisplayName, initial);

  return (
    <form action={formAction}>
      {state.error && <div className="alert alert-error">{state.error}</div>}
      {state.success && <div className="alert alert-success">{state.success}</div>}

      <label className="field">
        <span className="lbl">ชื่อแสดง</span>
        <input
          className="input"
          name="displayName"
          defaultValue={displayName}
          maxLength={60}
          required
        />
      </label>

      <table style={{ margin: "4px 0 12px" }}>
        <tbody>
          <tr>
            <th style={{ width: 100 }}>ชื่อผู้ใช้</th>
            <td>{username}</td>
          </tr>
          <tr>
            <th>บทบาท</th>
            <td>
              {roleName} <span className="muted" style={{ fontSize: 12 }}>· แก้ที่หัวข้อ 4.1 ผู้ใช้งาน</span>
            </td>
          </tr>
        </tbody>
      </table>

      <button className="btn-primary" disabled={pending}>
        {pending ? "กำลังบันทึก..." : "บันทึกชื่อแสดง"}
      </button>
    </form>
  );
}
