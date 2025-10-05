import React, { useEffect, useRef, useState } from "react";

export default function MonologueBuzz({ onDone, duration = 9000, topText = "Going to the space station..." }) {
  const [phase, setPhase] = useState(0);
  const timer = useRef(null);
  const skip = () => {
    if (timer.current) clearTimeout(timer.current);
    onDone && onDone();
  };

  useEffect(() => {
    const onKey = () => skip();
    const onClick = () => skip();
    window.addEventListener("keydown", onKey, { once: true });
    window.addEventListener("mousedown", onClick, { once: true });
    timer.current = setTimeout(() => setPhase(1), 2800);
    const t2 = setTimeout(() => setPhase(2), 5600);
    const t3 = setTimeout(() => skip(), duration);
    return () => {
      clearTimeout(timer.current);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener("keydown", onKey, { once: true });
      window.removeEventListener("mousedown", onClick, { once: true });
    };
  }, [onDone, duration]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000",
        color: "#e8eaed",
        fontFamily:
          "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Apple SD Gothic Neo, Noto Sans, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "8px 14px",
          fontSize: 16,
          letterSpacing: 0.6,
          opacity: 0.9,
          borderRadius: 999,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          animation: "blink 1.6s infinite",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {topText}
      </div>

      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          padding: 0,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: "100%",
            background:
              "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(10,12,16,0.7) 20%, rgba(10,12,16,0.9) 60%, rgba(10,12,16,1) 100%)",
            paddingTop: 32,
          }}
        />
        <div
          style={{
            width: "100%",
            background: "#0a0c10",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 -8px 24px rgba(0,0,0,0.6)",
            padding: "22px 24px",
          }}
        >
          <div
            style={{
              maxWidth: 1100,
              margin: "0 auto",
              width: "calc(100% - 24px)",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: "22px 20px",
              lineHeight: 1.7,
              pointerEvents: "auto",
            }}
          >
            <div
              style={{
                fontSize: 20,
                opacity: phase >= 0 ? 1 : 0,
                transition: "opacity 600ms ease",
              }}
            >
              Buzz Joe: “All those endless drills, the sleepless nights, the silence of isolation—every moment led me here.”
            </div>
            <div style={{ height: 10 }} />
            <div
              style={{
                fontSize: 20,
                opacity: phase >= 1 ? 1 : 0,
                transition: "opacity 600ms ease",
              }}
            >
              “Through the window, the Earth looks like a dream. My hands are shaking. But it’s not fear.”
            </div>
            <div style={{ height: 10 }} />
            <div
              style={{
                fontSize: 20,
                opacity: phase >= 2 ? 1 : 0,
                transition: "opacity 600ms ease",
              }}
            >
              “Soon, I will reach the place where I will achieve my dream. That is Cupola.”
            </div>
            <div style={{ marginTop: 16, fontSize: 13, opacity: 0.65, textAlign: "right" }}>
              Press any key or click to continue
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%, 50%, 100% { opacity: .9 } 25%, 75% { opacity: .35 } }
        @media (max-width: 768px) {
          div[style*="border-radius: 12px"] { padding: 18px 16px }
        }
      `}</style>
    </div>
  );
}
