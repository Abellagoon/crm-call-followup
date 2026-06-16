import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSession, can } from "@/lib/auth";
import NoAccess from "../../NoAccess";
import { formatPhone, formatDateTime } from "@/lib/labels";
import { unsetDnc } from "../[id]/actions";

type SP = Record<string, string | string[] | undefined>;
function val(sp: SP, k: string): string {
  const v = sp[k];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function DncListPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requireSession();
  if (!can(user, "customers")) return <NoAccess />;
  const sp = await searchParams;
  const q = val(sp, "q").trim();

  const customers = await prisma.customer.findMany({
    where: {
      status: "DO_NOT_CALL",
      ...(q ? { phone: { contains: q.replace(/\D/g, "") } } : {}),
    },
    include: { brand: { select: { name: true } } },
    orderBy: { dncAt: "desc" },
  });

  return (
    <>
      <h1 className="page-title">รายชื่อห้ามโทร (DNC)</h1>
      <p className="page-sub">ลูกค้าที่ถูกตั้งห้ามโทร — ถูกซ่อนจากคิวโทรและบันทึกผลสายไม่ได้</p>

      <form className="card toolbar" method="get">
        <label className="field" style={{ flex: "1 1 200px" }}>
          <span className="lbl">ค้นหาเบอร์</span>
          <input className="input" name="q" defaultValue={q} placeholder="เช่น 0891" />
        </label>
        <button className="btn-primary">ค้นหา</button>
        {q && <Link href="/customers/dnc" className="btn">ล้าง</Link>}
      </form>

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>ทั้งหมด {customers.length.toLocaleString()} ราย</p>
        <table>
          <thead>
            <tr>
              <th>เบอร์โทร</th>
              <th>เว็บ</th>
              <th>เหตุผล</th>
              <th>ตั้งเมื่อ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>
                  <Link href={`/customers/${c.id}`} style={{ color: "var(--primary)" }}>
                    {formatPhone(c.phone)}
                  </Link>
                </td>
                <td>{c.brand.name}</td>
                <td className="muted">{c.dncReason || "—"}</td>
                <td className="muted" style={{ fontSize: 13 }}>
                  {c.dncAt ? formatDateTime(c.dncAt) : "—"}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <form action={unsetDnc} style={{ display: "inline" }}>
                    <input type="hidden" name="customerId" value={c.id} />
                    <input type="hidden" name="back" value="/customers/dnc" />
                    <button className="btn btn-sm">✅ ปลดห้ามโทร</button>
                  </form>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  ไม่มีลูกค้าห้ามโทร
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
