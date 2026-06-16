"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { setSetting } from "@/lib/telegram";
import { sendSms, renderTemplate } from "@/lib/sms";

async function ensure() {
  const me = await requireSession();
  if (!can(me, "notifications")) throw new Error("ไม่มีสิทธิ์");
  return me;
}

const BULK_CAP = 200; // จำกัดจำนวนต่อรอบ กันส่งพลาดเยอะ/ค่าใช้จ่ายบาน

// ส่ง SMS หลายเบอร์ (เลือกจากหน้าส่งหลายเบอร์ 5.3) — ข้าม DNC, log ทุกเบอร์
export async function sendBulkSms(formData: FormData) {
  const me = await ensure();
  const ids = formData.getAll("ids").map((v) => Number(v)).filter(Boolean);
  const templateId = Number(formData.get("templateId")) || 0;
  const backUrl = String(formData.get("back") || "/admin/sms/bulk");
  const go = (m: string): never =>
    redirect(`${backUrl}${backUrl.includes("?") ? "&" : "?"}msg=${encodeURIComponent(m)}`);

  if (ids.length === 0) go("ยังไม่ได้เลือกเบอร์ลูกค้า");
  if (!templateId) go("กรุณาเลือกเทมเพลตข้อความ");
  if (ids.length > BULK_CAP) go(`เลือกได้สูงสุด ${BULK_CAP} เบอร์/ครั้ง (เลือกมา ${ids.length})`);

  const tpl = await prisma.smsTemplate.findUnique({ where: { id: templateId } });
  if (!tpl) go("ไม่พบเทมเพลตที่เลือก");

  const customers = await prisma.customer.findMany({
    where: { id: { in: ids } },
    include: { brand: { select: { name: true } } },
  });

  let sent = 0, failed = 0, skippedDnc = 0, skippedGw = 0;
  for (const c of customers) {
    if (c.status === "DO_NOT_CALL") {
      skippedDnc++;
      continue;
    }
    const body = renderTemplate(tpl!.body, { phone: c.phone, brand: c.brand.name });
    const r = await sendSms(c.phone, body);
    const status = r.ok ? "SENT" : r.skipped ? "SKIPPED" : "FAILED";
    if (r.ok) sent++;
    else if (r.skipped) skippedGw++;
    else failed++;
    await prisma.smsLog.create({
      data: { customerId: c.id, phone: c.phone, body, status, error: r.error ?? null, sentById: me.id },
    });
  }

  await audit(me, {
    action: "sms.bulk_send",
    entity: "sms",
    summary: `ส่ง SMS หลายเบอร์ (เทมเพลต "${tpl!.name}"): สำเร็จ ${sent}, ล้มเหลว ${failed}, ข้าม DNC ${skippedDnc}${skippedGw ? `, ข้าม(gateway ปิด) ${skippedGw}` : ""}`,
    meta: { sent, failed, skippedDnc, skippedGw, templateId, total: customers.length },
  });

  revalidatePath("/admin/sms/bulk");
  go(
    `ส่ง SMS เสร็จ — สำเร็จ ${sent}` +
      (skippedDnc ? ` · ข้าม DNC ${skippedDnc}` : "") +
      (skippedGw ? ` · ข้าม (ยังไม่เปิด gateway) ${skippedGw}` : "") +
      (failed ? ` · ล้มเหลว ${failed}` : "")
  );
}

export async function saveSmsGateway(formData: FormData) {
  const me = await ensure();
  await setSetting("sms_gateway_url", String(formData.get("sms_gateway_url") || "").trim());
  await setSetting("sms_enabled", formData.get("sms_enabled") === "on" ? "1" : "0");
  await audit(me, { action: "settings.sms", entity: "settings", summary: "แก้ไขการตั้งค่า SMS gateway" });
  revalidatePath("/admin/sms");
  redirect("/admin/sms?saved=1");
}

export async function createSmsTemplate(formData: FormData) {
  const me = await ensure();
  const name = String(formData.get("name") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!name || !body) redirect("/admin/sms?err=" + encodeURIComponent("กรอกชื่อและข้อความให้ครบ"));
  const t = await prisma.smsTemplate.create({ data: { name, body } });
  await audit(me, { action: "sms_template.create", entity: "settings", entityId: t.id, summary: `เพิ่มเทมเพลต SMS "${name}"` });
  revalidatePath("/admin/sms");
  redirect("/admin/sms?saved=1");
}

export async function updateSmsTemplate(formData: FormData) {
  const me = await ensure();
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!name || !body) redirect("/admin/sms?err=" + encodeURIComponent("กรอกชื่อและข้อความให้ครบ"));
  await prisma.smsTemplate.update({ where: { id }, data: { name, body } });
  await audit(me, { action: "sms_template.update", entity: "settings", entityId: id, summary: `แก้เทมเพลต SMS "${name}"` });
  revalidatePath("/admin/sms");
  redirect("/admin/sms?saved=1");
}

export async function toggleSmsTemplate(formData: FormData) {
  await ensure();
  const id = Number(formData.get("id"));
  const t = await prisma.smsTemplate.findUnique({ where: { id } });
  if (t) await prisma.smsTemplate.update({ where: { id }, data: { active: !t.active } });
  revalidatePath("/admin/sms");
  redirect("/admin/sms?saved=1");
}

export async function deleteSmsTemplate(formData: FormData) {
  const me = await ensure();
  const id = Number(formData.get("id"));
  const t = await prisma.smsTemplate.findUnique({ where: { id } });
  await prisma.smsTemplate.delete({ where: { id } });
  await audit(me, { action: "sms_template.delete", entity: "settings", entityId: id, summary: `ลบเทมเพลต SMS "${t?.name ?? id}"` });
  revalidatePath("/admin/sms");
  redirect("/admin/sms?saved=1");
}
