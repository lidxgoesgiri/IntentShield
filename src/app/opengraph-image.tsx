import { ImageResponse } from "next/og";

export const alt = "IntentShield — Know what you sign.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social preview rendered from the brand mark + tagline (no external assets). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "radial-gradient(circle at 78% 40%, rgba(100,232,199,0.16), rgba(8,13,16,1) 55%)",
          backgroundColor: "#080d10",
          color: "#f3f7f5",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <svg width="72" height="72" viewBox="0 0 100 100">
            <g fill="none" stroke="#64e8c7" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 57 C16 46 15.5 33 17 21.5 C30 19.5 40.5 15.5 50 9 C59.5 15.5 70 19.5 83 21.5 C84 26 84.3 29.5 84.3 33.5" />
              <path d="M84.6 40 C83.6 62 71 80 50 92" />
              <path d="M84.3 36.6 C68.5 40.5 57.5 50.5 50 64 C46.5 56.5 41.5 50.5 35 50.5 C28 50.5 23.8 56 24.8 62.5 C26.6 72.5 37.5 84 50 92" />
            </g>
          </svg>
          <div style={{ display: "flex", fontSize: 34, letterSpacing: "0.18em" }}>
            <span>INTENT</span>
            <span style={{ color: "#64e8c7", fontWeight: 700 }}>SHIELD</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ fontSize: 104, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1 }}>Know what you sign.</div>
          <div style={{ fontSize: 30, color: "#d7e2df" }}>
            Plain-language Solana Devnet transfers, verified against the exact message before your wallet signs.
          </div>
        </div>
        <div style={{ fontSize: 22, color: "#9fb7ae", letterSpacing: "0.12em" }}>SOLANA DEVNET · NON-CUSTODIAL · DETERMINISTIC CHECKS</div>
      </div>
    ),
    size,
  );
}
