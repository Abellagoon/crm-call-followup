"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, can, type SessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notifyBigAmount } from "@/lib/telegram";
import { sendSms, renderTemplate } from "@/lib/sms";
import { OUTCOME_LABELS, STATUS_LABELS } from "@/lib/labels";
import { bangkokMonthStart, toDateInputValue, parseThaiDate } from "@/lib/dates";

async function ensure() {
  const session = await requireSession();
  if (!can(session, "customers")) throw new Error("ไม่มีสิทธิ์");
  return session;
}
// เกณฑ์การบ้าน: agent (ไม่มี view_all) แตะได้เฉพาะลูกค้าที่ตัวเองรับผิดชอบเท่านั้น
async function assertOwns(session: SessionUser, customerId: number) {
  if (can(session, "view_all")) return; // หัวหน้า/แอดมินทำได้ทุกราย
  const owns = await prisma.campaignContact.count({
    where: { customerId, assigneeId: session.id },
  });
  if (!owns) throw new Error("ไม่มีสิทธิ์เข้าถึงลูกค้ารายนี้");
}
function back(customerId: number) {
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  redirect(`/customers/${customerId}?saved=1`);
}
function money(v: FormDataEntryValue | null): number {
  return Math.max(0, Math.round(Number(String(v || "").replace(/[^\d.]/g, "")) || 0));
}

// ปรับสถานะอัตโนมัติตามยอดฝาก: มีฝาก → "ฝากแล้ว" (ถ้ายัง "ขาดฝาก"), ไม่เหลือฝาก → กลับ "ขาดฝาก" (ถ้าเป็น "ฝากแล้ว")
// ตั้งใจไม่ยุ่งกับสถานะ "ห้ามโทร" / "ยังเล่นอยู่" (ถือเป็นการตั้งค่าด้วยมือ)
async function syncDepositStatus(
  actor: { id: number; displayName: string },
  customerId: number
) {
  const [count, customer] = await Promise.all([
    prisma.depositEvent.count({ where: { customerId } }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { status: true } }),
  ]);
  if (!customer) return;
  let next: string | null = null;
  if (count > 0 && customer.status === "LAPSED") next = "DEPOSITED";
  else if (count === 0 && customer.status === "DEPOSITED") next = "LAPSED";
  if (!next) return;
  await prisma.customer.update({ where: { id: customerId }, data: { status: next } });
  await audit(actor, {
    action: "customer.status",
    entity: "customer",
    entityId: customerId,
    summary: `สถานะลูกค้า #${customerId} เปลี่ยนอัตโนมัติ → ${STATUS_LABELS[next]} (ตามยอดฝาก)`,
    meta: { from: customer.status, to: next, auto: true },
  });
}

// ----- ข้อ 7: ห้ามโทร (DNC) -----
// ตั้งห้ามโทร: ต้องมีเหตุผล + ปิดงานค้างในคิว (DONE) + ล้างนัดโทรทั้งหมดอัตโนมัติ
export async function setDnc(formData: FormData) {
  const me = await ensure();
  const customerId = Number(formData.get("customerId"));
  await assertOwns(me, customerId);
  const reason = String(formData.get("reason") || "").trim();
  const backUrl = String(formData.get("back") || "").trim();
  if (!reason) {
    redirect(`/customers/${customerId}?err=${encodeURIComponent("กรุณากรอกเหตุผลที่ห้ามโทร")}`);
  }
  await prisma.$transaction([
    prisma.customer.update({
      where: { id: customerId },
      data: { status: "DO_NOT_CALL", dncReason: reason, dncAt: new Date() },
    }),
    // ปิดงานค้าง + ล้างนัดโทร (กันโผล่ในคิว/คิวนัด)
    prisma.campaignContact.updateMany({
      where: { customerId },
      data: { status: "DONE", nextCallAt: null },
    }),
  ]);
  await audit(me, {
    action: "customer.dnc_on",
    entity: "customer",
    entityId: customerId,
    summary: `ตั้งห้ามโทรลูกค้า #${customerId} — เหตุผล: ${reason}`,
    meta: { reason },
  });
  revalidatePath("/customers/dnc");
  revalidatePath("/queue");
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  redirect(backUrl || `/customers/${customerId}?saved=1`);
}

