export const G=9.81
export const RHO=996.5
export const NASA={MALE_MASS_KG:82.9,EMU_ISS_WITH_SAFER_KG:145.0}
export function buildEmuNblConfig(o={}){
  const astronautMass=o.astronautMass??NASA.MALE_MASS_KG
  const suitMass=o.suitMass??NASA.EMU_ISS_WITH_SAFER_KG
  const equipmentMass=o.equipmentMass??0
  const ballastKg=o.ballastKg??0
  const ballastStepKg=o.ballastStepKg??1
  const rho=o.rho??RHO
  const g=o.g??G
  const rigidVolume=o.rigidVolume??(astronautMass+suitMass)/rho
  return{
    mode:"EMU_NBL",
    rho,g,
    astronautMass,suitMass,equipmentMass,
    ballastKg,ballastStepKg,
    rigidVolume,
    Cd_vert:1.0,
    A_vert:0.35,
    Ca_vert:0.18,
    linearDamp:12
  }
}
