import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { getSession, can } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { STATUS_LABELS } from "@/lib/labels";
import type { Prisma } from "@prisma/client";

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !can(session, "customers_export")) {
    return new Response("ไม่มีสิทธิ์เข้าถึง", { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim();
  const brandId = sp.get("brand") || "";
  const status = sp.get("status") || "";
  const format = sp.get("format") === "xlsx" ? "xlsx" : "csv";

  const where: Prisma.CustomerWhereInput = {};
  if (q) where.phone = { contains: q.replace(/\D/g, "") };
  if (brandId) where.brandId = Number(brandId);
  if (status) where.status = status;

  const customers = await prisma.customer.findMany({
    where,
    include: {
      brand: true,
      deposits: { select: { amount: true } },
      bonuses: { select: { amount: true } },
      contacts: { select: { callLogs: { select: { id: true } } } },
    },
    orderBy: { id: "asc" },
  });

  const headers = [
    "เบอร์โทร",
    "เว็บ",
    "สถานะ",
    "จำนวนครั้งที่โทร",
    "ยอดฝากหลังติดตามรวม",
    "โบนัสรวม",
  ];

  const records = customers.map((c) => {
    const calls = c.contacts.reduce((a, ct) => a + ct.callLogs.length, 0);
    const deposit = c.deposits.reduce((a, d) => a + d.amount, 0);
    const bonus = c.bonuses.reduce((a, b) => a + b.amount, 0);
    return {
      phone: c.phone,
      brand: c.brand.name,
      status: STATUS_LABELS[c.status] ?? c.status,
      calls,
      deposit: Math.round(deposit),
      bonus: Math.round(bonus),
    };
  });

  await audit(session, {
    action: "export.customers",
    entity: "export",
    entityId: null,
    summary: `ส่งออกข้อมูลลูกค้า ${records.length} ราย (${format.toUpperCase()})`,
    meta: { count: records.length, format, filter: { q, brandId, status } },
  });

  if (format === "xlsx") {
    const aoa = [
      headers,
      ...records.map((r) => [r.phone, r.brand, r.status, r.calls, r.deposit, r.bonus]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // คอลัมน์เบอร์เป็นข้อความ กันเลข 0 หาย
    for (let i = 0; i < records.length; i++) {
      const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: 0 })];
      if (cell) cell.t = "s";
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ลูกค้า");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new Response(buf, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="customers.xlsx"',
      },
    });
  }

  // CSV (UTF-8 BOM + กันเลข 0 หน้าเบอร์)
  const lines = [headers.map(csvCell).join(",")];
  for (const r of records) {
    lines.push(
      [`="${r.phone}"`, r.brand, r.status, String(r.calls), String(r.deposit), String(r.bonus)]
        .map(csvCell)
        .join(",")
    );
  }
  const csv = "﻿" + lines.join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="customers.csv"',
    },
  });
}
