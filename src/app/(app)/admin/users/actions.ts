"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import { audit } from "@/lib/audit";

// เข้าถึงจัดการผู้ใช้ได้ถ้า: admin เต็ม (full) หรือมีสิทธิ์ย่อย manage_users
// full=true → ทำได้ทุกอย่าง · full=false → ห้ามยุ่งกับบทบาท/ผู้ใช้ระดับ Administrator (กันยกระดับสิทธิ์)
async function ensureUserMgr() {
  const me = await requireSession();
  const full = can(me, "admin");
  if (!full && !can(me, "manage_users")) throw new Error("ไม่มีสิทธิ์");
  return { me, full };
}

// บทบาทนี้ให้สิทธิ์ "admin" (เต็ม) ไหม — ใช้กันไม่ให้ผู้จัดการที่ไม่ใช่ admin ตั้ง/แตะบทบาทระดับนี้
async function roleGrantsAdmin(roleKey: string): Promise<boolean> {
  const r = await prisma.role.findUnique({ where: { key: roleKey } });
  if (!r) return false;
  try {
    return (JSON.parse(r.permissions) as string[]).includes("admin");
  } catch {
    return false;
  }
}

const back = (msg: string, ok = false, to = "/admin/users") =>
  redirect(`${to}?${ok ? "saved=1&" : ""}${msg ? "msg=" + encodeURIComponent(msg) : ""}`);

// path ที่จะ redirect กลับหลังทำงาน (เช่น หน้าแก้ไขรายคน) — รับจากฟอร์ม, ปลอดภัยถ้าเริ่มด้วย /admin/users
function retOf(formData: FormData): string {
  const b = String(formData.get("back") || "");
  return b.startsWith("/admin/users") ? b : "/admin/users";
}

export async function createUser(formData: FormData) {
  const { me, full } = await ensureUserMgr();
  const username = String(formData.get("username") || "").trim();
  let displayName = String(formData.get("displayName") || "").trim();
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  const role = String(formData.get("role") || "").trim();

  // error ตอนสร้าง → กลับไปหน้าฟอร์มลงทะเบียน พร้อมข้อความ
  const err = (m: string): never =>
    redirect(`/admin/users/new?err=${encodeURIComponent(m)}`);

  if (!username || !password || !role) err("กรอกข้อมูลให้ครบ");
  if (username.length < 3) err("ชื่อผู้ใช้ต้องยาวอย่างน้อย 3 ตัวอักษร");
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) err("ชื่อผู้ใช้ใช้ได้เฉพาะ a-z A-Z 0-9 . _ -");
  if (password.length < 6) err("รหัสผ่านอย่างน้อย 6 ตัว");
  if (password !== confirm) err("รหัสผ่านยืนยันไม่ตรงกัน");
  // ผู้จัดการที่ไม่ใช่ admin เต็ม ห้ามสร้างผู้ใช้ระดับ Administrator
  if (!full && (await roleGrantsAdmin(role))) err("คุณไม่มีสิทธิ์สร้างผู้ใช้ระดับผู้ดูแลระบบ");
  if (await prisma.user.findUnique({ where: { username } })) err("ชื่อผู้ใช้นี้มีอยู่แล้ว");
  if (!displayName) displayName = username; // ไม่กรอกชื่อแสดง → ใช้ชื่อผู้ใช้

  const created = await prisma.user.create({
    data: { username, displayName, role, passwordHash: await bcrypt.hash(password, 10) },
  });
  await audit(me, {
    action: "user.create",
    entity: "user",
    entityId: created.id,
    summary: `เพิ่มผู้ใช้ "${displayName}" (${username}) บทบาท ${role}`,
  });
  revalidatePath("/admin/users");
  back("เพิ่มผู้ใช้แล้ว", true);
}

// กันผู้จัดการที่ไม่ใช่ admin ไปแตะผู้ใช้ที่เป็นระดับ Administrator
async function guardTarget(full: boolean, id: number, to = "/admin/users") {
  if (full) return;
  const u = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (u && (await roleGrantsAdmin(u.role))) back("คุณไม่มีสิทธิ์จัดการผู้ใช้ระดับผู้ดูแลระบบ", false, to);
}

