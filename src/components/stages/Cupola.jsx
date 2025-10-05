import React, { Suspense, useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Stars,
  Environment,
  Lightformer,
  Html,
  useProgress,
  Line,
  useGLTF,
  useAnimations,
} from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";

useGLTF.preload("/earth.glb");
useGLTF.preload("/cupola.glb");

const EARTH_TARGET_DIAMETER = 800.0;
const EARTH_SPIN_SPEED = 0.12;
const EARTH_ABS_POS = new THREE.Vector3(0, 0, 0);
const EARTH_TILT_DEG = -45;
const EARTH_TILT_AXIS = "z";
const toRad = (d) => THREE.MathUtils.degToRad(d);

const TIP_AXIS = "y";
const CUPOLA_PRE_PITCH_DEG = 0;
const CUPOLA_PRE_YAW_DEG = 90;
const CUPOLA_PRE_ROLL_DEG = 0;
const CUPOLA_ROLL_FIX_DEG = 0;
const ALTITUDE_BUMP_KM = 2000;


function gmstRadians(date) {
  const JD = date.getTime() / 86400000 + 2440587.5;
  const T = (JD - 2451545) / 36525;
  let g =
    67310.54841 +
    (876600 * 3600 + 8640184.812866) * T +
    0.093104 * T * T -
    6.2e-6 * T * T * T;
  g = ((g % 86400) + 86400) % 86400;
  return (g / 86400) * 2 * Math.PI;
}
function eciToEcef(r, date) {
  const th = gmstRadians(date),
    c = Math.cos(th),
    s = Math.sin(th);
  return new THREE.Vector3(c * r.x + s * r.y, -s * r.x + c * r.y, r.z);
}
function ecefToLla(r) {
  const a = 6378.137,
    e2 = 6.69437999014e-3;
  const { x, y, z } = r;
  const lon = Math.atan2(y, x);
  const p = Math.sqrt(x * x + y * y);
  let lat = Math.atan2(z, p * (1 - e2));
  for (let i = 0; i < 5; i++) {
    const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    lat = Math.atan2(z + e2 * N * Math.sin(lat), p);
  }
  const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const h = p / Math.cos(lat) - N;
  return { lat, lon, h };
}
function hermite1D(y0, y1, v0, v1, h, t) {
  const s = t / h;
  const h00 = (1 + 2 * s) * (1 - s) * (1 - s),
    h10 = s * (1 - s) * (1 - s),
    h01 = s * s * (3 - 2 * s),
    h11 = s * s * (s - 1);
  return h00 * y0 + h * h10 * v0 + h01 * y1 + h * h11 * v1;
}
function parseOEM(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  const nodes = [...doc.getElementsByTagName("stateVector")];
  return nodes
    .map((sv) => {
      const epoch = sv.getElementsByTagName("EPOCH")[0].textContent.trim();
      const get = (tag) =>
        parseFloat(sv.getElementsByTagName(tag)[0].textContent);
      return {
        epoch: new Date(epoch),
        r: new THREE.Vector3(get("X"), get("Y"), get("Z")),
        v: new THREE.Vector3(get("X_DOT"), get("Y_DOT"), get("Z_DOT")),
      };
    })
    .sort((a, b) => a.epoch - b.epoch);
}
function dedupeSort(states) {
  const m = new Map();
  for (const s of states) m.set(+s.epoch, s);
  return [...m.values()].sort((a, b) => a.epoch - b.epoch);
}
function guessCadenceSec(states) {
  const d = [];
  for (let i = 1; i < states.length; i++)
    d.push((states[i].epoch - states[i - 1].epoch) / 1000);
  d.sort((a, b) => a - b);
  return Math.round(d[Math.floor(d.length / 2)] || 240);
}
function resampleTo240(states) {
  if (!states.length) return [];
  const cadence = 240,
    start = new Date(
      Math.ceil(states[0].epoch.getTime() / 1000 / cadence) * cadence * 1000
    ),
    end = states[states.length - 1].epoch;
  const out = [];
  for (let t = start.getTime(); t <= end.getTime(); t += cadence * 1000) {
    let idx = states.findIndex(
      (s, i) => +s.epoch <= t && +states[Math.min(i + 1, states.length - 1)].epoch >= t
    );
    if (idx < 0) {
      out.push(states[0]);
      continue;
    }
    const s0 = states[idx],
      s1 = states[idx + 1],
      h = (+s1.epoch - +s0.epoch) / 1000,
      tau = (t - +s0.epoch) / 1000;
    const rx = hermite1D(s0.r.x, s1.r.x, s0.v.x, s1.v.x, h, tau);
    const ry = hermite1D(s0.r.y, s1.r.y, s0.v.y, s1.v.y, h, tau);
    const rz = hermite1D(s0.r.z, s1.r.z, s0.v.z, s1.v.z, h, tau);
    const vx = hermite1D(s0.v.x, s1.v.x, 0, 0, h, tau),
      vy = hermite1D(s0.v.y, s1.v.y, 0, 0, h, tau),
      vz = hermite1D(s0.v.z, s1.v.z, 0, 0, h, tau);
    out.push({
      epoch: new Date(t),
      r: new THREE.Vector3(rx, ry, rz),
      v: new THREE.Vector3(vx, vy, vz),
    });
  }
  return dedupeSort(out);
}
function interpRV(states, t) {
  const T = +t;
  let i = states.findIndex(
    (s, idx) => +s.epoch <= T && +states[Math.min(idx + 1, states.length - 1)].epoch >= T
  );
  if (i < 0) {
    const end = T >= +states.at(-1).epoch;
    const s = end ? states.at(-1) : states[0];
    return { r: s.r.clone(), v: s.v.clone() };
  }
  const s0 = states[i],
    s1 = states[i + 1],
    h = (+s1.epoch - +s0.epoch) / 1000,
    tau = (T - +s0.epoch) / 1000;
  return {
    r: new THREE.Vector3(
      hermite1D(s0.r.x, s1.r.x, s0.v.x, s1.v.x, h, tau),
      hermite1D(s0.r.y, s1.r.y, s0.v.y, s1.v.y, h, tau),
      hermite1D(s0.r.z, s1.r.z, s0.v.z, s1.v.z, h, tau)
    ),
    v: new THREE.Vector3(
      hermite1D(s0.v.x, s1.v.x, 0, 0, h, tau),
      hermite1D(s0.v.y, s1.v.y, 0, 0, h, tau),
      hermite1D(s0.v.z, s1.v.z, 0, 0, h, tau)
    ),
  };
}

