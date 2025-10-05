// src/common/StageShell.jsx
import { Canvas } from "@react-three/fiber";
import { PointerLockControls, Environment } from "@react-three/drei";
import { useSim } from "./SimContext";
import { useCallback } from "react";

export default function StageShell({
  camera,
  envPreset = "warehouse",
  children,
  title,
  hudExtra,
}) {
  const { locked, setLocked } = useSim();

  // 🔹 클릭 시 PointerLockControls 강제 활성화
  const handleStart = useCallback(() => {
    const canvas = document.querySelector("canvas");
    if (canvas) {
      canvas.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        overflow: "hidden",
      }}
    >
      {/* 🔹 안내 오버레이 */}
      {!locked && (
        <div
          onClick={handleStart}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            background: "rgba(0,0,0,0.75)",
            color: "#fff",
            fontSize: "1rem",
            padding: "14px 24px",
            borderRadius: 12,
            cursor: "pointer",
            zIndex: 20,
            userSelect: "none",
            textAlign: "center",
            whiteSpace: "pre-line",
          }}
        >
          CLICK TO START{"\n"}(WASD / Space·Shift / E·R)
        </div>
      )}

      {/* 🔹 HUD / 제목 */}
      {title && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 16,
            color: "#fff",
            zIndex: 15,
          }}
        >
          {title}
        </div>
      )}

      {/* 🔹 추가 HUD (오른쪽 상단 등) */}
      {hudExtra && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 16,
            color: "#fff",
            zIndex: 15,
          }}
        >
          {hudExtra}
        </div>
      )}

      {/* 🔹 실제 3D 씬 */}
      <Canvas
        camera={camera}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
      >
        {children}
        <Environment preset={envPreset} />
        <PointerLockControls
          onLock={() => setLocked(true)}
          onUnlock={() => setLocked(false)}
        />
      </Canvas>
    </div>
  );
}
