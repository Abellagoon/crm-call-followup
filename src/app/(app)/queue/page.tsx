import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import { bangkokDayEnd, toDateTimeInputValue } from "@/lib/dates";
import {
  OUTCOME_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  formatPhone,
  formatDateTime,
} from "@/lib/labels";

import { clearAppointment, updateAppointment } from "./actions";
import NoAccess from "../NoAccess";

const PAGE_SIZE = 12;

type SP = Record<string, string | string[] | undefined>;
function val(sp: SP, key: string): string {
  const v = sp[key];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requireSession();
  if (!can(user, "queue")) return <NoAccess />;
  const sp = await searchParams;

  const tab = val(sp, "tab") === "due" ? "due" : "all";
  const q = val(sp, "q").trim();
  const outcome = val(sp, "outcome");
  const count = val(sp, "count");
  const all = val(sp, "all") === "1" && can(user, "view_all");
  const page = Math.max(1, Number(val(sp, "page")) || 1);
  const saved = val(sp, "saved") === "1";

  const contacts = await prisma.campaignContact.findMany({
    where: {
      status: "PENDING",
      customer: { status: { not: "DO_NOT_CALL" } },
      ...(all ? {} : { assigneeId: user.id }),
    },
    include: {
      customer: { include: { brand: true } },
      assignee: { select: { displayName: true } },
      callLogs: { orderBy: { calledAt: "desc" } },
    },
    orderBy: { createdAt: "asc" },
  });

  const now = Date.now();
  const dueEnd = bangkokDayEnd().getTime();

  let rows = contacts.map((c) => ({
    id: c.id,
    customerId: c.customerId,
    phone: c.customer.phone,
    brand: c.customer.brand.name,
    status: c.customer.status,
    assignee: c.assignee?.displayName ?? "—",
    callCount: c.callLogs.length,
    lastOutcome: c.callLogs[0]?.outcome ?? null,
    nextCallAt: c.nextCallAt,
  }));

  // นับจำนวนนัดทั้งหมด (รายการที่มีวันนัดบันทึกไว้) สำหรับ badge บนแท็บ
  const apptCount = rows.filter((r) => r.nextCallAt).length;

  if (tab === "due") {
    // คิวนัดโทร = ทุกรายการที่มีวันนัด เรียงจากวันนัดก่อน → หลัง
    rows = rows
      .filter((r) => r.nextCallAt)
      .sort((a, b) => a.nextCallAt!.getTime() - b.nextCallAt!.getTime());
  }

  if (q) rows = rows.filter((r) => r.phone.replace(/\D/g, "").includes(q.replace(/\D/g, "")));
  if (outcome) rows = rows.filter((r) => r.lastOutcome === outcome);
  if (count === "0") rows = rows.filter((r) => r.callCount === 0);
  else if (count === "1") rows = rows.filter((r) => r.callCount === 1);
  else if (count === "2") rows = rows.filter((r) => r.callCount === 2);
  else if (count === "3+") rows = rows.filter((r) => r.callCount >= 3);

  const total = rows.length;
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams();
    if (tab === "due") p.set("tab", "due");
    if (q) p.set("q", q);
    if (outcome) p.set("outcome", outcome);
    if (count) p.set("count", count);
    if (all) p.set("all", "1");
    for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
    return `/queue?${p.toString()}`;
  };

  // url สำหรับ redirect กลับหลังแก้/ลบนัด (คงตัวกรอง + หน้าปัจจุบัน)
  const backUrl = qs({ page });

  const tabLink = (t: "all" | "due") => {
    const p = new URLSearchParams();
    if (t === "due") p.set("tab", "due");
    if (all) p.set("all", "1");
    return `/queue?${p.toString()}`;
  };

  return (
    <>
      <h1 className="page-title">คิวโทร</h1>
      <p className="page-sub">
        รายการลูกค้าที่ต้องโทรติดตาม {all ? "(ของทุกคน)" : "(ของฉัน)"}
      </p>

      {saved && <div className="alert alert-success">บันทึกผลสายเรียบร้อยแล้ว ✅</div>}

      <div className="pill-row">
        <Link href={tabLink("all")} className={`pill ${tab === "all" ? "active" : ""}`}>
          ทั้งคิว
        </Link>
        <Link href={tabLink("due")} className={`pill ${tab === "due" ? "active" : ""}`}>
          📅 คิวนัดโทร {apptCount > 0 ? `(${apptCount})` : ""}
        </Link>
      </div>

      {(can(user, "import") || (can(user, "view_all") && !all)) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {can(user, "view_all") && !all && (
            <Link href={tab === "due" ? "/queue?tab=due&all=1" : "/queue?all=1"} className="btn btn-sm">
              👥 ดูคิวของทุกคน
            </Link>
          )}
          {can(user, "import") && (
            <Link href="/admin/import" className="btn btn-sm">
              📥 นำเข้าข้อมูลจาก Excel/Sheet
            </Link>
          )}
        </div>
      )}

      <form className="card toolbar" method="get">
        {tab === "due" && <input type="hidden" name="tab" value="due" />}
        <label className="field" style={{ flex: "1 1 160px" }}>
          <span className="lbl">ค้นหาเบอร์</span>
          <input className="input" name="q" defaultValue={q} placeholder="เช่น 0891" />
        </label>
        <label className="field">
          <span className="lbl">ผลสายล่าสุด</span>
          <select className="input" name="outcome" defaultValue={outcome}>
            <option value="">ทั้งหมด</option>
            {Object.entries(OUTCOME_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="lbl">จำนวนครั้งที่โทร</span>
          <select className="input" name="count" defaultValue={count}>
            <option value="">ทั้งหมด</option>
            <option value="0">ยังไม่เคยโทร</option>
            <option value="1">1 ครั้ง</option>
            <option value="2">2 ครั้ง</option>
            <option value="3+">3 ครั้งขึ้นไป</option>
          </select>
        </label>
        {can(user, "view_all") && (
          <label className="field">
            <span className="lbl">ขอบเขต</span>
            <select className="input" name="all" defaultValue={all ? "1" : ""}>
              <option value="">เฉพาะของฉัน</option>
              <option value="1">ดูของทุกคน</option>
            </select>
          </label>
        )}
        <button className="btn-primary">กรอง</button>
        <Link href={tabLink(tab)} className="btn">ล้าง</Link>
      </form>

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          ทั้งหมด {total} รายการ
        </p>
        <table>
          <thead>
            <tr>
              <th>เบอร์โทร</th>
              <th>เว็บ</th>
              <th>สถานะ</th>
              <th>ผู้รับผิดชอบ</th>
              <th className="num">โทรแล้ว</th>
              <th>ผลล่าสุด</th>
              <th>นัดโทร</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const isOverdue = r.nextCallAt && r.nextCallAt.getTime() < now;
              return (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>
                    <Link href={`/customers/${r.customerId}`} style={{ color: "var(--primary)" }}>
                      {formatPhone(r.phone)}
                    </Link>
                  </td>
                  <td>{r.brand}</td>
                  <td>
                    <span className={`badge ${STATUS_COLORS[r.status]}`}>
                      {STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td>{r.assignee}</td>
                  <td className="num">{r.callCount}</td>
                  <td>
                    {r.lastOutcome ? (
                      OUTCOME_LABELS[r.lastOutcome]
                    ) : (
                      <span className="muted">ยังไม่โทร</span>
                    )}
                  </td>
                  <td>
                    {r.nextCallAt ? (
                      <span className={`badge ${isOverdue ? "badge-red" : "badge-yellow"}`}>
                        {isOverdue ? "เลยนัด" : "นัดวันนี้"} · {formatDateTime(r.nextCallAt)}
                      </span>
                    ) : (
                      <span className="muted">-</span>
                    )}
                    <details className="appt-edit" style={{ marginTop: 6 }}>
                      <summary
                        className="muted"
                        style={{ cursor: "pointer", fontSize: ".82rem" }}
                      >
                        {r.nextCallAt ? "📅 แก้นัด" : "📅 ตั้งนัด"}
                      </summary>
                      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <form action={updateAppointment} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input type="hidden" name="contactId" value={r.id} />
                          <input type="hidden" name="back" value={backUrl} />
                          <input
                            className="input"
                            type="datetime-local"
                            name="nextCall"
                            required
                            defaultValue={r.nextCallAt ? toDateTimeInputValue(r.nextCallAt) : ""}
                            style={{ width: "auto" }}
                          />
                          <button className="btn btn-sm btn-primary">บันทึก</button>
                        </form>
                        {r.nextCallAt && (
                          <form action={clearAppointment}>
                            <input type="hidden" name="contactId" value={r.id} />
                            <input type="hidden" name="back" value={backUrl} />
                            <button className="btn btn-sm">ลบนัด</button>
                          </form>
                        )}
                      </div>
                    </details>
                  </td>
                  <td>
                    <Link href={`/queue/${r.id}`} className="btn btn-sm btn-primary">
                      บันทึกผล
                    </Link>
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  ไม่มีรายการในคิว
                  {can(user, "view_all") && !all && (
                    <div style={{ marginTop: 8 }}>
                      👉 ข้อมูลอาจอยู่ในคิวของพนักงานคนอื่น — ลองกด{" "}
                      <Link href={tab === "due" ? "/queue?tab=due&all=1" : "/queue?all=1"} style={{ color: "var(--primary)" }}>
                        “ดูคิวของทุกคน”
                      </Link>
                    </div>
                  )}
                  {can(user, "import") && (
                    <div style={{ marginTop: 6 }}>
                      หรือ{" "}
                      <Link href="/admin/import" style={{ color: "var(--primary)" }}>
                        นำเข้าข้อมูลจาก Excel/Sheet
                      </Link>
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
            {page > 1 && (
              <Link className="btn btn-sm" href={qs({ page: page - 1 })}>
                ← ก่อนหน้า
              </Link>
            )}
            <span className="muted">
              หน้า {page} / {totalPages}
            </span>
            {page < totalPages && (
              <Link className="btn btn-sm" href={qs({ page: page + 1 })}>
                ถัดไป →
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  );
}
