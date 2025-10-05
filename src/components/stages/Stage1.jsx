// src/components/stages/Stage.jsx
import React, {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SimProvider, useSim } from "../../common/SimContext";
import StageShell from "../../common/StageShell";
import HUD from "../../common/HUD";
import useHydroMovementReal from "../../physics/useHydroMovementReal";
import useVerticalHydroReal from "../../physics/useVerticalHydroReal";
import { HYDRO_CONFIG } from "../../physics/hydroConfig";
import { autoGenerateLights } from "../../assets/AutoLightGenarator.js";
import { WaterController } from "../../assets/WaterShade.js";

useGLTF.preload("/pool.glb");

const SPAWN_POS = new THREE.Vector3(-1.02, 1.75, 15.06);
const PLAYER_HEIGHT = 1.75;
const PLAYER_RADIUS = 0.38;
const HEAD_OFFSET = PLAYER_HEIGHT * 0.5;

const CAM_MIN_Y = 1.75; // ✅ 카메라(머리) 최소 높이
const PAD = 0.01; // 경계 떨림 방지

function isColliderNode(o) {
  const n = (o.name || "").toLowerCase();
  return (
    n.includes("collision") ||
    n.includes("collider") ||
    n.startsWith("col_") ||
    o.userData?.collider === true
  );
}

// 'spaceship' 충돌 대상 탐지(이름/머티리얼/유저데이터)
function isSpaceshipNode(o) {
  const name = (o.name || "").toLowerCase();
  const mat = (o.material?.name || "").toLowerCase();
  const uvUD = (o.userData?.uv || "").toLowerCase();
  const tag = (o.userData?.tag || "").toLowerCase();
  return (
    name.includes("spaceship") ||
    mat.includes("spaceship") ||
    uvUD === "spaceship" ||
    tag === "spaceship"
  );
}

function Pool({ onReady }) {
  const { scene } = useGLTF("/pool.glb");
  useEffect(() => {
    autoGenerateLights(
      scene,
      2, // offset
      Math.PI / 6, // angle
      0.5 // penumbra
    );
  }, [scene]);
  const readyOnce = useRef(false);

  useEffect(() => {
    if (readyOnce.current) return;

    // 충돌용 메쉬는 숨김
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (isColliderNode(o)) o.visible = false;
    });
    scene.updateMatrixWorld(true);

    // water 박스(XZ 경계)
    let waterNode = null;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if ((o.name || "").toLowerCase() === "water") waterNode = o;
    });

    let xzBounds, yBounds;
    if (waterNode) {
      const wb = new THREE.Box3().setFromObject(waterNode);
      xzBounds = {
        minX: wb.min.x + PAD,
        maxX: wb.max.x - PAD,
        minZ: wb.min.z + PAD,
        maxZ: wb.max.z - PAD,
      };
      // 머리 높이의 기본 범위(수면 밖으로 못 나가게)
      yBounds = {
        headMin: wb.min.y + PAD + HEAD_OFFSET,
        headMax: wb.max.y - PAD,
      };
    } else {
      // 폴백: 씬 전체
      const world = new THREE.Box3().setFromObject(scene);
      xzBounds = {
        minX: world.min.x + PAD,
        maxX: world.max.x - PAD,
        minZ: world.min.z + PAD,
        maxZ: world.max.z - PAD,
      };
      yBounds = {
        headMin: world.min.y + PAD + HEAD_OFFSET,
        headMax: world.max.y - PAD,
      };
      console.warn(
        "[Stage] 'water' 메쉬를 못 찾아 씬 박스를 경계로 사용합니다."
      );
    }

    // ✅ spaceship 충돌 박스 수집
    const spaceshipBoxes = [];
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (!isSpaceshipNode(o)) return;
      o.updateWorldMatrix(true, true);
      spaceshipBoxes.push(new THREE.Box3().setFromObject(o));
    });

    onReady({ xzBounds, yBounds, spaceshipBoxes });
    readyOnce.current = true;
  }, [scene, onReady]);

  return <primitive object={scene} />;
}

// AABB 확장(캡슐 반지름/반높이 고려)
function expandBox(box, r, halfH) {
  return new THREE.Box3(
    new THREE.Vector3(box.min.x - r, box.min.y - halfH, box.min.z - r),
    new THREE.Vector3(box.max.x + r, box.max.y + halfH, box.max.z + r)
  );
}
function inside(p, b) {
  return (
    p.x > b.min.x &&
    p.x < b.max.x &&
    p.y > b.min.y &&
    p.y < b.max.y &&
    p.z > b.min.z &&
    p.z < b.max.z
  );
}
function collides(centerPos, boxes, radius, halfH) {
  for (let i = 0; i < boxes.length; i++) {
    if (inside(centerPos, expandBox(boxes[i], radius, halfH))) return true;
  }
  return false;
}