export async function updateUserDisplayName(formData: FormData) {
  const { me, full } = await ensureUserMgr();
  const id = Number(formData.get("userId"));
  const ret = retOf(formData);
  await guardTarget(full, id, ret);
  const displayName = String(formData.get("displayName") || "").trim();
  if (displayName.length < 2) back("ชื่อแสดงต้องยาวอย่างน้อย 2 ตัวอักษร", false, ret);
  if (displayName.length > 60) back("ชื่อแสดงยาวเกินไป (ไม่เกิน 60 ตัวอักษร)", false, ret);
  const old = await prisma.user.findUnique({ where: { id }, select: { displayName: true } });
  await prisma.user.update({ where: { id }, data: { displayName } });
  await audit(me, {
    action: "user.rename",
    entity: "user",
    entityId: id,
    summary: `เปลี่ยนชื่อแสดงผู้ใช้ #${id}: "${old?.displayName ?? "?"}" → "${displayName}"`,
    meta: { from: old?.displayName, to: displayName },
  });
  // รีเฟรช layout เผื่อเป็นชื่อของตัวเอง → ชื่อในแถบข้างอัปเดตด้วย
  revalidatePath("/", "layout");
  back("แก้ชื่อแสดงแล้ว", true, ret);
}

export async function updateUsername(formData: FormData) {
  const { me, full } = await ensureUserMgr();
  const id = Number(formData.get("userId"));
  const ret = retOf(formData);
  await guardTarget(full, id, ret);
  const username = String(formData.get("username") || "").trim();
  if (username.length < 3) back("ชื่อผู้ใช้ต้องยาวอย่างน้อย 3 ตัวอักษร", false, ret);
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) back("ชื่อผู้ใช้ใช้ได้เฉพาะ a-z A-Z 0-9 . _ -", false, ret);
  const dup = await prisma.user.findUnique({ where: { username } });
  if (dup && dup.id !== id) back("ชื่อผู้ใช้นี้มีอยู่แล้ว", false, ret);
  const old = await prisma.user.findUnique({ where: { id }, select: { username: true } });
  await prisma.user.update({ where: { id }, data: { username } });
  await audit(me, {
    action: "user.rename_username",
    entity: "user",
    entityId: id,
    summary: `เปลี่ยนชื่อผู้ใช้ (login) #${id}: "${old?.username ?? "?"}" → "${username}"`,
    meta: { from: old?.username, to: username },
  });
  // เปลี่ยนชื่อ login ของตัวเองได้ — session อิง userId จึงไม่หลุด ไม่ต้อง login ใหม่
  revalidatePath("/admin/users");
  back("เปลี่ยนชื่อผู้ใช้แล้ว", true, ret);
}

export async function setUserRole(formData: FormData) {
  const { me, full } = await ensureUserMgr();
  const id = Number(formData.get("userId"));
  const ret = retOf(formData);
  await guardTarget(full, id, ret); // ห้ามแก้บทบาทผู้ใช้ที่เป็น admin อยู่
  const role = String(formData.get("role") || "").trim();
  // ห้ามตั้งให้เป็นบทบาทระดับ admin (ถ้าไม่ใช่ admin เต็ม)
  if (!full && (await roleGrantsAdmin(role))) back("คุณไม่มีสิทธิ์ตั้งบทบาทระดับผู้ดูแลระบบ", false, ret);
  const old = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  await prisma.user.update({ where: { id }, data: { role } });
  await audit(me, {
    action: "user.role",
    entity: "user",
    entityId: id,
    summary: `เปลี่ยนบทบาทผู้ใช้ #${id}: ${old?.role ?? "?"} → ${role}`,
    meta: { from: old?.role, to: role },
  });
  revalidatePath("/admin/users");
  back("เปลี่ยนบทบาทแล้ว", true, ret);
}

export async function resetUserPassword(formData: FormData) {
  const { me, full } = await ensureUserMgr();
  const id = Number(formData.get("userId"));
  const ret = retOf(formData);
  await guardTarget(full, id, ret);
  const password = String(formData.get("password") || "");
  if (password.length < 6) back("รหัสผ่านอย่างน้อย 6 ตัว", false, ret);
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });
  await audit(me, {
    action: "user.reset_password",
    entity: "user",
    entityId: id,
    summary: `รีเซ็ตรหัสผ่านผู้ใช้ #${id}`,
  });
  revalidatePath("/admin/users");
  back("รีเซ็ตรหัสผ่านแล้ว", true, ret);
}

export async function toggleUserActive(formData: FormData) {
  const { me, full } = await ensureUserMgr();
  const id = Number(formData.get("userId"));
  const ret = retOf(formData);
  if (id === me.id) back("ปิดบัญชีตัวเองไม่ได้", false, ret);
  await guardTarget(full, id, ret);
  const u = await prisma.user.findUnique({ where: { id } });
  if (u) {
    await prisma.user.update({ where: { id }, data: { active: !u.active } });
    await audit(me, {
      action: "user.toggle_active",
      entity: "user",
      entityId: id,
      summary: `${!u.active ? "เปิด" : "ปิด"}บัญชีผู้ใช้ "${u.displayName}" (#${id})`,
    });
  }
  revalidatePath("/admin/users");
  back("อัปเดตสถานะแล้ว", true, ret);
}
