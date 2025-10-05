import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { SimProvider, useSim } from "../../common/SimContext";
import StageShell from "../../common/StageShell";
import HUD from "../../common/HUD";
import useHydroMovementReal from "../../physics/useHydroMovementReal";
import useVerticalHydroReal from "../../physics/useVerticalHydroReal";
import { HYDRO_CONFIG } from "../../physics/hydroConfig";
import { autoGenerateLights } from "../../assets/AutoLightGenarator.js";
import { WaterController } from '../../assets/WaterShade.js';

useGLTF.preload("/pool.glb");

const SPAWN_POS = new THREE.Vector3(14.98, 1.75, -29.99);
const RING_POS  = new THREE.Vector3(-1.59, 0.0, 14.89);
const REPAIR_DISTANCE = 2.0;

const PLAYER_HEIGHT = 1.75;
const PLAYER_RADIUS = 0.38;
const HEAD_OFFSET   = PLAYER_HEIGHT * 0.5;

const CAM_MIN_Y = 1.75;
const PAD = 0.01;

function isColliderNode(o) {
  const n = (o.name || "").toLowerCase();
  return n.includes("collision") || n.includes("collider") || n.startsWith("col_") || o.userData?.collider === true;
}
function isSpaceshipNode(o) {
  const name = (o.name || "").toLowerCase();
  const mat  = (o.material?.name || "").toLowerCase();
  const uvUD = (o.userData?.uv || "").toLowerCase();
  const tag  = (o.userData?.tag || "").toLowerCase();
  return (
    name.includes("spaceship") ||
    mat.includes("spaceship")  ||
    uvUD === "spaceship"       ||
    tag === "spaceship"
  );
}

