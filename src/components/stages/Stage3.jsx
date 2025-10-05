import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { autoGenerateLights } from "../../assets/lightAutoGenarator";
import { WaterController } from "../../assets/WaterShade.js";
import { SimProvider, useSim } from "../../common/SimContext";
import StageShell from "../../common/StageShell";
import HUD from "../../common/HUD";
import useHydroMovementReal from "../../physics/useHydroMovementReal";
import useVerticalHydroReal from "../../physics/useVerticalHydroReal";
import { HYDRO_CONFIG } from "../../physics/hydroConfig";

useGLTF.preload("/pool.glb");
useGLTF.preload("/portal.glb");

const SPAWN_POS = new THREE.Vector3(-1.02, 1.75, 15.06);
const PLAYER_HEIGHT = 1.75;
const PLAYER_RADIUS = 0.38;
const HEAD_OFFSET = PLAYER_HEIGHT * 0.5;
const CAM_MIN_Y = 1.75;
const PAD = 0.01;
const RING_POS = new THREE.Vector3(-5.489, 0, -7.946);
const TRIGGER_DISTANCE = 3.0;
const HOLD_TIME = 3.0;

function isColliderNode(o) {
  const n = (o.name || "").toLowerCase();
  return n.includes("collision") || n.includes("collider") || n.startsWith("col_") || o.userData?.collider === true;
}

function isSpaceshipNode(o) {
  const name = (o.name || "").toLowerCase();
  const mat = (o.material?.name || "").toLowerCase();
  const uvUD = (o.userData?.uv || "").toLowerCase();
  const tag = (o.userData?.tag || "").toLowerCase();
  return name.includes("spaceship") || mat.includes("spaceship") || uvUD === "spaceship" || tag === "spaceship";
}

function Pool({ onReady }) {
  const group = useRef();
  const { scene, animations } = useGLTF("/pool.glb");
  const { actions, mixer } = useAnimations(animations, group);
  const readyOnce = useRef(false);

  useEffect(() => {
    if (readyOnce.current) return;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const nm = (o.name || "").toLowerCase();
      if (isColliderNode(o) || nm.includes("nasa") || nm.includes("pgt")) o.visible = false;
    });
    scene.updateMatrixWorld(true);
    autoGenerateLights(scene, 2, Math.PI / 6, 0.5);
    let waterNode = null;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if ((o.name || "").toLowerCase() === "water") waterNode = o;
    });
    let xzBounds, yBounds;
    if (waterNode) {
      const wb = new THREE.Box3().setFromObject(waterNode);
      xzBounds = { minX: wb.min.x + PAD, maxX: wb.max.x - PAD, minZ: wb.min.z + PAD, maxZ: wb.max.z - PAD };
      yBounds = { headMin: wb.min.y + PAD + HEAD_OFFSET, headMax: wb.max.y - PAD };
    } else {
      const world = new THREE.Box3().setFromObject(scene);
      xzBounds = { minX: world.min.x + PAD, maxX: world.max.x - PAD, minZ: world.min.z + PAD, maxZ: world.max.z - PAD };
      yBounds = { headMin: world.min.y + PAD + HEAD_OFFSET, headMax: world.max.y - PAD };
    }
    const spaceshipBoxes = [];
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (!isSpaceshipNode(o)) return;
      o.updateWorldMatrix(true, true);
      spaceshipBoxes.push(new THREE.Box3().setFromObject(o));
    });
    onReady({ xzBounds, yBounds, spaceshipBoxes, actions, mixer });
    readyOnce.current = true;
  }, [scene, onReady, actions, mixer]);

  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  );
}

function Portal() {
  const { scene } = useGLTF("/portal.glb");
  const g = useRef();
  useEffect(() => {
    if (!g.current) return;
    g.current.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }, []);
  return (
    <group ref={g} position={RING_POS} rotation={[0, 0, 0]}>
      <primitive object={scene} />
    </group>
  );
}

function expandBox(box, r, halfH) {
  return new THREE.Box3(
    new THREE.Vector3(box.min.x - r, box.min.y - halfH, box.min.z - r),
    new THREE.Vector3(box.max.x + r, box.max.y + halfH, box.max.z + r)
  );
}
function inside(p, b) {
  return p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z;
}
function collides(centerPos, boxes, radius, halfH) {
  for (let i = 0; i < boxes.length; i++) {
    if (inside(centerPos, expandBox(boxes[i], radius, halfH))) return true;
  }
  return false;
}
function clampXZInside(center, xz, radius) {
  center.x = Math.min(Math.max(center.x, xz.minX + radius), xz.maxX - radius);
  center.z = Math.min(Math.max(center.z, xz.minZ + radius), xz.maxZ - radius);
  return center;
}
function blockBySpaceship(cur, proposed, boxes, radius, halfH) {
  const out = cur.clone();
  const tryX = new THREE.Vector3(proposed.x, cur.y, cur.z);
  if (!collides(tryX, boxes, radius, halfH)) out.x = proposed.x; else out.x = cur.x;
  const tryZ = new THREE.Vector3(out.x, cur.y, proposed.z);
  if (!collides(tryZ, boxes, radius, halfH)) out.z = proposed.z; else out.z = cur.z;
  const tryY = new THREE.Vector3(out.x, proposed.y, out.z);
  if (!collides(tryY, boxes, radius, halfH)) out.y = proposed.y; else out.y = cur.y;
  return out;
}