// XZ는 water 박스 내부로 강제
function clampXZInside(center, xz, radius) {
  center.x = Math.min(Math.max(center.x, xz.minX + radius), xz.maxX - radius);
  center.z = Math.min(Math.max(center.z, xz.minZ + radius), xz.maxZ - radius);
  return center;
}

// 'spaceship' 박스에만 간단한 축분리 충돌 차단(콜리전 OFF 상태에서 예외적으로 막기)
function blockBySpaceship(cur, proposed, boxes, radius, halfH) {
  const out = cur.clone();

  // X만 시도
  const tryX = new THREE.Vector3(proposed.x, cur.y, cur.z);
  if (!collides(tryX, boxes, radius, halfH)) out.x = proposed.x;
  else out.x = cur.x;

  // Z만 시도 (X 반영 후)
  const tryZ = new THREE.Vector3(out.x, cur.y, proposed.z);
  if (!collides(tryZ, boxes, radius, halfH)) out.z = proposed.z;
  else out.z = cur.z;

  // Y만 시도 (XZ 반영 후)
  const tryY = new THREE.Vector3(out.x, proposed.y, out.z);
  if (!collides(tryY, boxes, radius, halfH)) out.y = proposed.y;
  else out.y = cur.y;

  return out;
}

function Player({ xzBounds, yBounds, spaceshipBoxes }) {
  const { camera, gl } = useThree();
  const { posRef, ballast, setBallast, setStageText } = useSim();
  const rig = useRef(null);
  const keys = useRef({});

  const headYRef = useRef(SPAWN_POS.y); // "머리 높이" 상태
  const vyRef = useRef(0);
  const tRef = useRef(0);

  const hydroMove = useHydroMovementReal(HYDRO_CONFIG);
  const verticalMove = useVerticalHydroReal(HYDRO_CONFIG);
  const ready = useRef(false);
  const halfH = PLAYER_HEIGHT * 0.5;

  useEffect(() => {
    if (!rig.current) return;

    // 초기 위치(캡슐 중심)
    const startCenter = new THREE.Vector3(
      SPAWN_POS.x,
      SPAWN_POS.y - HEAD_OFFSET,
      SPAWN_POS.z
    );
    clampXZInside(startCenter, xzBounds, PLAYER_RADIUS);

    // 시작 머리 높이를 동기화 + 카메라 최소 높이 보장
    headYRef.current = Math.max(startCenter.y + HEAD_OFFSET, CAM_MIN_Y);

    rig.current.position.copy(startCenter);
    camera.position.set(0, HEAD_OFFSET, 0);
    rig.current.add(camera);

    if (setStageText)
      setStageText(
        "Movement: WASD, Buoyancy: E/R (XZ movement limited within water, spaceship collisions blocked, camera height ≥ 1.75 m)"
      );
    ready.current = true;
  }, [xzBounds, setStageText, camera]);

  useEffect(() => {
    const dom = gl.domElement;
    dom.tabIndex = 0;
    dom.style.outline = "none";
    const focus = () => dom.focus();
    dom.addEventListener("pointerdown", focus);

    const kd = (e) => {
      keys.current[e.code] = true;
      if (e.code === "KeyE") setBallast((v) => v - 1);
      if (e.code === "KeyR") setBallast((v) => v + 1);
      if (/Arrow|Space/.test(e.code)) e.preventDefault();
    };
    const ku = (e) => {
      keys.current[e.code] = false;
    };

    document.addEventListener("keydown", kd, true);
    document.addEventListener("keyup", ku, true);
    const clear = () => (keys.current = {});
    window.addEventListener("blur", clear);

    return () => {
      dom.removeEventListener("pointerdown", focus);
      document.removeEventListener("keydown", kd, true);
      document.removeEventListener("keyup", ku, true);
      window.removeEventListener("blur", clear);
    };
  }, [gl, setBallast]);

  useFrame((_, dt) => {
    if (!ready.current || !rig.current) return;
    tRef.current += dt;

    // --- 수직(부력/중량): 머리 높이 범위(headMin~headMax), 그리고 카메라 최소 높이 1.75 보장 ---
    const baseHeadMin = yBounds.headMin ?? -Infinity;
    const baseHeadMax = yBounds.headMax ?? Infinity;
    const headMin = Math.max(baseHeadMin, CAM_MIN_Y); // ✅ 카메라 최소 높이 강제
    const headMax = baseHeadMax;

    const vyRes = verticalMove.stepY({
      dt,
      y: headYRef.current,
      vy: vyRef.current,
      weightCount: ballast,
      bounds: { minY: headMin, maxY: headMax },
      speedXZ: 0,
      t: tRef.current,
    });
    vyRef.current = vyRes.newVy;

    let headTarget = THREE.MathUtils.clamp(vyRes.newY, headMin, headMax);

    // --- 수평 이동 ---
    const d = hydroMove.step({
      dt,
      camera,
      moveKeys: keys.current,
      effMass: Math.max(100, vyRes.totalMass ?? 180),
    });

    const cur = rig.current.position.clone();
    const proposed = cur.clone();

    if (Number.isFinite(d.x)) proposed.x = cur.x + d.x;
    if (Number.isFinite(d.y)) proposed.z = cur.z + d.y;
    proposed.y = headTarget - HEAD_OFFSET;

    // 1) XZ는 water 내부로 고정
    clampXZInside(proposed, xzBounds, PLAYER_RADIUS);

    // 2) spaceship 충돌 차단(예외적으로만 사용)
    const blocked = blockBySpaceship(
      cur,
      proposed,
      spaceshipBoxes,
      PLAYER_RADIUS,
      halfH
    );

    rig.current.position.copy(blocked);
    headYRef.current = blocked.y + HEAD_OFFSET; // 상태 동기화(머리 높이)
    posRef.current = { x: blocked.x, y: blocked.y + HEAD_OFFSET, z: blocked.z };
  });

  return (
    <group ref={rig}>
      {/* 카메라 장착 리그(보이지 않음) */}
      <mesh visible={false} position={[0, 0, 0]}>
        <capsuleGeometry
          args={[PLAYER_RADIUS, PLAYER_HEIGHT - 2 * PLAYER_RADIUS, 8, 16]}
        />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}

function StageInner({ onDone }) {
  const [world, setWorld] = useState(null);
  const { posRef, setStageText, setNeutralTimer } = useSim();
  const [missionStage, setMissionStage] = useState(0);
  const [targetPos, setTargetPos] = useState(new THREE.Vector3());
  const [timer, setTimer] = useState(0);
  const [neutralAchieved, setNeutralAchieved] = useState(false);
  const stayRef = useRef(0);
  const prevY = useRef(0);
  // ────────────────────────────────
  // 🎲 랜덤 목표 위치 생성 함수
  // ────────────────────────────────
  function randomTarget(currentY, stage, yBounds, xzBounds, spaceshipBoxes) {
    const MAX_ATTEMPTS = 10;
    const baseY = Number.isFinite(currentY)
      ? currentY
      : (yBounds.headMin + yBounds.headMax) / 2;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const x = THREE.MathUtils.randFloat(xzBounds.minX + 1, xzBounds.maxX - 1);
      const z = THREE.MathUtils.randFloat(xzBounds.minZ + 1, xzBounds.maxZ - 1);
      let y;

      if (stage === 0) {
        // 🚀 양성부력 (현재보다 최소 1~3m 위)
        const up = THREE.MathUtils.randFloat(1.0, 3.0);
        y = Math.min(baseY + up, yBounds.headMax - 0.5);
        if (y <= baseY) y = baseY + 1.0;
      } else if (stage === 1) {
        // ⚓ 음성부력 (현재보다 최소 1~3m 아래)
        const down = THREE.MathUtils.randFloat(1.0, 3.0);
        y = Math.max(baseY - down, yBounds.headMin + 0.5);
        if (y >= baseY) y = baseY - 1.0;
      } else {
        // 🟡 중성부력 (중앙 ±0.3)
        const midY = (yBounds.headMin + yBounds.headMax) / 2;
        y = THREE.MathUtils.randFloat(midY - 0.3, midY + 0.3);
      }

      const candidate = new THREE.Vector3(x, y, z);
      const safe = !spaceshipBoxes.some((b) => b.containsPoint(candidate));
      if (safe) return candidate;
    }

    return new THREE.Vector3(0, baseY, 0);
  }
  // ────────────────────────────────
  // 🧭 미션 상태 전환 함수
  // ────────────────────────────────
  function setNextMission(stage, yBounds, xzBounds, spaceshipBoxes, currentY) {
    let pos;
    if (stage === 0) {
      pos = randomTarget(currentY, 0, yBounds, xzBounds, spaceshipBoxes);
      setTargetPos(pos);
      setStageText(
        "🎯 [Stage 1] Use positive buoyancy to rise toward the target above!"
      );
    } else if (stage === 1) {
      pos = randomTarget(currentY, 1, yBounds, xzBounds, spaceshipBoxes);
      setTargetPos(pos);
      setStageText(
        "🎯 [Stage 2] Use negative buoyancy to descend toward the target below!"
      );
    } else if (stage === 2) {
      pos = randomTarget(currentY, 2, yBounds, xzBounds, spaceshipBoxes);
      setTargetPos(pos);
      setStageText(
        "🎯 [Stage 3] Maintain neutral buoyancy and stay steady for 1 second!"
      );
      setTimer(0);
      setNeutralAchieved(false);
    }
  }

  // 🌊 초기화
  useEffect(() => {
    if (!world) return;
    const midY = (world.yBounds.headMin + world.yBounds.headMax) / 2;
    posRef.current.y = midY; // 중앙에서 시작
    setMissionStage(0); // ✅ 초기 단계 명시
    // 한 프레임 뒤 실행으로 보장
    requestAnimationFrame(() => {
      setNextMission(
        0,
        world.yBounds,
        world.xzBounds,
        world.spaceshipBoxes,
        midY
      );
    });
  }, [world]);

  // ⏱️ 프레임 업데이트
  useFrame((_, dt) => {
    if (!world) return;
    const { y } = posRef.current;
    const targetY = targetPos.y;

    // 📏 거리 계산
    const distance = Math.abs(y - targetY);

    // 1️⃣ Stage 1: Upward (positive buoyancy)
    if (missionStage === 0) {
      // 위로 접근 중이며 충분히 가까워야 함
      const ascending = y > prevY.current && y < targetY + 0.2;
      if (ascending && distance < 0.2) {
        stayRef.current += dt;
        if (stayRef.current > 0.5) {
          setStageText("✅ [Stage 1 Complete] Reached the upper target!");
          setMissionStage(1);
          stayRef.current = 0;
          setNextMission(
            1,
            world.yBounds,
            world.xzBounds,
            world.spaceshipBoxes,
            y
          );
        }
      } else {
        stayRef.current = 0;
      }
    }

    // 2️⃣ Stage 2: Downward (negative buoyancy)
    else if (missionStage === 1) {
      const descending = y < prevY.current && y > targetY - 0.2;
      if (descending && distance < 0.2) {
        stayRef.current += dt;
        if (stayRef.current > 0.5) {
          setStageText("✅ [Stage 2 Complete] Reached the lower target!");
          setMissionStage(2);
          stayRef.current = 0;
          setNextMission(
            2,
            world.yBounds,
            world.xzBounds,
            world.spaceshipBoxes,
            y
          );
        }
      } else {
        stayRef.current = 0;
      }
    }

    // 3️⃣ Stage 3: Neutral (hold steady)
    else if (missionStage === 2) {
      const withinNeutral = distance < 0.15;
      if (withinNeutral) {
        setTimer((t) => {
          const newT = t + dt;
          setNeutralTimer(newT);
          if (newT >= 1 && !neutralAchieved) {
            setNeutralAchieved(true);
            setStageText(
              "✅ [Stage 3 Complete] 30 seconds of perfect neutral buoyancy!"
            );
            onDone();
          }
          return newT;
        });
      } else {
        if (timer !== 0) {
          setTimer(0);
          setNeutralTimer(0);
          setStageText("⚠️ Out of neutral range. Try again!");
        }
      }
    }

    // ✅ 마지막에 현재 높이를 prevY에 저장
    prevY.current = y;
  });

  return (
    <>
      <WaterController />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} />
      <Pool onReady={setWorld} />
      {world && (
        <>
          <Player
            xzBounds={world.xzBounds}
            yBounds={world.yBounds}
            spaceshipBoxes={world.spaceshipBoxes}
          />
          <mesh position={[targetPos.x, targetPos.y, targetPos.z]}>
            <sphereGeometry args={[0.25, 16, 16]} />
            <meshStandardMaterial
              color={
                missionStage === 0
                  ? "#00aaff" // 양성부력 = 파랑
                  : missionStage === 1
                  ? "#ff3030" // 음성부력 = 빨강
                  : "#ffff00" // 중성부력 = 노랑
              }
              emissiveIntensity={0.8}
              emissive={
                missionStage === 0
                  ? "#00aaff"
                  : missionStage === 1
                  ? "#ff3030"
                  : "#ffff00"
              }
            />
          </mesh>
        </>
      )}
    </>
  );
}

export default function Stage({ onDone }) {
  return (
    <SimProvider initialBallast={HYDRO_CONFIG.ballastKg}>
      <StageShell
        camera={{ position: [SPAWN_POS.x, SPAWN_POS.y, SPAWN_POS.z], fov: 75 }}
        envPreset="warehouse"
        title={<HUD title="Training Stage" extra={null} />}
      >
        <Suspense fallback={null}>
          <StageInner onDone={onDone} />
          <Environment preset="warehouse" />
        </Suspense>
      </StageShell>
    </SimProvider>
  );
}
