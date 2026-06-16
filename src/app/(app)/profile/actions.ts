"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export type ChangePwState = { error?: string; success?: string };
export type ProfileState = { error?: string; success?: string };

// แก้ชื่อแสดงของตัวเอง — userId มาจาก session เท่านั้น (ห้ามรับจากฟอร์ม), บทบาทแก้ที่หน้าผู้ใช้งาน (admin)
export async function updateDisplayName(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const session = await requireSession();
  const name = String(formData.get("displayName") || "").trim();

  if (name.length < 2) return { error: "ชื่อแสดงต้องยาวอย่างน้อย 2 ตัวอักษร" };
  if (name.length > 60) return { error: "ชื่อแสดงยาวเกินไป (ไม่เกิน 60 ตัวอักษร)" };

  const old = await prisma.user.findUnique({ where: { id: session.id }, select: { displayName: true } });
  await prisma.user.update({ where: { id: session.id }, data: { displayName: name } });
  await audit(session, {
    action: "user.rename",
    entity: "user",
    entityId: session.id,
    summary: `แก้ชื่อแสดงของตัวเอง: "${old?.displayName ?? "?"}" → "${name}"`,
    meta: { from: old?.displayName, to: name },
  });

  // รีเฟรชทั้ง layout เพื่อให้ชื่อในแถบข้าง (userbox) อัปเดตด้วย
  revalidatePath("/", "layout");
  return { success: "บันทึกชื่อแสดงเรียบร้อยแล้ว" };
}

export async function changePassword(
  _prev: ChangePwState,
  formData: FormData
): Promise<ChangePwState> {
  // อ่าน userId จาก session เท่านั้น — ห้ามรับจากฟอร์ม
  const session = await requireSession();

  const current = String(formData.get("current") || "");
  const next = String(formData.get("next") || "");
  const confirm = String(formData.get("confirm") || "");

  if (!current || !next || !confirm) {
    return { error: "กรุณากรอกข้อมูลให้ครบทุกช่อง" };
  }
  if (next.length < 6) {
    return { error: "รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร" };
  }
  if (next !== confirm) {
    return { error: "รหัสผ่านใหม่และการยืนยันไม่ตรงกัน" };
  }

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return { error: "ไม่พบผู้ใช้" };

  const ok = await bcrypt.compare(current, user.passwordHash);
  if (!ok) {
    return { error: "รหัสผ่านเดิมไม่ถูกต้อง" };
  }

  const passwordHash = await bcrypt.hash(next, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });
  await audit(session, {
    action: "user.change_password",
    entity: "user",
    entityId: user.id,
    summary: `เปลี่ยนรหัสผ่านของตัวเอง`,
  });

  return { success: "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว" };
}
