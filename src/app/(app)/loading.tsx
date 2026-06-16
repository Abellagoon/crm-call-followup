// Skeleton ตอนสลับหน้า (พรีเมียมมินิมอล) — Next แสดงระหว่างโหลดหน้า
export default function Loading() {
  return (
    <>
      <div className="skeleton sk-line" style={{ width: 220, height: 24, marginBottom: 6 }} />
      <div className="skeleton sk-line" style={{ width: 320 }} />

      <div className="grid grid-4" style={{ marginTop: 18, marginBottom: 18 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card">
            <div className="skeleton sk-line" style={{ width: "55%" }} />
            <div className="skeleton sk-line" style={{ width: "40%", height: 24 }} />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="skeleton sk-line" style={{ width: 180, marginBottom: 14 }} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton sk-row" />
        ))}
      </div>
    </>
  );
}