function Pool({ onReady }) {
  const group = useRef();
  const { scene, animations } = useGLTF("/pool.glb");

  
  useEffect(() => {
    autoGenerateLights(
        scene, 
        2,            // offset
        Math.PI / 6,  // angle
        0.5           // penumbra
    );
}, [scene]);
  const { actions, mixer } = useAnimations(animations, group); // ✅ 애니메이션 훅
  const readyOnce = useRef(false);

  useEffect(() => {
    if (readyOnce.current) return;

    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (isColliderNode(o)) o.visible = false;
    });
    scene.updateMatrixWorld(true);

    let waterNode = null;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if ((o.name || "").toLowerCase() === "water") waterNode = o;
    });

    let xzBounds, yBounds;
    if (waterNode) {
      const wb = new THREE.Box3().setFromObject(waterNode);
      xzBounds = {
        minX: wb.min.x + PAD, maxX: wb.max.x - PAD,
        minZ: wb.min.z + PAD, maxZ: wb.max.z - PAD,
      };
      yBounds = { headMin: wb.min.y + PAD + HEAD_OFFSET, headMax: wb.max.y - PAD };
    } else {
      const world = new THREE.Box3().setFromObject(scene);
      xzBounds = {
        minX: world.min.x + PAD, maxX: world.max.x - PAD,
        minZ: world.min.z + PAD, maxZ: world.max.z - PAD,
      };
      yBounds = { headMin: world.min.y + PAD + HEAD_OFFSET, headMax: world.max.y - PAD };
      console.warn("[Stage] 'water' 메쉬를 못 찾아 씬 박스를 경계로 사용합니다.");
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

function expandBox(box, r, halfH) {
  return new THREE.Box3(
    new THREE.Vector3(box.min.x - r, box.min.y - halfH, box.min.z - r),
    new THREE.Vector3(box.max.x + r, box.max.y + halfH, box.max.z + r)
  );
}
function inside(p, b) {
  return (p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z);
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
  out.x = collides(tryX, boxes, radius, halfH) ? cur.x : proposed.x;
  const tryZ = new THREE.Vector3(out.x, cur.y, proposed.z);
  out.z = collides(tryZ, boxes, radius, halfH) ? cur.z : proposed.z;
  const tryY = new THREE.Vector3(out.x, proposed.y, out.z);
  out.y = collides(tryY, boxes, radius, halfH) ? cur.y : proposed.y;
  return out;
}

function Player({ xzBounds, yBounds, spaceshipBoxes, poolAnim, onComplete }) {
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
  const tmpHead   = useRef(new THREE.Vector3()).current;
  
  const repairState = useRef("idle"); // idle, repairing, completed

  useEffect(() => {
    if (!rig.current) return;

    const startCenter = new THREE.Vector3(SPAWN_POS.x, SPAWN_POS.y - HEAD_OFFSET, SPAWN_POS.z);
    clampXZInside(startCenter, xzBounds, PLAYER_RADIUS);
    headYRef.current = Math.max(startCenter.y + HEAD_OFFSET, CAM_MIN_Y);

    rig.current.position.copy(startCenter);
    camera.position.set(0, HEAD_OFFSET, 0);
    rig.current.add(camera);

     setStageText?.("🔧 EQUIPMENT REPAIR TRAINING\n\n• Mission: Repair critical life support system\n• Move to the red ring and press F to begin repair\n• Use E/R keys to adjust ballast for stability\n• Complete the repair to proceed to next stage");
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
        if (dist > REPAIR_DISTANCE) return; 

        const fix = poolAnim?.actions?.fix || poolAnim?.actions?.Fix;
         if (fix) {
           repairState.current = "repairing";
           setStageText?.("🔧 REPAIR IN PROGRESS\n\n• Repairing critical life support system\n• Maintain stable position\n• Do not move during repair procedure\n• Repair will complete automatically");
           fix.reset();
           fix.setLoop(THREE.LoopOnce, 1);
           fix.clampWhenFinished = true;
           fix.fadeIn(0.15).play();

           const mixer = poolAnim.mixer;
           const onFinished = () => {
             repairState.current = "completed";
             setStageText?.("✅ REPAIR COMPLETED SUCCESSFULLY!\n\n• Critical life support system restored\n• Mission objective achieved\n• Preparing for next training stage\n• Well done, astronaut!");
             
             let countdown = 3;
             const countdownInterval = setInterval(() => {
               if (countdown > 0) {
                 setStageText?.(`✅ REPAIR COMPLETED SUCCESSFULLY!\n\n• Critical life support system restored\n• Mission objective achieved\n• Preparing for next training stage\n• Well done, astronaut!\n\nNext stage in ${countdown}...`);
                 countdown--;
               } else {
                 clearInterval(countdownInterval);
                 if (onComplete) onComplete();
               }
             }, 1000);
             
             mixer.removeEventListener("finished", onFinished);
           };
           mixer.addEventListener("finished", onFinished);
         } else {
           repairState.current = "completed";
           setStageText?.("✅ REPAIR COMPLETED SUCCESSFULLY!\n\n• Critical life support system restored\n• Mission objective achieved\n• Preparing for next training stage\n• Well done, astronaut!");
           
           let countdown = 3;
           const countdownInterval = setInterval(() => {
             if (countdown > 0) {
               setStageText?.(`✅ REPAIR COMPLETED SUCCESSFULLY!\n\n• Critical life support system restored\n• Mission objective achieved\n• Preparing for next training stage\n• Well done, astronaut!\n\nNext stage in ${countdown}...`);
               countdown--;
             } else {
               clearInterval(countdownInterval);
               if (onComplete) onComplete();
             }
           }, 1000);
         }
      }

      if (/Arrow|Space/.test(e.code)) e.preventDefault();
    };

    const ku = (e) => { keys.current[e.code] = false; };

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
  }, [gl, setBallast, poolAnim, setStageText, camera, headWorld]);

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
    let headTarget = THREE.MathUtils.clamp(vyRes.newY, headMin, headMax);

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

     tmpHead.set(blocked.x, blocked.y + HEAD_OFFSET, blocked.z);
     const dist = tmpHead.distanceTo(RING_POS);
     
     if (repairState.current === "repairing") {
       return;
     } else if (repairState.current === "completed") {
       return;
     } else {
        if (dist <= REPAIR_DISTANCE) setStageText?.("🎯 REPAIR ZONE REACHED\n\n• You are now in the repair zone\n• Press F to begin the repair procedure\n• Maintain stable position during repair\n• Use E/R to adjust ballast if needed");
        else setStageText?.("🔧 EQUIPMENT REPAIR TRAINING\n\n• Mission: Repair critical life support system\n• Move to the red ring and press F to begin repair\n• Use E/R keys to adjust ballast for stability\n• Complete the repair to proceed to next stage");
     }
  });

  return (
    <group ref={rig}>
      <mesh visible={false} position={[0, 0, 0]}>
        <capsuleGeometry args={[PLAYER_RADIUS, PLAYER_HEIGHT - 2 * PLAYER_RADIUS, 8, 16]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}

function StageInner({ onComplete }) {
  const [world, setWorld] = useState(null);
  const onReady = useCallback((data) => setWorld(data), []);
  return (
    <>
    <WaterController /> 
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} />
      <Pool onReady={onReady} />
      {world && (
        <Player
          xzBounds={world.xzBounds}
          yBounds={world.yBounds}
          spaceshipBoxes={world.spaceshipBoxes}
          poolAnim={{ actions: world.actions, mixer: world.mixer }} 
          onComplete={onComplete}
        />
      )}
      <mesh position={RING_POS} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.8, 0.02, 16, 64]} />
        <meshStandardMaterial
          color="#ff4040"
          emissive="#ff4040"
          emissiveIntensity={1.3}
          roughness={0.35}
        />
      </mesh>
    </>
  );
}

export default function Stage({ onComplete }) {
  return (
    <SimProvider initialBallast={HYDRO_CONFIG.ballastKg}>
      <StageShell
        camera={{ position: [SPAWN_POS.x, SPAWN_POS.y, SPAWN_POS.z], fov: 75 }}
        envPreset="warehouse"
        title={<HUD title="External Wall Repair Training" extra={null} />}
      >
        <Suspense fallback={null}>
          <StageInner onComplete={onComplete} />
          <Environment preset="warehouse" />
        </Suspense>
      </StageShell>
    </SimProvider>
  );
}
