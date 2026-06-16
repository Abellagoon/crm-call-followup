import { formatMoney } from "@/lib/labels";

type Datum = { label: string; value: number };

export default function BarChart({
  data,
  color = "var(--primary)",
  suffix = "",
}: {
  data: Datum[];
  color?: string;
  suffix?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.map((d) => (
        <div key={d.label} style={{ display: "grid", gridTemplateColumns: "90px 1fr 80px", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "var(--muted)", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {d.label}
          </span>
          <div style={{ background: "#eef2f7", borderRadius: 6, height: 22, overflow: "hidden" }}>
            <div
              style={{
                width: `${(d.value / max) * 100}%`,
                background: color,
                height: "100%",
                borderRadius: 6,
                minWidth: d.value > 0 ? 4 : 0,
                transition: "width .3s",
              }}
            />
          </div>
          <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>
            {formatMoney(d.value)}
            {suffix}
          </span>
        </div>
      ))}
    </div>
  );
}
