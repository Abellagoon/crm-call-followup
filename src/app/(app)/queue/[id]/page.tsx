import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  OUTCOME_LABELS,
  formatPhone,
  formatDateTime,
} from "@/lib/labels";
import LogCallForm from "../LogCallForm";

export default async function QueueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const contactId = Number(id);
  if (!Number.isInteger(contactId)) notFound();

  const contact = await prisma.campaignContact.findUnique({
    where: { id: contactId },
    include: {
      customer: { include: { brand: true } },
      callLogs: {
        orderBy: { calledAt: "desc" },
        include: { caller: { select: { displayName: true } } },
      },
    },
  });
  if (!contact) notFound();

  // ผู้ที่ไม่มีสิทธิ์ดูงานทุกคน เปิดได้เฉพาะงานของตัวเอง
  if (!can(session, "view_all") && contact.assigneeId !== session.id) {
    redirect("/queue");
  }

  const overdue = contact.nextCallAt && contact.nextCallAt.getTime() < Date.now();

  return (
    <>
      <p className="page-sub" style={{ marginBottom: 8 }}>
        <Link href="/queue" className="muted">
          ← กลับไปคิวโทร
        </Link>
      </p>
      <h1 className="page-title">
        บันทึกผลสาย — {formatPhone(contact.customer.phone)}{" "}
        <span className={`badge ${STATUS_COLORS[contact.customer.status]}`}>
          {STATUS_LABELS[contact.customer.status]}
        </span>
      </h1>
      <p className="page-sub">
        เว็บ {contact.customer.brand.name} ·{" "}
        <Link href={`/customers/${contact.customerId}`} className="muted">
          ดูประวัติลูกค้าทั้งหมด
        </Link>
      </p>

      {contact.nextCallAt && (
        <div className={`alert ${overdue ? "alert-error" : "alert-success"}`}>
          {overdue ? "⏰ เลยนัดแล้ว" : "📅 มีนัดโทร"}: {formatDateTime(contact.nextCallAt)}
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h2 className="card-title">บันทึกผลการโทร</h2>
          <LogCallForm contactId={contact.id} />
        </div>

        <div className="card">
          <h2 className="card-title">ประวัติการโทรล่าสุด ({contact.callLogs.length})</h2>
          <table>
            <thead>
              <tr>
                <th>วันเวลา</th>
                <th>ผลสาย</th>
                <th>ผู้โทร</th>
              </tr>
            </thead>
            <tbody>
              {contact.callLogs.slice(0, 10).map((c) => (
                <tr key={c.id}>
                  <td>{formatDateTime(c.calledAt)}</td>
                  <td>{OUTCOME_LABELS[c.outcome]}</td>
                  <td>{c.caller?.displayName ?? "ไม่ระบุ"}</td>
                </tr>
              ))}
              {contact.callLogs.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted" style={{ textAlign: "center", padding: 16 }}>
                    ยังไม่เคยโทร
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
