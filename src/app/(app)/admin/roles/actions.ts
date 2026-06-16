"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import { ALL_PERMS } from "@/lib/permissions";
import { audit } from "@/lib/audit";

async function ensureAdmin() {
  const me = await requireSession();
  if (!can(me, "admin")) throw new Error("ไม่มีสิทธิ์");
  return me;
}

function readPerms(formData: FormData): string[] {
  const perms = formData.getAll("perm").map(String);
  return ALL_PERMS.filter((p) => perms.includes(p));
}

function slugKey(s: string): string {
  return s.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_") || "";
}

export async function createRole(formData: FormData) {
  const me = await ensureAdmin();
  const name = String(formData.get("name") || "").trim();
  if (!name) redirect("/admin/roles?err=" + encodeURIComponent("กรุณากรอกชื่อบทบาท"));

  let key = slugKey(String(formData.get("key") || "")) || slugKey(name) || "ROLE";
  // กันชนกับ key เดิม
  if (await prisma.role.findUnique({ where: { key } })) {
    key = `${key}_${Math.floor(performance.now())}`;
  }

  const perms = readPerms(formData);
  const created = await prisma.role.create({
    data: { key, name, permissions: JSON.stringify(perms), isSystem: false },
  });
  await audit(me, {
    action: "role.create",
    entity: "role",
    entityId: created.id,
    summary: `สร้างบทบาท "${name}" (${key}) · ${perms.length} สิทธิ์`,
    meta: { key, permissions: perms },
  });
  revalidatePath("/admin/roles");
  redirect("/admin/roles?saved=1");
}

export async function updateRole(formData: FormData) {
  const me = await ensureAdmin();
  const id = Number(formData.get("roleId"));
  const name = String(formData.get("name") || "").trim();
  if (!name) redirect("/admin/roles?err=" + encodeURIComponent("ชื่อบทบาทห้ามว่าง"));

  const old = await prisma.role.findUnique({ where: { id }, select: { name: true, permissions: true } });
  const perms = readPerms(formData);
  await prisma.role.update({
    where: { id },
    data: { name, permissions: JSON.stringify(perms) },
  });
  await audit(me, {
    action: "role.update",
    entity: "role",
    entityId: id,
    summary: `แก้บทบาท "${name}" (#${id}) · ${perms.length} สิทธิ์`,
    meta: { from: { name: old?.name, permissions: old?.permissions }, to: { name, permissions: perms } },
  });
  revalidatePath("/admin/roles");
  redirect("/admin/roles?saved=1");
}

export async function deleteRole(formData: FormData) {
  const me = await ensureAdmin();
  const id = Number(formData.get("roleId"));
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) redirect("/admin/roles");
  if (role!.isSystem) redirect("/admin/roles?err=" + encodeURIComponent("ลบบทบาทพื้นฐานไม่ได้"));

  const users = await prisma.user.count({ where: { role: role!.key } });
  if (users > 0)
    redirect("/admin/roles?err=" + encodeURIComponent(`มีผู้ใช้ ${users} คนใช้บทบาทนี้อยู่`));

  await prisma.role.delete({ where: { id } });
  await audit(me, {
    action: "role.delete",
    entity: "role",
    entityId: id,
    summary: `ลบบทบาท "${role!.name}" (${role!.key})`,
  });
  revalidatePath("/admin/roles");
  redirect("/admin/roles?saved=1");
}
