import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  OUTCOME_LABELS,
  DISPOSITION_LABELS,
  formatPhone,
  formatMoney,
  formatDate,
  formatDateTime,
} from "@/lib/labels";
import { toDateInputValue, bangkokDayStart } from "@/lib/dates";
import {
  recordFollowup,
  updateCall,
  deleteCall,
  addDeposit,
  updateDeposit,
  deleteDeposit,
  addBonus,
  updateBonus,
  deleteBonus,
  setDnc,
  unsetDnc,
  sendCustomerSms,
} from "./actions";

type SP = Record<string, string | string[] | undefined>;

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const user = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const saved = (Array.isArray(sp.saved) ? sp.saved[0] : sp.saved) === "1";
  const err = (Array.isArray(sp.err) ? sp.err[0] : sp.err) || "";
  const smsResult = (Array.isArray(sp.sms) ? sp.sms[0] : sp.sms) || "";
  const smsMsg = (Array.isArray(sp.smsmsg) ? sp.smsmsg[0] : sp.smsmsg) || "";
  const editParam = (Array.isArray(sp.edit) ? sp.edit[0] : sp.edit) || "";
  const [editType, editIdStr] = editParam.split("-");
  const editId = Number(editIdStr);
  const isEdit = (type: string, rid: number) => editType === type && editId === rid;
  const customerId = Number(id);
  if (!Number.isInteger(customerId)) notFound();

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      brand: true,
      deposits: { orderBy: { date: "desc" } },
      bonuses: { orderBy: { date: "desc" } },
      contacts: {
        include: {
          callLogs: {
            orderBy: { calledAt: "desc" },
            include: { caller: { select: { displayName: true } } },
          },
        },
      },
      smsLogs: { orderBy: { sentAt: "desc" }, take: 20 },
    },
  });

  if (!customer) notFound();

  // เกณฑ์การบ้าน: ต้องมีสิทธิ์ดูลูกค้า + agent (ไม่มี view_all) เปิดได้เฉพาะลูกค้าของตัวเอง
  if (!can(user, "customers")) notFound();
  if (!can(user, "view_all") && !customer.contacts.some((c) => c.assigneeId === user.id)) {
    notFound();
  }

  const smsTemplates = await prisma.smsTemplate.findMany({
    where: { active: true },
    orderBy: { id: "asc" },
  });

  const calls = customer.contacts
    .flatMap((c) => c.callLogs)
    .sort((a, b) => b.calledAt.getTime() - a.calledAt.getTime());

  const totalDeposit = customer.deposits.reduce((a, d) => a + d.amount, 0);
  const totalBonus = customer.bonuses.reduce((a, b) => a + b.amount, 0);
  const today = toDateInputValue(bangkokDayStart()); // ค่าเริ่มต้นวันที่ของฟอร์มเพิ่ม

  return (
    <>
      <p className="page-sub" style={{ marginBottom: 8 }}>
        <Link href="/customers" className="muted">
          ← กลับไปรายชื่อลูกค้า
        </Link>
      </p>
      <h1 className="page-title">
        {formatPhone(customer.phone)}{" "}
        <span className={`badge ${STATUS_COLORS[customer.status]}`}>
          {STATUS_LABELS[customer.status]}
        </span>
      </h1>
      <p className="page-sub">เว็บ {customer.brand.name}</p>

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <div className="card stat">
          <div className="label">จำนวนครั้งที่โทร</div>
          <div className="value">{calls.length}</div>
        </div>
        <div className="card stat">
          <div className="label">ยอดฝากกลับรวม</div>
          <div className="value green">{formatMoney(totalDeposit)} ฿</div>
        </div>
        <div className="card stat">
          <div className="label">โบนัสรวม</div>
          <div className="value">{formatMoney(totalBonus)} ฿</div>
        </div>
        <div className="card stat">
          <div className="label">ลงทะเบียนเมื่อ</div>
          <div className="value" style={{ fontSize: 18 }}>
            {formatDate(customer.createdAt)}
          </div>
        </div>
      </div>

      {saved && <div className="alert alert-success">บันทึกเรียบร้อยแล้ว ✅</div>}
      {err && <div className="alert alert-error">{err}</div>}
      {smsResult === "sent" && <div className="alert alert-success">ส่ง SMS เรียบร้อยแล้ว ✅</div>}
      {smsResult === "skipped" && <div className="alert alert-error">ข้ามการส่ง SMS — {smsMsg || "ยังไม่ได้เปิด/ตั้งค่า gateway (ดูเมนู 4.6 คลัง SMS)"}</div>}
      {smsResult === "failed" && <div className="alert alert-error">ส่ง SMS ไม่สำเร็จ — {smsMsg}</div>}

      {/* ข้อ 7: ห้ามโทร (DNC) */}
      {can(user, "customers") && (
        customer.status === "DO_NOT_CALL" ? (
          <div className="card" style={{ borderColor: "var(--danger, #ef4444)" }}>
            <h2 className="card-title">🚫 ลูกค้าห้ามโทร</h2>
            <p style={{ marginTop: 0 }}>
              <strong>เหตุผล:</strong> {customer.dncReason || "—"}
              {customer.dncAt && (
                <span className="muted"> · ตั้งเมื่อ {formatDateTime(customer.dncAt)}</span>
              )}
            </p>
            <p className="muted" style={{ fontSize: 13 }}>
              ลูกค้ารายนี้ถูกซ่อนจากคิวโทรและบันทึกผลสายไม่ได้ · ปลดเพื่อให้กลับมาโทรได้
            </p>
            <form action={unsetDnc}>
              <input type="hidden" name="customerId" value={customer.id} />
              <button className="btn btn-sm">✅ ปลดห้ามโทร</button>
            </form>
          </div>
        ) : (
          <div className="card" style={{ borderStyle: "dashed" }}>
            <h2 className="card-title">🚫 ตั้งเป็นห้ามโทร</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              ใช้เมื่อลูกค้าขอไม่ให้ติดต่อ/ร้องเรียน — ระบบจะซ่อนจากคิวโทร ปิดงานค้าง และล้างนัดให้อัตโนมัติ
            </p>
            <form action={setDnc} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input type="hidden" name="customerId" value={customer.id} />
              <input className="input" name="reason" placeholder="เหตุผล (จำเป็น) เช่น ลูกค้าขอไม่ให้โทร" required style={{ flex: "1 1 280px" }} />
              <button className="btn btn-sm">🚫 ตั้งห้ามโทร</button>
            </form>
          </div>
        )
      )}

      {can(user, "customers") && customer.status !== "DO_NOT_CALL" && (
        <div className="card">
          <h2 className="card-title">📝 บันทึกการติดตาม / อัปเดตสถานะ</h2>
          <form action={recordFollowup}>
            <input type="hidden" name="customerId" value={customer.id} />
            <div className="grid grid-2">
              <label className="field">
                <span className="lbl">ผลการโทร (เรียลไทม์)</span>
                <select className="input" name="outcome" defaultValue="">
                  <option value="">— ไม่บันทึกการโทร —</option>
                  {Object.entries(OUTCOME_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="lbl">สถานะ</span>
                <select className="input" name="status" defaultValue={customer.status}>
                  {Object.entries(STATUS_LABELS)
                    .filter(([k]) => k !== "DO_NOT_CALL")
                    .map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                </select>
              </label>
              <label className="field">
                <span className="lbl">ยอดฝากกลับ (บาท)</span>
                <input className="input" name="deposit" inputMode="numeric" placeholder="เช่น 500" />
                <span className="muted" style={{ fontSize: 12 }}>
                  ถ้ากรอก ระบบจะบันทึกยอดฝากและตั้งสถานะเป็น “ฝากแล้ว” อัตโนมัติ
                </span>
              </label>
              <label className="field">
                <span className="lbl">หมายเหตุ</span>
                <input className="input" name="note" placeholder="พิมพ์ข้อมูลเพิ่มเติม เช่น ลูกค้าขอคิดดูก่อน" />
              </label>
            </div>
            <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="promo" /> เสนอโปร 20%
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="sms" /> ส่ง SMS หลังโทร
              </label>
            </div>
            <button className="btn-primary">บันทึก</button>
          </form>
        </div>
      )}

      <div className="card">
        <h2 className="card-title">ประวัติการโทร ({calls.length})</h2>
        <table>
          <thead>
            <tr>
              <th>วันเวลา</th>
              <th>ผลสาย</th>
              <th>การเสนอ</th>
              <th>SMS</th>
              <th>ผู้โทร</th>
              <th>หมายเหตุ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) =>
              isEdit("call", c.id) ? (
                <tr key={c.id}>
                  <td colSpan={7}>
                    <form action={updateCall} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <input type="hidden" name="callId" value={c.id} />
                      <input type="hidden" name="customerId" value={customer.id} />
                      <select className="input" name="outcome" defaultValue={c.outcome} style={{ width: 150 }}>
                        {Object.entries(OUTCOME_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" name="promo" defaultChecked={c.disposition === "PROMO_20"} /> เสนอโปร
                      </label>
                      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" name="sms" defaultChecked={c.smsSent} /> SMS
                      </label>
                      <input className="input" name="note" defaultValue={c.note} placeholder="หมายเหตุ" style={{ flex: "1 1 160px" }} />
                      <button className="btn-primary btn-sm">บันทึก</button>
                      <Link href={`/customers/${customer.id}`} className="btn btn-sm">ยกเลิก</Link>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <td>{formatDateTime(c.calledAt)}</td>
                  <td>{OUTCOME_LABELS[c.outcome]}</td>
                  <td>{c.disposition ? DISPOSITION_LABELS[c.disposition] : "-"}</td>
                  <td>{c.smsSent ? "✅" : "-"}</td>
                  <td>{c.caller?.displayName ?? "ไม่ระบุ (นำเข้า)"}</td>
                  <td className="muted">{c.note || "-"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {can(user, "customers") && (
                      <>
                        <Link href={`/customers/${customer.id}?edit=call-${c.id}`} className="btn btn-sm">แก้ไข</Link>
                        <form action={deleteCall} style={{ display: "inline" }}>
                          <input type="hidden" name="callId" value={c.id} />
                          <input type="hidden" name="customerId" value={customer.id} />
                          <button className="btn btn-sm" style={{ marginLeft: 6 }}>ลบ</button>
                        </form>
                      </>
                    )}
                  </td>
                </tr>
              )
            )}
            {calls.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 20 }}>
                  ยังไม่มีประวัติการโทร
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2 className="card-title">ยอดฝากกลับ</h2>
          <table>
            <thead>
              <tr>
                <th>วันที่</th>
                <th className="num">ยอด (฿)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customer.deposits.map((d) =>
                isEdit("dep", d.id) ? (
                  <tr key={d.id}>
                    <td colSpan={3}>
                      <form action={updateDeposit} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input type="hidden" name="depositId" value={d.id} />
                        <input type="hidden" name="customerId" value={customer.id} />
                        <input className="input" type="date" name="date" defaultValue={toDateInputValue(d.date)} style={{ width: 150 }} />
                        <input className="input" name="amount" defaultValue={Math.round(d.amount)} inputMode="numeric" style={{ width: 110 }} />
                        <button className="btn-primary btn-sm">บันทึก</button>
                        <Link href={`/customers/${customer.id}`} className="btn btn-sm">ยกเลิก</Link>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={d.id}>
                    <td>{formatDate(d.date)}</td>
                    <td className="num">{formatMoney(d.amount)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {can(user, "customers") && (
                        <>
                          <Link href={`/customers/${customer.id}?edit=dep-${d.id}`} className="btn btn-sm">แก้</Link>
                          <form action={deleteDeposit} style={{ display: "inline" }}>
                            <input type="hidden" name="depositId" value={d.id} />
                            <input type="hidden" name="customerId" value={customer.id} />
                            <button className="btn btn-sm" style={{ marginLeft: 6 }}>ลบ</button>
                          </form>
                        </>
                      )}
                    </td>
                  </tr>
                )
              )}
              {customer.deposits.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted" style={{ textAlign: "center" }}>ไม่มีข้อมูล</td>
                </tr>
              )}
              {can(user, "customers") && (
                <tr>
                  <td colSpan={3}>
                    <form action={addDeposit} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="hidden" name="customerId" value={customer.id} />
                      <input className="input" type="date" name="date" defaultValue={today} required style={{ width: 150 }} />
                      <input className="input" name="amount" placeholder="ยอด (บาท)" inputMode="numeric" required style={{ width: 120 }} />
                      <button className="btn-primary btn-sm">+ เพิ่มยอดฝาก</button>
                    </form>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2 className="card-title">โบนัสที่เติม</h2>
          <table>
            <thead>
              <tr>
                <th>วันที่</th>
                <th className="num">ยอด (฿)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customer.bonuses.map((b) =>
                isEdit("bon", b.id) ? (
                  <tr key={b.id}>
                    <td colSpan={3}>
                      <form action={updateBonus} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input type="hidden" name="bonusId" value={b.id} />
                        <input type="hidden" name="customerId" value={customer.id} />
                        <input className="input" type="date" name="date" defaultValue={toDateInputValue(b.date)} style={{ width: 150 }} />
                        <input className="input" name="amount" defaultValue={Math.round(b.amount)} inputMode="numeric" style={{ width: 110 }} />
                        <button className="btn-primary btn-sm">บันทึก</button>
                        <Link href={`/customers/${customer.id}`} className="btn btn-sm">ยกเลิก</Link>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={b.id}>
                    <td>{formatDate(b.date)}</td>
                    <td className="num">{formatMoney(b.amount)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {can(user, "customers") && (
                        <>
                          <Link href={`/customers/${customer.id}?edit=bon-${b.id}`} className="btn btn-sm">แก้</Link>
                          <form action={deleteBonus} style={{ display: "inline" }}>
                            <input type="hidden" name="bonusId" value={b.id} />
                            <input type="hidden" name="customerId" value={customer.id} />
                            <button className="btn btn-sm" style={{ marginLeft: 6 }}>ลบ</button>
                          </form>
                        </>
                      )}
                    </td>
                  </tr>
                )
              )}
              {customer.bonuses.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted" style={{ textAlign: "center" }}>ไม่มีข้อมูล</td>
                </tr>
              )}
              {can(user, "customers") && (
                <tr>
                  <td colSpan={3}>
                    <form action={addBonus} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="hidden" name="customerId" value={customer.id} />
                      <input className="input" type="date" name="date" defaultValue={today} required style={{ width: 150 }} />
                      <input className="input" name="amount" placeholder="ยอด (บาท)" inputMode="numeric" required style={{ width: 120 }} />
                      <button className="btn-primary btn-sm">+ เพิ่มโบนัส</button>
                    </form>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ข้อ 11: ส่ง SMS + ประวัติ */}
      {can(user, "customers") && (
        <div className="card">
          <h2 className="card-title">📱 ส่ง SMS — {formatPhone(customer.phone)}</h2>
          {smsTemplates.length === 0 && (
            <p className="muted" style={{ marginTop: 0 }}>
              ยังไม่มีเทมเพลต — เพิ่มได้ที่เมนู <strong>4.6 คลัง SMS</strong> · จะพิมพ์ข้อความเองด้านขวาก็ได้
            </p>
          )}
          <div className="grid grid-2">
            <form action={sendCustomerSms}>
              <input type="hidden" name="customerId" value={customer.id} />
              <label className="field">
                <span className="lbl">ส่งจากเทมเพลต</span>
                <select className="input" name="templateId" defaultValue="" required>
                  <option value="">— เลือกเทมเพลต —</option>
                  {smsTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
              <button className="btn-primary btn-sm">ส่งตามเทมเพลต</button>
            </form>
            <form action={sendCustomerSms}>
              <input type="hidden" name="customerId" value={customer.id} />
              <label className="field">
                <span className="lbl">หรือพิมพ์ข้อความเอง (ใช้ {"{brand}"} ได้)</span>
                <input className="input" name="body" placeholder="พิมพ์ข้อความ..." required />
              </label>
              <button className="btn btn-sm">ส่งข้อความนี้</button>
            </form>
          </div>

          <h3 style={{ fontSize: 15, margin: "16px 0 8px" }}>ประวัติ SMS ({customer.smsLogs.length})</h3>
          <table>
            <thead>
              <tr>
                <th style={{ width: 150 }}>วันเวลา</th>
                <th>ข้อความ</th>
                <th style={{ width: 90 }}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {customer.smsLogs.map((s) => (
                <tr key={s.id}>
                  <td className="muted" style={{ fontSize: 13 }}>{formatDateTime(s.sentAt)}</td>
                  <td>{s.body}</td>
                  <td>
                    <span className={`badge ${s.status === "SENT" ? "badge-green" : s.status === "FAILED" ? "badge-red" : "badge-gray"}`}>
                      {s.status === "SENT" ? "ส่งแล้ว" : s.status === "FAILED" ? "ล้มเหลว" : "ข้าม"}
                    </span>
                  </td>
                </tr>
              ))}
              {customer.smsLogs.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted" style={{ textAlign: "center", padding: 16 }}>ยังไม่เคยส่ง SMS</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