// ปลดห้ามโทร: คืนสถานะ (ขาดฝาก แล้ว sync→ฝากแล้วถ้ามีฝาก) + เปิดงานกลับเข้าคิว
export async function unsetDnc(formData: FormData) {
  const me = await ensure();
  const customerId = Number(formData.get("customerId"));
  await assertOwns(me, customerId);
  const backUrl = String(formData.get("back") || "").trim();
  await prisma.$transaction([
    prisma.customer.update({
      where: { id: customerId },
      data: { status: "LAPSED", dncReason: null, dncAt: null },
    }),
    prisma.campaignContact.updateMany({ where: { customerId }, data: { status: "PENDING" } }),
  ]);
  await syncDepositStatus(me, customerId); // มีฝากอยู่ → ฝากแล้ว
  await audit(me, {
    action: "customer.dnc_off",
    entity: "customer",
    entityId: customerId,
    summary: `ปลดห้ามโทรลูกค้า #${customerId}`,
  });
  revalidatePath("/customers/dnc");
  revalidatePath("/queue");
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  redirect(backUrl || `/customers/${customerId}?saved=1`);
}

// ----- ข้อ 11: ส่ง SMS หาลูกค้า (จากเทมเพลตหรือพิมพ์เอง) + บันทึกประวัติ -----
export async function sendCustomerSms(formData: FormData) {
  const me = await ensure();
  const customerId = Number(formData.get("customerId"));
  await assertOwns(me, customerId);
  const templateId = Number(formData.get("templateId")) || 0;
  let body = String(formData.get("body") || "").trim();

  const cust = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { brand: { select: { name: true } } },
  });
  if (!cust) redirect("/customers");

  // ถ้าเลือกเทมเพลตและยังไม่ได้พิมพ์ข้อความเอง → ใช้ข้อความจากเทมเพลต
  if (templateId && !body) {
    const t = await prisma.smsTemplate.findUnique({ where: { id: templateId } });
    if (t) body = t.body;
  }
  body = renderTemplate(body, { phone: cust!.phone, brand: cust!.brand.name });
  if (!body) {
    redirect(`/customers/${customerId}?err=${encodeURIComponent("กรุณาเลือกเทมเพลตหรือพิมพ์ข้อความ")}`);
  }

  const r = await sendSms(cust!.phone, body);
  const status = r.ok ? "SENT" : r.skipped ? "SKIPPED" : "FAILED";
  await prisma.smsLog.create({
    data: { customerId, phone: cust!.phone, body, status, error: r.error ?? null, sentById: me.id },
  });
  await audit(me, {
    action: "sms.send",
    entity: "sms",
    entityId: customerId,
    summary: `ส่ง SMS หาลูกค้า #${customerId} — ${status}`,
    meta: { status, error: r.error },
  });
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}?sms=${status.toLowerCase()}${r.error ? `&smsmsg=${encodeURIComponent(r.error)}` : ""}`);
}

// ----- แก้ไข/ลบ ประวัติการโทร -----
export async function updateCall(formData: FormData) {
  const me = await ensure();
  const id = Number(formData.get("callId"));
  const customerId = Number(formData.get("customerId"));
  await assertOwns(me, customerId);
  const outcome = String(formData.get("outcome") || "");
  if (!OUTCOME_LABELS[outcome]) back(customerId);
  await prisma.callLog.update({
    where: { id },
    data: {
      outcome,
      disposition: formData.get("promo") === "on" ? "PROMO_20" : null,
      smsSent: formData.get("sms") === "on",
      note: String(formData.get("note") || "").trim(),
    },
  });
  await audit(me, {
    action: "call.update",
    entity: "call",
    entityId: id,
    summary: `แก้ประวัติการโทร #${id} (ลูกค้า #${customerId}) → ${OUTCOME_LABELS[outcome]}`,
  });
  back(customerId);
}
export async function deleteCall(formData: FormData) {
  const me = await ensure();
  const id = Number(formData.get("callId"));
  const customerId = Number(formData.get("customerId"));
  await assertOwns(me, customerId);
  const old = await prisma.callLog.findUnique({ where: { id } });
  await prisma.callLog.delete({ where: { id } });
  await audit(me, {
    action: "call.delete",
    entity: "call",
    entityId: id,
    summary: `ลบประวัติการโทร #${id} (ลูกค้า #${customerId})`,
    meta: old ? { outcome: old.outcome, note: old.note, calledAt: old.calledAt } : undefined,
  });
  back(customerId);
}