const asDate = (d) => (d instanceof Date ? d : new Date(d));
const isValidDate = (d) => Number.isFinite(+asDate(d));

async function geminiPredict(nextMinutes, tailStates) {
  const base =
    import.meta.env.VITE_GEMINI_BASE_URL ||
    "https://generativelanguage.googleapis.com";
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) {
    return [];
  }

  const url = `${base}/v1beta/models/gemini-1.5-pro:generateContent?key=${key}`;

  const safeTail = (tailStates || [])
    .map((s) => ({ ...s, epoch: asDate(s.epoch) }))
    .filter((s) => isValidDate(s.epoch));

  const prompt = `You are an orbital analyst. Continue ISS OEM state vectors beyond the last OEM epoch.

Input:
- EME2000(J2000) ECI, km & km/s.
- Last ${safeTail.length} states @ 240s:
${JSON.stringify(
    safeTail.map((s) => ({
      epoch: asDate(s.epoch).toISOString().replace(".000Z", "Z"),
      x: s.r.x,
      y: s.r.y,
      z: s.r.z,
      xd: s.v.x,
      yd: s.v.y,
      zd: s.v.z,
    })),
    null,
    2
  )}

Task: Predict next ${nextMinutes} min @ 240s. JSON ONLY:
{"frame":"EME2000","units":{"pos":"km","vel":"km/s"},"states":[{"epoch":"YYYY-DOYThh:mm:ss.sssZ","x":0,"y":0,"z":0,"xd":0,"yd":0,"zd":0}]}
Rules: strict 240s steps, no extra text.`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
  });

  const data = await res.json();
  const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const i = txt.indexOf("{"),
    j = txt.lastIndexOf("}");
  if (i < 0 || j < 0) return [];
  const parsed = JSON.parse(txt.slice(i, j + 1));
  return (parsed.states || []).map((s) => ({
    epoch: new Date(s.epoch),
    r: new THREE.Vector3(s.x, s.y, s.z),
    v: new THREE.Vector3(s.xd, s.yd, s.zd),
  }));
}