function Player({ xzBounds, yBounds, spaceshipBoxes, poolAnim, onEnter }) {
  const { camera, gl } = useThree();
  const { posRef, ballast, setBallast, setStageText } = useSim();
  const rig = useRef(null);
  const keys = useRef({});
  const headYRef = useRef(SPAWN_POS.y);
  const vyRef = useRef(0);
  const tRef = useRef(0);
  const hydroMove = useHydroMovementReal(HYDRO_CONFIG);
  const verticalMove = useVerticalHydroReal(HYDRO_CONFIG);
  const ready = useRef(false);
  const halfH = PLAYER_HEIGHT * 0.5;
  const headWorld = useRef(new THREE.Vector3()).current;
  const phaseRef = useRef("idle");
  const holdRef = useRef(0);
  const lastPctRef = useRef(-1);

  const showBlock = (title, lines = []) => {
    const h = `【${title}】`;
    const body = lines.map((l) => `• ${l}`).join("\n");
    setStageText([h, body].filter(Boolean).join("\n\n"));
  };

  useEffect(() => {
    if (!rig.current) return;
    const startCenter = new THREE.Vector3(SPAWN_POS.x, SPAWN_POS.y - HEAD_OFFSET, SPAWN_POS.z);
    clampXZInside(startCenter, xzBounds, PLAYER_RADIUS);
    headYRef.current = Math.max(startCenter.y + HEAD_OFFSET, CAM_MIN_Y);
    rig.current.position.copy(startCenter);
    camera.position.set(0, HEAD_OFFSET, 0);
    rig.current.add(camera);
    showBlock("INGRESS DRILL", [
      "Move: WASD",
      "Buoyancy: E/R",
      "Action: F near the portal",
      "Approach the portal to start",
    ]);
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
      if (e.code === "KeyE") setBallast((v) => Math.max(0, v - 1));
      if (e.code === "KeyR") setBallast((v) => v + 1);
      if (e.code === "KeyF") {
        camera.getWorldPosition(headWorld);
        const dist = headWorld.distanceTo(RING_POS);
        if (dist > TRIGGER_DISTANCE) return;

        if (phaseRef.current === "idle") {
          phaseRef.current = "purpose1";
          showBlock("WHY THIS DRILL", [
            "Avoid snags and hinge injuries",
            "Refine buoyancy and body alignment",
            "Confirm comms before tight entry",
            "Press F to continue",
          ]);
          return;
        }

        if (phaseRef.current === "purpose1") {
          phaseRef.current = "purpose2";
          showBlock("CONTEXT", [
            "Exterior → Interior transition",
            "Hold neutral trim, minimize wake",
            "Protect seals and mechanisms",
            "Keep tools/tethers clear",
            "Press F for checklist",
          ]);
          return;
        }

        if (phaseRef.current === "purpose2") {
          phaseRef.current = "prepare";
          showBlock("CHECKLIST", [
            "Stabilize within 3 m of the portal",
            "Trim neutral with E/R, square to hatch",
            "Hands clear of hinges/seals",
            "Path clear, comms good",
            "Press F to move to handle",
          ]);
          return;
        }

        if (phaseRef.current === "prepare") {
          phaseRef.current = "handle";
          holdRef.current = 0;
          lastPctRef.current = -1;
          showBlock("HANDLE", [
            "Hold F for 3 s to actuate",
            "Stay on centerline, neutral trim",
            "Hold F now to open the hatch",
          ]);
          return;
        }
      }
      if (/Arrow|Space/.test(e.code)) e.preventDefault();
    };

    const ku = (e) => {
      keys.current[e.code] = false;
      if (e.code === "KeyF" && phaseRef.current === "handle") {
        holdRef.current = 0;
        lastPctRef.current = -1;
        showBlock("HANDLE", [
          "Hold F for 3 s to actuate",
          "Stay centered and neutral",
          "Hold F again to continue",
        ]);
      }
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
  }, [gl, setBallast, camera, headWorld]);

  useFrame((_, dt) => {
    if (!ready.current || !rig.current) return;
    tRef.current += dt;

    const baseHeadMin = yBounds.headMin ?? -Infinity;
    const baseHeadMax = yBounds.headMax ?? Infinity;
    const headMin = Math.max(baseHeadMin, CAM_MIN_Y);
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

    const headTarget = THREE.MathUtils.clamp(vyRes.newY, headMin, headMax);
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

    clampXZInside(proposed, xzBounds, PLAYER_RADIUS);
    const blocked = blockBySpaceship(cur, proposed, spaceshipBoxes, PLAYER_RADIUS, halfH);
    rig.current.position.copy(blocked);

    headYRef.current = blocked.y + HEAD_OFFSET;
    posRef.current = { x: blocked.x, y: blocked.y + HEAD_OFFSET, z: blocked.z };

    const headWorldPos = new THREE.Vector3();
    camera.getWorldPosition(headWorldPos);
    const dist = headWorldPos.distanceTo(RING_POS);

    if (phaseRef.current === "handle") {
      if (dist <= TRIGGER_DISTANCE && keys.current["KeyF"]) {
        holdRef.current += dt;
        const pct = Math.min(100, Math.floor((holdRef.current / HOLD_TIME) * 100));
        if (pct !== lastPctRef.current) {
          const filled = Math.round((pct / 100) * 12);
          const bar = "█".repeat(filled) + " ".repeat(12 - filled);
          showBlock("HANDLE", [`[${bar}] ${pct}%`, "Keep holding F, stay centered"]);
          lastPctRef.current = pct;
        }
        if (holdRef.current >= HOLD_TIME) {
          const openA = poolAnim?.actions?.open || poolAnim?.actions?.Open;
          const openedA = poolAnim?.actions?.opened || poolAnim?.actions?.Opened;
          phaseRef.current = "opening";
          holdRef.current = 0;
          lastPctRef.current = -1;
          showBlock("HATCH OPENING", [
            "Hold position; avoid seals/hinges",
            "Centerline only; small corrections",
          ]);
          if (openA) {
            openA.reset();
            openA.clampWhenFinished = true;
            openA.setLoop(THREE.LoopOnce, 1);
            openA.play();
            const onFinished = () => {
              if (openedA) {
                openedA.reset();
                openedA.clampWhenFinished = true;
                openedA.setLoop(THREE.LoopOnce, 1);
                openedA.play();
              }
              phaseRef.current = "ingress";
              showBlock("INGRESS", [
                "Glide through slowly, stay centered",
                "Protect suit, tethers, cameras",
                "Clear the threshold and stabilize",
                "Training complete",
              ]);
              poolAnim?.mixer?.removeEventListener("finished", onFinished);
              setTimeout(() => onEnter && onEnter(), 2200);
            };
            poolAnim?.mixer?.addEventListener("finished", onFinished);
          } else {
            phaseRef.current = "ingress";
            showBlock("INGRESS", [
              "Glide through slowly, stay centered",
              "Protect suit, tethers, cameras",
              "Clear the threshold and stabilize",
              "Training complete",
            ]);
            setTimeout(() => onEnter && onEnter(), 2200);
          }
        }
      } else if (holdRef.current > 0) {
        holdRef.current = 0;
        lastPctRef.current = -1;
        showBlock("HANDLE", [
          "Hold F for 3 s to actuate",
          "Stay centered and neutral",
          "Hold F again to continue",
        ]);
      }
    }
  });

  return (
    <group ref={rig}>
      <mesh visible={false}>
        <capsuleGeometry args={[PLAYER_RADIUS, PLAYER_HEIGHT - 2 * PLAYER_RADIUS, 8, 16]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}

function StageInner({ onEnter }) {
  const [world, setWorld] = useState(null);
  const onReady = useCallback((data) => setWorld(data), []);
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} />
      <Pool onReady={onReady} />
      {world && (
        <>
          <Player
            xzBounds={world.xzBounds}
            yBounds={world.yBounds}
            spaceshipBoxes={world.spaceshipBoxes}
            poolAnim={{ actions: world.actions, mixer: world.mixer }}
            onEnter={onEnter}
          />
          <WaterController />
        </>
      )}
      <Portal />
    </>
  );
}

export default function Stage3({ onEnter }) {
  return (
    <SimProvider initialBallast={HYDRO_CONFIG.ballastKg}>
      <StageShell
        camera={{ position: [SPAWN_POS.x, SPAWN_POS.y, SPAWN_POS.z], fov: 75 }}
        envPreset="warehouse"
        title={<HUD title="Hatch Ingress Training" extra={null} />}
      >
        <Suspense fallback={null}>
          <StageInner onEnter={onEnter} />
          <Environment preset="warehouse" />
        </Suspense>
      </StageShell>
    </SimProvider>
  );
}