// ----- เพิ่ม ยอดฝากกลับ / โบนัส (เลือกวันที่เองได้) -----
export async function addDeposit(formData: FormData) {
  const me = await ensure();
  const customerId = Number(formData.get("customerId"));
  await assertOwns(me, customerId);
  const dateStr = String(formData.get("date") || "").trim();
  const amount = money(formData.get("amount"));
  if (!dateStr || amount <= 0) back(customerId); // ต้องมีวันที่ + ยอด > 0
  await prisma.depositEvent.create({
    data: { customerId, amount, date: parseThaiDate(dateStr), period: dateStr.slice(0, 7) },
  });
  await audit(me, {
    action: "deposit.create",
    entity: "deposit",
    entityId: customerId,
    summary: `เพิ่มยอดฝาก ${amount.toLocaleString()} บาท (ลูกค้า #${customerId}) วันที่ ${dateStr}`,
  });
  await syncDepositStatus(me, customerId);
  const cust = await prisma.customer.findUnique({ where: { id: customerId }, select: { phone: true, brand: { select: { name: true } } } });
  if (cust) await notifyBigAmount({ kind: "deposit", amount, phone: cust.phone, brand: cust.brand.name, by: me.displayName });
  back(customerId);
}

export async function addBonus(formData: FormData) {
  const me = await ensure();
  const customerId = Number(formData.get("customerId"));
  await assertOwns(me, customerId);
  const dateStr = String(formData.get("date") || "").trim();
  const amount = money(formData.get("amount"));
  if (!dateStr || amount <= 0) back(customerId);
  await prisma.bonusAdjustment.create({
    data: { customerId, amount, date: parseThaiDate(dateStr), period: dateStr.slice(0, 7) },
  });
  await audit(me, {
    action: "bonus.create",
    entity: "bonus",
    entityId: customerId,
    summary: `เพิ่มโบนัส ${amount.toLocaleString()} บาท (ลูกค้า #${customerId}) วันที่ ${dateStr}`,
  });
  const cust = await prisma.customer.findUnique({ where: { id: customerId }, select: { phone: true, brand: { select: { name: true } } } });
  if (cust) await notifyBigAmount({ kind: "bonus", amount, phone: cust.phone, brand: cust.brand.name, by: me.displayName });
  back(customerId);
}

// ----- แก้ไข/ลบ ยอดฝากกลับ -----
export async function updateDeposit(formData: FormData) {
  const me = await ensure();
  const id = Number(formData.get("depositId"));
  const customerId = Number(formData.get("customerId"));
  await assertOwns(me, customerId);
  const dateStr = String(formData.get("date") || "");
  const amount = money(formData.get("amount"));
  await prisma.depositEvent.update({
    where: { id },
    data: { amount, date: parseThaiDate(dateStr), period: dateStr.slice(0, 7) },
  });
  await audit(me, {
    action: "deposit.update",
    entity: "deposit",
    entityId: id,
    summary: `แก้ยอดฝาก #${id} (ลูกค้า #${customerId}) → ${amount.toLocaleString()} บาท`,
  });
  await syncDepositStatus(me, customerId);
  back(customerId);
}
export async function deleteDeposit(formData: FormData) {
  const me = await ensure();
  const id = Number(formData.get("depositId"));
  const customerId = Number(formData.get("customerId"));
  await assertOwns(me, customerId);
  const old = await prisma.depositEvent.findUnique({ where: { id } });
  await prisma.depositEvent.delete({ where: { id } });
  await audit(me, {
    action: "deposit.delete",
    entity: "deposit",
    entityId: id,
    summary: `ลบยอดฝาก #${id} (ลูกค้า #${customerId})${old ? ` ยอด ${old.amount.toLocaleString()} บาท` : ""}`,
    meta: old ? { amount: old.amount, date: old.date } : undefined,
  });
  await syncDepositStatus(me, customerId);
  back(customerId);
}