function useOEMsMergedPlusGemini(files, horizonMin = 180) {
  const [states, setStates] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const texts = await Promise.all(
          files.map((p) =>
            fetch(`${import.meta.env.BASE_URL}${p}`).then((r) => r.text())
          )
        );
        const parsed = texts.flatMap(parseOEM);
        let combined = dedupeSort(parsed);
        if (Math.abs(guessCadenceSec(combined) - 240) > 1) {
          combined = resampleTo240(combined);
        }

        const tail = combined
          .slice(-6)
          .map((s) => ({ ...s, epoch: asDate(s.epoch) }))
          .filter((s) => isValidDate(s.epoch));

        let ext = [];
        const hasKey = !!import.meta.env.VITE_GEMINI_API_KEY;
        if (hasKey && tail.length > 1) {
          try {
            ext = await geminiPredict(horizonMin, tail);
          } catch {
          }
        }

        setStates(dedupeSort([...combined, ...ext]));
      } catch (e) {
        console.error(e);
        setStates(null);
      }
    })();
  }, [JSON.stringify(files), horizonMin]);

  return states;
}

function LoaderOverlay() {
  const { progress, active } = useProgress();
  if (!active) return null;
  return (
    <Html center style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>
      {Math.round(progress)}%
    </Html>
  );
}

function Earth({ position }) {
  const root = useRef();
  const { scene, animations } = useGLTF("/earth.glb");
  const model = useMemo(() => SkeletonUtils.clone(scene), [scene]);

  useEffect(() => {
    if (!root.current) return;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const s = EARTH_TARGET_DIAMETER / (Math.max(size.x, size.y, size.z) || 1);
    root.current.scale.setScalar(s);
  }, [model]);

  const { actions } = useAnimations(animations, model);
  useEffect(() => {
    const list = Object.values(actions || {});
    if (list.length) list.forEach((a) => a.reset().setLoop(THREE.LoopRepeat, Infinity).play());
  }, [actions]);

  useFrame((_, dt) => {
    if (!actions || Object.keys(actions).length === 0) {
      if (root.current) root.current.rotation.y += EARTH_SPIN_SPEED * dt;
    }
  });

  useEffect(() => {
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      o.frustumCulled = false;
    });
  }, [model]);

  const tilt = [
    EARTH_TILT_AXIS === "x" ? toRad(EARTH_TILT_DEG) : 0,
    EARTH_TILT_AXIS === "y" ? toRad(EARTH_TILT_DEG) : 0,
    EARTH_TILT_AXIS === "z" ? toRad(EARTH_TILT_DEG) : 0,
  ];

  return (
    <group ref={root} position={position.toArray()}>
      <group rotation={tilt}>
        <primitive object={model} />
      </group>
    </group>
  );
}

function CupolaModel() {
  const { scene } = useGLTF("/cupola.glb");
  return <primitive object={scene} scale={2} />;
}

function GroundTrack({ earthPos, scaleKmToScene, states }) {
  const pts = useMemo(() => {
    if (!states || !states.length) return [];
    const R = 6371,
      arr = [];
    for (const s of states) {
      const rEcef = eciToEcef(s.r, s.epoch);
      const { lat, lon } = ecefToLla(rEcef);
      const x = R * Math.cos(lat) * Math.cos(lon),
        y = R * Math.cos(lat) * Math.sin(lon),
        z = R * Math.sin(lat);
      arr.push(
        new THREE.Vector3(x, z, y).multiplyScalar(scaleKmToScene).add(earthPos)
      );
    }
    return arr;
  }, [states, earthPos, scaleKmToScene]);

  return pts.length > 1 ? (
    <Line
      points={pts}
      color="#6cf"
      lineWidth={2}
      dashed
      dashSize={6}
      gapSize={2}
      transparent
      opacity={0.9}
    />
  ) : null;
}

