import { useSim } from "./SimContext";
export default function HUD({ title = "HUD", extra }) {
  const { ballast, posRef, stageText, neutralTimer } = useSim();
  const p = posRef.current;
  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        left: 20,
        zIndex: 10,
        color: "#fff",
        fontFamily: "monospace",
        background: "rgba(0,0,0,0.5)",
        padding: "10px 14px",
        borderRadius: 10,
        minWidth: 260,
      }}
    >
      <h3 style={{ margin: "0 0 6px" }}>{title}</h3>
      {stageText && <div style={{ marginBottom: 8 }}>{stageText}</div>}
      <div style={{ lineHeight: "1.2em" }}>
        <div>X: {Number(p.x || 0).toFixed(2)}</div>
        <div>Y: {Number(p.y || 0).toFixed(2)}</div>
        <div>Z: {Number(p.z || 0).toFixed(2)}</div>
        <div>Ballast: {ballast}</div>
        <div>🕒 Neutral Timer: {neutralTimer.toFixed(2)} s</div>
      </div>
      {extra}
    </div>
  );
}
//