// ----- แก้ไข/ลบ โบนัส -----
export async function updateBonus(formData: FormData) {
  const me = await ensure();
  const id = Number(formData.get("bonusId"));
  const customerId = Number(formData.get("customerId"));
  await assertOwns(me, customerId);
  const dateStr = String(formData.get("date") || "");
  const amount = money(formData.get("amount"));
  await prisma.bonusAdjustment.update({
    where: { id },
    data: { amount, date: parseThaiDate(dateStr), period: dateStr.slice(0, 7) },
  });
  await audit(me, {
    action: "bonus.update",
    entity: "bonus",
    entityId: id,
    summary: `แก้โบนัส #${id} (ลูกค้า #${customerId}) → ${amount.toLocaleString()} บาท`,
  });
  back(customerId);
}
export async function deleteBonus(formData: FormData) {
  const me = await ensure();
  const id = Number(formData.get("bonusId"));
  const customerId = Number(formData.get("customerId"));
  await assertOwns(me, customerId);
  const old = await prisma.bonusAdjustment.findUnique({ where: { id } });
  await prisma.bonusAdjustment.delete({ where: { id } });
  await audit(me, {
    action: "bonus.delete",
    entity: "bonus",
    entityId: id,
    summary: `ลบโบนัส #${id} (ลูกค้า #${customerId})${old ? ` ยอด ${old.amount.toLocaleString()} บาท` : ""}`,
    meta: old ? { amount: old.amount, date: old.date } : undefined,
  });
  back(customerId);
}

export async function recordFollowup(formData: FormData) {
  const session = await requireSession();
  if (!can(session, "customers")) throw new Error("ไม่มีสิทธิ์");

  const customerId = Number(formData.get("customerId"));
  await assertOwns(session, customerId);
  const outcome = String(formData.get("outcome") || "");
  const promo = formData.get("promo") === "on";
  const sms = formData.get("sms") === "on";
  const note = String(formData.get("note") || "").trim();
  const depositStr = String(formData.get("deposit") || "").trim();
  const statusSel = String(formData.get("status") || "").trim();

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { brand: { select: { name: true } } },
  });
  if (!customer) redirect("/customers");

  const period = toDateInputValue(bangkokMonthStart()).slice(0, 7); // "YYYY-MM"
  const now = new Date();
  const deposit = depositStr ? Math.max(0, Math.round(Number(depositStr.replace(/[^\d.]/g, "")) || 0)) : 0;

  // 1) บันทึกผลโทร (ถ้าเลือกผลสาย) — เรียลไทม์
  if (OUTCOME_LABELS[outcome]) {
    // หา/สร้าง contact ของลูกค้ารายนี้
    let contact = await prisma.campaignContact.findFirst({ where: { customerId } });
    if (!contact) {
      let campaign = await prisma.campaign.findFirst({ orderBy: { id: "asc" } });
      if (!campaign) campaign = await prisma.campaign.create({ data: { name: "ติดตามลูกค้า" } });
      contact = await prisma.campaignContact.create({
        data: { campaignId: campaign.id, customerId, assigneeId: session.id, status: "PENDING" },
      });
    }
    await prisma.callLog.create({
      data: {
        contactId: contact.id,
        callerId: session.id,
        outcome,
        disposition: promo ? "PROMO_20" : null,
        smsSent: sms,
        note,
        calledAt: now,
        period,
      },
    });
  }

  // 2) ยอดฝาก → บันทึก + ตั้งสถานะ "ฝากแล้ว" อัตโนมัติ
  let newStatus: string | null = statusSel || null;
  if (deposit > 0) {
    await prisma.depositEvent.create({
      data: { customerId, amount: deposit, date: now, period },
    });
    newStatus = "DEPOSITED";
    await notifyBigAmount({ kind: "deposit", amount: deposit, phone: customer.phone, brand: customer.brand.name, by: session.displayName });
  }

  if (newStatus && newStatus !== customer.status) {
    await prisma.customer.update({ where: { id: customerId }, data: { status: newStatus } });
    await audit(session, {
      action: "customer.status",
      entity: "customer",
      entityId: customerId,
      summary: `เปลี่ยนสถานะลูกค้า #${customerId}: ${STATUS_LABELS[customer.status] ?? customer.status} → ${STATUS_LABELS[newStatus] ?? newStatus}`,
      meta: { from: customer.status, to: newStatus },
    });
  }

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  redirect(`/customers/${customerId}?saved=1`);
}
