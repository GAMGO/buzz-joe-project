export const HYDRO_CONFIG = {
  // ───────────────────────────────
  // 🌊 유체 기본 상수
  // ───────────────────────────────
  rho: 998.2, // 물의 밀도 (kg/m³)
  g: 9.81,

  // ───────────────────────────────
  // 🚀 수평 이동 (HydroMovement)
  // ───────────────────────────────
  mass: 114,
  vol: 0.09,
  Cd_fwd: 0.9,
  Afwd: 0.35,
  Cd_side: 1.2,
  Aside: 0.55,
  Ca_fwd: 0.15,
  Ca_side: 0.25,
  thrustN: 200, // ← 움직임 강화
  accelBoost: 1.6,
  thrustRiseTau: 0.05, // ← 반응성 향상
  deadband_v: 0.001, // ← 미세 속도도 감지
  current: {
    base: 0.12,
    gust: 0.1,
    freq: 0.03,
    noiseScale: 0.18,
    wallDampenDist: 1.0,
  },
  turnDampK: 0.6,
  vmax_fwd: 1.5,
  vmax_side: 1.1,

  // ───────────────────────────────
  // 🧍 수직 이동 (VerticalHydro)
  // ───────────────────────────────
  astronautMass: 78,
  suitMass: 127,
  equipmentMass: 6,
  ballastKg: -5,
  ballastStepKg: 1,
  rigidVolume: 0.195,
  bcGasLitersSurface: 25.0,
  lungTidalLiters: 0.6,
  lungReserveLiters: 2.0,
  P_surface: 101325,
  waterSurfaceY: 6.0,
  poolDepthMeters: 12.2,
  metersPerWorldUnit: 1.0,
  depthMax: 12.2,
  neutralForceN: 3.0,
  neutralSpeedEPS: 0.01,
  Cd_vert: 1.0,
  A_vert: 0.35,
  Ca_vert: 0.18,
  microCurrentN: 0.08,
};
