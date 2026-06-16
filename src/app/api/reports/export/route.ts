import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getSession, can } from "@/lib/auth";
import { getBrandSummary } from "@/lib/report";
import { audit } from "@/lib/audit";

const DAY = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function thDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export async function GET(req: NextRequest) {
  // สิทธิ์
  const session = await getSession();
  if (!session || !can(session, "reports")) {
    return new Response("ไม่มีสิทธิ์เข้าถึง", { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const fromStr = (sp.get("from") || "").trim();
  const toStr = (sp.get("to") || "").trim();

  // ตรวจรูปแบบ → ผิดตอบ 400 (ไม่ใช่ 500)
  if (!DATE_RE.test(fromStr) || !DATE_RE.test(toStr)) {
    return new Response("รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)", { status: 400 });
  }
  const from = new Date(`${fromStr}T00:00:00+07:00`);
  const toInclusive = new Date(`${toStr}T00:00:00+07:00`);
  if (isNaN(from.getTime()) || isNaN(toInclusive.getTime())) {
    return new Response("วันที่ไม่ถูกต้อง", { status: 400 });
  }
  if (from.getTime() > toInclusive.getTime()) {
    return new Response("วันที่เริ่มต้องไม่อยู่หลังวันที่จบ", { status: 400 });
  }
  const toExcl = new Date(toInclusive.getTime() + DAY);

  // ใช้ฟังก์ชันกลางตัวเดียวกับหน้าเว็บ → ตัวเลขตรงกัน 100%
  const rows = await getBrandSummary(from, toExcl);
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  await audit(session, {
    action: "export.reports",
    entity: "export",
    entityId: null,
    summary: `ส่งออกรายงานสรุป ${thDate(fromStr)} - ${thDate(toStr)} (${rows.length} เว็บ)`,
    meta: { from: fromStr, to: toStr, brands: rows.length },
  });

  const header = [
    "เว็บ",
    "โทรติดตาม",
    "รับสาย",
    "รับสาย %",
    "ไม่รับ %",
    "กลับมาฝาก/คน",
    "ยอดฝากกลับ",
    "โบนัส",
    "โบนัส/ฝาก %",
  ];

  const tot = rows.reduce(
    (a, r) => ({
      calls: a.calls + r.calls,
      answered: a.answered + r.answered,
      noAnswer: a.noAnswer + r.noAnswer,
      returnedPeople: a.returnedPeople + r.returnedPeople,
      deposit: a.deposit + r.deposit,
      bonus: a.bonus + r.bonus,
    }),
    { calls: 0, answered: 0, noAnswer: 0, returnedPeople: 0, deposit: 0, bonus: 0 }
  );

  const aoa: (string | number)[][] = [
    [`สรุปผลติดตามลูกค้า ${thDate(fromStr)} - ${thDate(toStr)}`],
    [],
    header,
    ...rows.map((r) => [
      r.name,
      r.calls,
      r.answered,
      pct(r.answered, r.calls),
      pct(r.noAnswer, r.calls),
      r.returnedPeople,
      Math.round(r.deposit),
      Math.round(r.bonus),
      pct(r.bonus, r.deposit),
    ]),
    [
      "รวมทุกเว็บ",
      tot.calls,
      tot.answered,
      pct(tot.answered, tot.calls),
      pct(tot.noAnswer, tot.calls),
      tot.returnedPeople,
      Math.round(tot.deposit),
      Math.round(tot.bonus),
      pct(tot.bonus, tot.deposit),
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 14 },
    { wch: 10 },
    { wch: 9 },
    { wch: 9 },
    { wch: 9 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "สรุปรายเว็บ");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="report_${fromStr}_${toStr}.xlsx"`,
    },
  });
}
