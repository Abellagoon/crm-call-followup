import { NextRequest, NextResponse } from "next/server";
import { getSession, can } from "@/lib/auth";
import { importMonthlyWorkbook } from "@/lib/import-crm-core";
import { audit } from "@/lib/audit";

export const maxDuration = 300;

const PERIOD_RE = /^\d{4}-\d{2}$/;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !can(session, "import")) {
    return new Response("ไม่มีสิทธิ์เข้าถึง", { status: 403 });
  }

  const back = (params: string) =>
    NextResponse.redirect(new URL(`/admin/import?${params}`, req.url), 303);

  try {
    const form = await req.formData();
    const file = form.get("file");
    const period = String(form.get("period") || "").trim();

    if (!(file instanceof File) || file.size === 0) {
      return back("err=" + encodeURIComponent("กรุณาเลือกไฟล์ Excel (.xlsx)"));
    }
    if (!PERIOD_RE.test(period)) {
      return back("err=" + encodeURIComponent("กรุณาเลือกเดือนของข้อมูล"));
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const r = await importMonthlyWorkbook(buffer, period, { fileName: file.name });

    await audit(session, {
      action: "import.excel",
      entity: "import",
      entityId: period,
      summary: `นำเข้า Excel เดือน ${period} (${file.name}) — ลูกค้า ${r.customers} (ใหม่ ${r.customersNew}) · โทร ${r.calls} · ฝาก ${r.deposits} · โบนัส ${r.bonuses}`,
      meta: { period, fileName: file.name, ...r },
    });

    return back(
      "ok=1&msg=" +
        encodeURIComponent(
          `นำเข้าเดือน ${period} สำเร็จ — ลูกค้า ${r.customers} (ใหม่ ${r.customersNew}) · โทร ${r.calls} · ฝาก ${r.deposits} · โบนัส ${r.bonuses}`
        )
    );
  } catch (e) {
    return back(
      "err=" + encodeURIComponent("นำเข้าไม่สำเร็จ: " + (e instanceof Error ? e.message : String(e)))
    );
  }
}