function CupolaISS({ earthPos, scaleKmToScene, states, controlsRef }) {
  const group = useRef();
  const { camera, gl, size } = useThree();

  const qPre = useMemo(() => {
    const e = new THREE.Euler(
      toRad(CUPOLA_PRE_PITCH_DEG),
      toRad(CUPOLA_PRE_YAW_DEG),
      toRad(CUPOLA_PRE_ROLL_DEG),
      "XYZ"
    );
    return new THREE.Quaternion().setFromEuler(e);
  }, []);
  const qTipAlign = useMemo(() => {
    const tipLocal =
      TIP_AXIS === "y" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    return new THREE.Quaternion().setFromUnitVectors(
      tipLocal,
      new THREE.Vector3(0, 0, 1)
    );
  }, []);

  const cur = useRef({ inside: 1.1, eyeUp: 0.22, yaw: 0, pitch: 0 });
  const tgt = useRef({ inside: 1.1, eyeUp: 0.22, yaw: 0, pitch: 0 });
  const LIM = {
    yaw: toRad(100),
    pitch: toRad(70),
    insideMin: 0.55,
    insideMax: 2.2,
  };
  const LAMBDA = { rot: 10, pos: 8, dist: 6 };
  const dragging = useRef(false);
  const doFrameFit = useRef(true);
  const cupolaRadiusWorld = useRef(null);

  useEffect(() => {
    gl.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
    const onDown = (e) => {
      if (e.button === 0) dragging.current = true;
    };
    const onUp = () => {
      dragging.current = false;
    };
    const onMove = (e) => {
      if (!dragging.current) return;
      tgt.current.yaw = THREE.MathUtils.clamp(
        tgt.current.yaw - (e.movementX || 0) * 0.003,
        -LIM.yaw,
        LIM.yaw
      );
      tgt.current.pitch = THREE.MathUtils.clamp(
        tgt.current.pitch - (e.movementY || 0) * 0.003,
        -LIM.pitch,
        LIM.pitch
      );
    };
    const onWheel = (e) => {
      const delta = (e.deltaY > 0 ? 1 : -1) * 0.08;
      tgt.current.inside = THREE.MathUtils.clamp(
        tgt.current.inside + delta,
        LIM.insideMin,
        LIM.insideMax
      );
    };
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if (k === "r")
        tgt.current = { inside: 1.1, eyeUp: 0.22, yaw: 0, pitch: 0 };
      if (k === "f") doFrameFit.current = true;
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, [gl.domElement]);

  function fitDistanceForRadius(r) {
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const aspect = size.width / size.height;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const dv = r / Math.tan(vfov / 2);
    const dh = r / Math.tan(hfov / 2);
    return Math.max(dv, dh);
  }

  useFrame((_, dt) => {
    if (!states || !states.length || !group.current) return;
    const now = new Date();
    const { r, v } = interpRV(states, now);

    const z = r.clone().multiplyScalar(-1).normalize();
    const y = z.clone().cross(v).normalize();
    const x = y.clone().cross(z).normalize();

    const qLVLH = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(x, y, z)
    );
    const qRollFix = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      toRad(CUPOLA_ROLL_FIX_DEG)
    );

    const rDraw = r.clone().setLength(r.length() + ALTITUDE_BUMP_KM);
    const posScene = rDraw.multiplyScalar(scaleKmToScene);
    const worldPos = new THREE.Vector3(
      earthPos.x + posScene.x,
      earthPos.y + posScene.z,
      earthPos.z + posScene.y
    );

    group.current.position.copy(worldPos);
    group.current.quaternion
      .copy(qLVLH)
      .multiply(qTipAlign)
      .multiply(qRollFix)
      .multiply(qPre);

    const baseForward = new THREE.Vector3(0, 0, 1).applyQuaternion(
      group.current.quaternion
    );
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(
      group.current.quaternion
    );
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(
      group.current.quaternion
    );

    if (cupolaRadiusWorld.current == null) {
      const box = new THREE.Box3().setFromObject(group.current);
      const sizeW = box.getSize(new THREE.Vector3());
      cupolaRadiusWorld.current =
        0.5 * Math.max(sizeW.x, sizeW.y, sizeW.z) * 0.95;
    }
    if (doFrameFit.current) {
      const need = fitDistanceForRadius(cupolaRadiusWorld.current) + 0.05;
      tgt.current.inside = THREE.MathUtils.clamp(
        need - 0.2,
        LIM.insideMin,
        LIM.insideMax
      );
      doFrameFit.current = false;
    }

    const d = cur.current,
      t = tgt.current;
    d.yaw = THREE.MathUtils.damp(d.yaw, t.yaw, LAMBDA.rot, dt);
    d.pitch = THREE.MathUtils.damp(d.pitch, t.pitch, LAMBDA.rot, dt);
    d.eyeUp = THREE.MathUtils.damp(d.eyeUp, t.eyeUp, LAMBDA.pos, dt);
    d.inside = THREE.MathUtils.damp(d.inside, t.inside, LAMBDA.dist, dt);

    const qYaw = new THREE.Quaternion().setFromAxisAngle(up, d.yaw);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(right, d.pitch);
    const qAim = new THREE.Quaternion().multiply(qYaw).multiply(qPitch);

    let forward = baseForward.clone().applyQuaternion(qAim).normalize();
    const dot = forward.dot(baseForward);
    if (dot < Math.cos(toRad(85))) {
      const blend = THREE.MathUtils.clamp(
        (Math.cos(toRad(85)) - dot) * 6,
        0,
        1
      );
      forward = forward.lerp(baseForward, blend).normalize();
    }

    const eye = worldPos
      .clone()
      .add(forward.clone().multiplyScalar(-(d.inside + 0.2)))
      .add(up.clone().multiplyScalar(d.eyeUp));
    const look = worldPos.clone().add(forward.clone().multiplyScalar(120));

    camera.position.copy(eye);
    camera.up.copy(up);
    camera.lookAt(look);

    if (controlsRef?.current) controlsRef.current.enabled = false;
  });

  return (
    <group ref={group}>
      <CupolaModel />
    </group>
  );
}

