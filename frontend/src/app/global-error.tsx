"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="fa" dir="rtl">
      <body style={{ background: "#f5f1e8", color: "#20221f", fontFamily: "Tahoma, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <main style={{ textAlign: "center", padding: 24 }}>
          <h1>مشکلی پیش آمد.</h1>
          <p>سرویس فروشگاه موقتاً در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید.</p>
          <button type="button" onClick={reset} style={{ marginTop: 16, padding: "10px 20px", background: "#20221f", color: "#f5f1e8", border: 0 }}>
            تلاش دوباره
          </button>
        </main>
      </body>
    </html>
  );
}
