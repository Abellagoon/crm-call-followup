import "server-only";
import { prisma } from "@/lib/db";

// ผู้ทำ — รับเฉพาะ field ที่ต้องใช้ (ทุก action มี session object อยู่แล้ว)
type Actor = { id: number; displayName: string } | null | undefined;

type AuditEntry = {
  action: string; // เช่น "user.role", "call.delete"
  entity: string; // เช่น "user", "deposit"
  entityId?: string | number | null;
  summary: string; // ข้อความไทยอ่านง่าย
  meta?: unknown; // ค่าเดิม/ใหม่ ฯลฯ (จะถูก JSON.stringify)
};

// บันทึก audit log — ออกแบบให้ "ไม่มีวัน throw" เพื่อไม่ให้ทำ action หลักพัง
export async function audit(actor: Actor, entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor?.id ?? null,
        actorName: actor?.displayName ?? "ระบบ",
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId != null ? String(entry.entityId) : null,
        summary: entry.summary,
        meta: entry.meta !== undefined ? JSON.stringify(entry.meta) : null,
      },
    });
  } catch (e) {
    // log ลง console เฉยๆ — ห้ามทำให้ action ที่เรียกล้มเหลว
    console.error("[audit] บันทึกไม่สำเร็จ:", e);
  }
}