export default function CupolaScene() {
  const controls = useRef();
  const [earthPos] = useState(() => EARTH_ABS_POS.clone());
  const scaleKmToScene = useMemo(() => EARTH_TARGET_DIAMETER / 2 / 6371, []);

  const OEM_FILES = [
    "iss/ISS.OEM_J2K_EPH22.02.13.xml",
    "iss/ISS.OEM_J2K_EPH22.02.15.xml",
    "iss/ISS.OEM_J2K_EPH22.02.18.xml",
    "iss/ISS.OEM_J2K_EPH22.02.20.xml",
  ];

  const states = useOEMsMergedPlusGemini(OEM_FILES, 180);

  useEffect(() => {
    if (controls.current) {
      controls.current.enableRotate = true;
      controls.current.enablePan = true;
      controls.current.enableZoom = true;
      controls.current.minDistance = 2;
      controls.current.maxDistance = 2000;
    }
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
      <Canvas
        camera={{ position: [0, 0, 60], fov: 55, near: 0.1, far: 20000 }}
        gl={{ logarithmicDepthBuffer: true }}
        shadows
        onCreated={({ gl }) => {
          gl.setClearColor("#000", 1);
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.NoToneMapping;
          gl.physicallyCorrectLights = true;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <Stars
          radius={4000}
          depth={200}
          count={15000}
          factor={90}
          saturation={1}
          fade
          speed={4}
        />
        <ambientLight intensity={0.6} />
        <hemisphereLight args={["#fff", "#667", 0.6]} />
        <directionalLight
          position={[300, 500, 200]}
          intensity={2.0}
          color="#fffbe6"
          castShadow
        />
        <pointLight
          position={[-120, -40, -80]}
          intensity={8}
          distance={1000}
          decay={2}
          color="#88bbff"
        />

        <Environment preset="studio" background={false} intensity={0.25}>
          <Lightformer
            form="rect"
            intensity={1.2}
            color="#aecdff"
            scale={[400, 120, 1]}
            position={[0, 300, 0]}
          />
          <Lightformer
            form="rect"
            intensity={0.9}
            color="#cfe0ff"
            scale={[260, 90, 1]}
            position={[260, 210, 0]}
            rotation={[0, -Math.PI / 8, 0]}
          />
          <Lightformer
            form="rect"
            intensity={0.9}
            color="#cfe0ff"
            scale={[260, 90, 1]}
            position={[-260, 210, 0]}
            rotation={[0, Math.PI / 8, 0]}
          />
        </Environment>

        <Suspense fallback={<LoaderOverlay />}>
          <Earth position={earthPos} />
          {states && (
            <>
              <GroundTrack
                earthPos={earthPos}
                scaleKmToScene={scaleKmToScene}
                states={states}
              />
              <CupolaISS
                earthPos={earthPos}
                scaleKmToScene={scaleKmToScene}
                states={states}
                controlsRef={controls}
              />
            </>
          )}
        </Suspense>

        <OrbitControls ref={controls} target={[earthPos.x, earthPos.y, earthPos.z]} />
      </Canvas>
    </div>
  );
}
