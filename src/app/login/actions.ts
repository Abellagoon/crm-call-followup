"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export type LoginState = { error?: string };

export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const remember = formData.get("remember") === "on";

  if (!username || !password) {
    return { error: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" };
  }

  const user = await prisma.user.findFirst({
    where: { username, active: true },
  });

  // เช็ครหัสด้วย bcrypt — ข้อความ error เหมือนกันทั้งกรณีไม่มี user / รหัสผิด
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };
  }

  await createSession(user.id, remember);
  await audit(user, {
    action: "auth.login",
    entity: "user",
    entityId: user.id,
    summary: `เข้าสู่ระบบ`,
  });
  redirect("/");
}
