export default function Page() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f9fafb",
        padding: 16,
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: "100%",
          background: "#ffffff",
          borderRadius: 12,
          padding: 24,
          textAlign: "center",
          boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
          Thông báo hệ thống
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>
          Hệ thống báo chí đang được bảo trì.
          <br />
          Vui lòng quay lại sau.
        </p>

        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 20 }}>
          Xin lỗi vì sự bất tiện này.
        </p>
      </div>
    </main>
  );
}
