export default function useVerticalHydroReal(config = {}) {
  const C = {
    rho: 998.2,
    g: 9.81,
    P_surface: 101325,
    astronautMass: 78,
    suitMass: 127,
    equipmentMass: 6,
    ballastStepKg: 1,
    rigidVolume: 0.195,
    bcGasLitersSurface: 25.0,
    lungTidalLiters: 0.6,
    lungReserveLiters: 2.0,
    breathHz: 0.25,
    breathVar: 0.05,
    breathAmplitudeScaleNeutral: 1.0,
    breathAmplitudeScaleMoving: 0.55,
    Cd_vert: 1.0,
    A_vert: 0.35,
    Ca_vert: 0.18,
    waterSurfaceY: 6.0,
    metersPerWorldUnit: 1.0,
    poolDepthMeters: 12.2,
    minYPadding: 0.25,
    maxYPadding: 0.25,
    microCurrentN: 0.08,
    floorNudge: 0.02,
    neutralForceN: 1.5,
    neutralSpeedEPS: 0.02,
    neutralTrimN: 0.0,
  };
  Object.assign(C, config || {});

  function stepY({ dt, y, vy, weightCount, bounds, speedXZ = 0, t = 0 }) {
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;

    const surfaceY_world = C.waterSurfaceY ?? y + 5;
    const depthWorld = Math.max(0, surfaceY_world - y);
    const depthMeters = Math.min(depthWorld * C.metersPerWorldUnit, C.poolDepthMeters);
    const P = C.P_surface + C.rho * C.g * depthMeters;

    const totalMass =
      C.astronautMass + C.suitMass + C.equipmentMass + Math.max(-10, weightCount) * C.ballastStepKg;

    const V_bc = (C.bcGasLitersSurface / 1000) * (C.P_surface / P);
    const freq = C.breathHz * (1 + C.breathVar * (Math.sin(t * 0.13) - 0.5));
    const ampScale = speedXZ < 0.15 ? C.breathAmplitudeScaleNeutral : C.breathAmplitudeScaleMoving;
    const V_lung =
      ((C.lungTidalLiters * 0.5 * (1 + Math.sin(2 * Math.PI * freq * t)) + 0.15 * C.lungReserveLiters * Math.random()) /
        1000) *
      ampScale *
      (C.P_surface / P);

    const V_displaced = C.rigidVolume + V_bc + V_lung;

    const buoyancyN = C.rho * C.g * V_displaced;
    const weightN = totalMass * C.g;

    const addedMass = C.Ca_vert * C.rho * C.rigidVolume;
    const m_eff_y = Math.max(1e-6, totalMass + addedMass);
    const dragN = 0.5 * C.rho * C.Cd_vert * C.A_vert * Math.abs(vy) * vy;
    const microN = C.microCurrentN * Math.sin(0.7 * t) * 0.2;

    const Fnet = buoyancyN - weightN - dragN + microN + C.neutralTrimN;

    let newVy = vy + (Fnet / m_eff_y) * dt;

    if (Math.abs(newVy) < C.neutralSpeedEPS && Math.abs(buoyancyN - weightN + C.neutralTrimN) < C.neutralForceN) {
      newVy *= 0.3;
    }

    let newY = y + newVy * dt;

    const minY = bounds?.minY ?? 1.75;
    const maxY = bounds?.maxY ?? 12.0;

    if (newY < minY) {
      newY = minY;
      newVy = 0;
    }
    if (newY > maxY) {
      newY = maxY;
      newVy = 0;
    }

    return { newY, newVy, Fnet, buoyancyN, weightN, totalMass, depth: depthMeters, P };
  }

  return { stepY, C };
}
