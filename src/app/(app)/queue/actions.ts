"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import { parseThaiDateTime } from "@/lib/dates";
import { notifyCallback } from "@/lib/telegram";
import { audit } from "@/lib/audit";
import { OUTCOME_LABELS, formatPhone, formatDateTime } from "@/lib/labels";

export type LogCallState = { error?: string };

export async function logCall(
  _prev: LogCallState,
  formData: FormData
): Promise<LogCallState> {
  const session = await requireSession();

  const contactId = Number(formData.get("contactId"));
  const outcome = String(formData.get("outcome") || "");
  const disposition = String(formData.get("disposition") || "") || null;
  const smsSent = formData.get("smsSent") === "on";
  const note = String(formData.get("note") || "").trim();
  const nextCallStr = String(formData.get("nextCall") || "").trim();

  if (!OUTCOME_LABELS[outcome]) return { error: "กรุณาเลือกผลสาย" };

  const contact = await prisma.campaignContact.findUnique({
    where: { id: contactId },
    include: { customer: { include: { brand: true } } },
  });
  if (!contact) return { error: "ไม่พบรายการในคิว" };

  // สิทธิ์: ผู้ที่ไม่มีสิทธิ์ดูงานทุกคน บันทึกได้เฉพาะงานของตัวเอง
  if (!can(session, "view_all") && contact.assigneeId !== session.id) {
    return { error: "ไม่มีสิทธิ์บันทึกงานนี้" };
  }
  // ข้อ 7: กันลูกค้าห้ามโทร แม้ยิง action ตรง
  if (contact.customer.status === "DO_NOT_CALL") {
    return { error: "ลูกค้ารายนี้อยู่ในสถานะห้ามโทร — บันทึกไม่ได้" };
  }

  const nextCallAt = nextCallStr ? parseThaiDateTime(nextCallStr) : null;

  await prisma.$transaction(async (tx) => {
    await tx.callLog.create({
      data: { contactId, callerId: session.id, outcome, disposition, smsSent, note },
    });
    if (nextCallAt) {
      // มีนัด → กลับเข้าคิวพร้อมเวลานัด
      await tx.campaignContact.update({
        where: { id: contactId },
        data: { nextCallAt, status: "PENDING" },
      });
    } else {
      // ไม่มีนัด → ปิดงาน และล้างนัดเดิม (ถือว่าทำนัดนั้นแล้ว)
      await tx.campaignContact.update({
        where: { id: contactId },
        data: { nextCallAt: null, status: "DONE" },
      });
    }
  });

  // เชื่อมข้อ 12: แจ้งเตือนนัดเข้ากลุ่มทีม (ส่งไม่ได้ก็ไม่ทำให้งานพัง)
  if (nextCallAt) {
    await notifyCallback(
      `📅 <b>นัดโทรกลับ</b>\n` +
        `เว็บ ${contact.customer.brand.name}\n` +
        `เบอร์ ${formatPhone(contact.customer.phone)}\n` +
        `นัด: ${formatDateTime(nextCallAt)}\n` +
        `โดย: ${session.displayName}`
    );
  }

  revalidatePath("/queue");
  revalidatePath(`/customers/${contact.customerId}`);
  redirect("/queue?saved=1");
}

// แก้ไขวันนัดโทร (เผื่อกรอกผิด) — ค่าว่าง = ลบนัด
export async function updateAppointment(formData: FormData) {
  const session = await requireSession();
  const contactId = Number(formData.get("contactId"));
  const nextStr = String(formData.get("nextCall") || "").trim();
  const backUrl = String(formData.get("back") || "/queue");
  const contact = await prisma.campaignContact.findUnique({ where: { id: contactId } });
  if (!contact) redirect(backUrl);
  if (!can(session, "view_all") && contact!.assigneeId !== session.id) redirect(backUrl);
  const nextAt = nextStr ? parseThaiDateTime(nextStr) : null;
  await prisma.campaignContact.update({
    where: { id: contactId },
    data: { nextCallAt: nextAt },
  });
  await audit(session, {
    action: nextAt ? "appointment.update" : "appointment.clear",
    entity: "appointment",
    entityId: contactId,
    summary: nextAt
      ? `แก้วันนัดโทร (คิว #${contactId}) → ${formatDateTime(nextAt)}`
      : `ลบวันนัดโทร (คิว #${contactId})`,
  });
  revalidatePath("/queue");
  redirect(backUrl);
}

// ลบวันนัดโทร
export async function clearAppointment(formData: FormData) {
  const session = await requireSession();
  const contactId = Number(formData.get("contactId"));
  const backUrl = String(formData.get("back") || "/queue");
  const contact = await prisma.campaignContact.findUnique({ where: { id: contactId } });
  if (!contact) redirect(backUrl);
  if (!can(session, "view_all") && contact!.assigneeId !== session.id) redirect(backUrl);
  await prisma.campaignContact.update({ where: { id: contactId }, data: { nextCallAt: null } });
  await audit(session, {
    action: "appointment.clear",
    entity: "appointment",
    entityId: contactId,
    summary: `ลบวันนัดโทร (คิว #${contactId})`,
  });
  revalidatePath("/queue");
  redirect(backUrl);
}
