import * as THREE from "three";
import { useRef } from "react";

export default function useHydroMovementReal(params = {}) {
  const {
    rho = 1000,
    mass = 114,
    vol = 0.09,
    Cd_fwd = 0.2,
    Afwd = 0.35,
    Cd_side = 0.3,
    Aside = 0.55,
    Ca_fwd = 0.15,
    Ca_side = 0.25,
    thrustN = 200,
    accelBoost = 1.6,
    thrustRiseTau = 0.08,
    current = {
      base: 0.12,
      gust: 0.1,
      freq: 0.03,
      noiseScale: 0.18,
      wallDampenDist: 1.0,
    },
    turnDampK = 0.6,
    vmax_fwd = 10.0,
    vmax_side = 6.0,
    deadband_v = 0.015,
  } = params;

  const velXZ = useRef(new THREE.Vector2(0, 0));
  const thrustState = useRef(0);
  const prevDir = useRef(new THREE.Vector3(0, 0, -1));

  const V3_fwd = new THREE.Vector3();
  const V3_right = new THREE.Vector3();
  const V2_cur = new THREE.Vector2();
  const V2_rel = new THREE.Vector2();

  function hash(n) {
    const s = Math.sin(n) * 43758.5453;
    return s - Math.floor(s);
  }
  function noise2D(x, y) {
    const xi = Math.floor(x),
      yi = Math.floor(y);
    const xf = x - xi,
      yf = y - yi;
    const s = hash(xi * 53.13 + yi * 91.17);
    const t = hash((xi + 1) * 53.13 + yi * 91.17);
    const u = hash(xi * 53.13 + (yi + 1) * 91.17);
    const v_ = hash((xi + 1) * 53.13 + (yi + 1) * 91.17);
    const sx = xf * xf * (3 - 2 * xf);
    const sy = yf * yf * (3 - 2 * yf);
    return s + (t - s) * sx + (u + (v_ - u) * sx - (s + (t - s) * sx)) * sy;
  }
  function smoothstep(edge0, edge1, x) {
    const t = Math.min(
      1,
      Math.max(0, (x - edge0) / Math.max(1e-6, edge1 - edge0))
    );
    return t * t * (3 - 2 * t);
  }
  function currentAt(x, z, t, bounds) {
    const ns = current.noiseScale,
      base = current.base;
    const gust = current.gust * Math.sin(2 * Math.PI * current.freq * t + 1.3);
    const ang = noise2D(x * ns, z * ns) * Math.PI * 2;
    const dirx = Math.cos(ang),
      dirz = Math.sin(ang);
    let wall = 1.0;
    if (bounds?.box instanceof THREE.Box3) {
      const dx = Math.min(x - bounds.box.min.x, bounds.box.max.x - x);
      const dz = Math.min(z - bounds.box.min.z, bounds.box.max.z - z);
      const d = Math.max(0, Math.min(dx, dz));
      const R = current.wallDampenDist ?? 1.0;
      wall = smoothstep(0.0, R, d);
      wall = Math.max(0.08, wall);
    }
    const swirl =
      0.07 * (noise2D((x + 37.2) * ns * 0.7, (z - 12.8) * ns * 0.7) - 0.5);
    V2_cur.set(
      (base + gust) * dirx - swirl * dirz,
      (base + gust) * dirz + swirl * dirx
    ).multiplyScalar(wall);
    return V2_cur;
  }
  function emaUpdate(prev, target, dt, tau) {
    const a = 1 - Math.exp(-dt / Math.max(1e-6, tau));
    return prev + (target - prev) * a;
  }

  function step({ dt, camera, moveKeys, effMass, bounds }) {
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;

    camera.getWorldDirection(V3_fwd).setY(0);
    if (V3_fwd.lengthSq() < 1e-8) V3_fwd.set(0, 0, -1);
    V3_fwd.normalize();
    V3_right.copy(V3_fwd).cross(new THREE.Vector3(0, 1, 0)).normalize();
    const fwdX = V3_fwd.x,
      fwdZ = V3_fwd.z;

    let cmd_fwd = 0,
      cmd_side = 0;
    if (moveKeys["KeyW"] || moveKeys["ArrowUp"]) cmd_fwd += 1;
    if (moveKeys["KeyS"] || moveKeys["ArrowDown"]) cmd_fwd -= 1;
    if (moveKeys["KeyA"] || moveKeys["ArrowLeft"]) cmd_side -= 1;
    if (moveKeys["KeyD"] || moveKeys["ArrowRight"]) cmd_side += 1;
    const hasInput = cmd_fwd !== 0 || cmd_side !== 0;

    const cmd = hasInput
      ? thrustN * (moveKeys["ShiftLeft"] ? accelBoost : 1)
      : 0;
    thrustState.current = emaUpdate(
      thrustState.current,
      cmd,
      dt,
      thrustRiseTau
    );

    const t =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) *
      0.001;
    const cur = currentAt(camera.position.x, camera.position.z, t, bounds);

    const v = velXZ.current;
    V2_rel.set(v.x - cur.x, v.y - cur.y);

    const v_fwd = V2_rel.x * fwdX + V2_rel.y * fwdZ;
    const v_side = V2_rel.x * -fwdZ + V2_rel.y * fwdX;

    const d = prevDir.current;
    const dot = Math.max(-1, Math.min(1, d.dot(V3_fwd)));
    const ang = Math.acos(dot);
    d.lerp(V3_fwd, 0.6);
    const yawRate = ang / Math.max(1e-6, dt);
    const turnFactor = 1 + turnDampK * yawRate;

    const drag_f =
      0.5 * rho * Cd_fwd * Afwd * Math.abs(v_fwd) * v_fwd * turnFactor;
    const drag_s =
      0.5 * rho * Cd_side * Aside * Math.abs(v_side) * v_side * turnFactor;

    const mEff = Math.max(1e-6, effMass ?? mass);
    const m_eff_f = mEff + Ca_fwd * rho * vol;
    const m_eff_s = mEff + Ca_side * rho * vol;

    const F_thr_f = thrustState.current * cmd_fwd;
    const F_thr_s = thrustState.current * cmd_side;

    const a_f = (F_thr_f - drag_f) / m_eff_f;
    const a_s = (F_thr_s - drag_s) / m_eff_s;

    v.x += (a_f * fwdX + a_s * -fwdZ) * dt;
    v.y += (a_f * fwdZ + a_s * fwdX) * dt;

    const vF = v.x * fwdX + v.y * fwdZ;
    const vS = v.x * -fwdZ + v.y * fwdX;
    const cF = Math.min(Math.max(vF, -vmax_fwd), vmax_fwd);
    const cS = Math.min(Math.max(vS, -vmax_side), vmax_side);
    v.set(cF * fwdX + cS * -fwdZ, cF * fwdZ + cS * fwdX);

    if (Math.hypot(v.x, v.y) < deadband_v) v.set(0, 0);

    return new THREE.Vector2(v.x * dt, v.y * dt);
  }

  function getVelocity() {
    return velXZ.current.clone();
  }

  return { step, velXZ, getVelocity };
}
