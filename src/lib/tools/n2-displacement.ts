/**
 * Nitrogen needed to displace the fluid in a well through coiled tubing.
 *
 * The coiled tubing is run to a depth and nitrogen is pumped until the column
 * down to that depth, the annulus and the tubing bore, is filled with gas. The
 * gas is taken at the mean pressure and temperature of the column and converted
 * to standard volumes with a volume factor; the tubing still on the reel is
 * filled at surface conditions. Standard volumes convert to liquid nitrogen and
 * to mass.
 *
 * - Pressure at depth balances the hydrostatic column of the well fluid; the
 *   surface pressure is that minus the weight of the nitrogen column, taken from
 *   a mean nitrogen density.
 * - Volume factor B = 2.8416·P/(Z·(273 + T)) in sm³/m³, with P in kPa and T in
 *   °C; the constant stands for standard conditions of about 15 °C and
 *   101.3 kPa.
 * - 1 m³ of liquid nitrogen gives 696.5 sm³ of gas and weighs 808 kg.
 *
 * Quantities are metric: lengths in m, diameters in mm, density in kg/m³,
 * temperature in °C, pressure in bar; volumes in m³, standard gas volumes in
 * sm³, liquid in litres and mass in kg. `units.ts` converts for the page.
 *
 * The check values in the tests are those of a reference worksheet. That sheet
 * counts the tubing bore twice in the volume filled with gas (it adds the bore
 * to the tubing volume minus the steel, which already contains it), so its
 * nitrogen is higher than this result by the bore volume times the factor.
 */

export interface N2Input {
  /** Coiled tubing on the reel, in total, m. */
  ctLength: number;
  /** Coiled tubing outside diameter, mm. */
  ctOd: number;
  /** Coiled tubing wall thickness, mm. */
  ctWall: number;
  /** Depth the nitrogen is pumped from, m. */
  depth: number;
  /** Production tubing outside diameter, mm. */
  tubingOd: number;
  /** Production tubing wall thickness, mm. */
  tubingWall: number;
  /** Density of the fluid in the well, kg/m³. */
  fluidDensity: number;
  /** Temperature at the depth, °C. */
  tempDepth: number;
  /** Temperature at the wellhead, °C. */
  tempSurface: number;
  /** Gas compressibility factor Z. */
  compressibility: number;
  /** Mean density of the nitrogen column, kg/m³. */
  nitrogenDensity: number;
}

export type N2Error = keyof N2Input;

export interface N2Result {
  /** Volume of the tubing bore per metre, L/m. */
  boreCapacity: number;
  /** Volume of the steel per metre, L/m. */
  steelVolume: number;
  /** Free volume per metre of the column (annulus and bore), L/m. */
  freeVolume: number;
  /** Pressure at depth, bar. */
  pressureDepth: number;
  /** Pressure at the wellhead, bar. */
  pressureSurface: number;
  /** Mean pressure of the column, bar. */
  pressureMean: number;
  /** Mean temperature of the column, °C. */
  tempMean: number;
  /** Volume factor at mean conditions and at the wellhead, sm³/m³. */
  factorMean: number;
  factorSurface: number;
  /** Volume of the column filled with gas, m³. */
  fillVolume: number;
  well: N2Amount;
  reel: N2Amount;
  total: N2Amount;
}

export interface N2Amount {
  /** Gas at standard conditions, sm³. */
  gas: number;
  /** As liquid nitrogen, L. */
  liquid: number;
  /** Mass, kg. */
  mass: number;
}

const GRAVITY = 9.81;
const GAS_PER_LIQUID = 696.5;
const LIQUID_DENSITY = 0.808;

export function validateN2Input(input: N2Input): N2Error[] {
  const errors: N2Error[] = [];
  const positive = (key: N2Error) => {
    if (!Number.isFinite(input[key]) || input[key] <= 0) errors.push(key);
  };
  (['ctLength', 'ctOd', 'ctWall', 'depth', 'tubingOd', 'tubingWall', 'fluidDensity', 'nitrogenDensity'] as const).forEach(
    positive
  );
  if (!errors.includes('ctOd') && !errors.includes('ctWall') && 2 * input.ctWall >= input.ctOd) errors.push('ctWall');
  if (!errors.includes('tubingOd') && !errors.includes('tubingWall') && 2 * input.tubingWall >= input.tubingOd) {
    errors.push('tubingWall');
  }
  if (!errors.includes('depth') && !errors.includes('ctLength') && input.depth > input.ctLength) errors.push('depth');
  // The coiled tubing has to fit inside the production tubing.
  if (
    !errors.includes('ctOd') &&
    !errors.includes('tubingOd') &&
    !errors.includes('tubingWall') &&
    input.ctOd >= input.tubingOd - 2 * input.tubingWall
  ) {
    errors.push('ctOd');
  }
  for (const key of ['tempDepth', 'tempSurface'] as const) {
    if (!Number.isFinite(input[key]) || input[key] <= -273) errors.push(key);
  }
  if (!Number.isFinite(input.compressibility) || input.compressibility < 0.2 || input.compressibility > 2) {
    errors.push('compressibility');
  }
  // The surface pressure must stay positive: the nitrogen column cannot weigh more than the fluid it displaces.
  if (!errors.includes('fluidDensity') && !errors.includes('nitrogenDensity') && input.nitrogenDensity >= input.fluidDensity) {
    errors.push('nitrogenDensity');
  }
  return errors;
}

/** Area of a circle of a diameter in mm, in L per metre of length. */
const litresPerMetre = (diameterMm: number) => (Math.PI * (diameterMm / 1000) ** 2) / 4 * 1000;

export function calculateN2Displacement(input: N2Input): N2Result {
  const { ctLength, depth, fluidDensity, nitrogenDensity, compressibility: z } = input;
  const boreCapacity = litresPerMetre(input.ctOd - 2 * input.ctWall);
  const steelVolume = litresPerMetre(input.ctOd) - boreCapacity;
  const tubingCapacity = litresPerMetre(input.tubingOd - 2 * input.tubingWall);
  // Annulus plus bore: the tubing volume minus the steel.
  const freeVolume = tubingCapacity - steelVolume;

  const pressureDepthKpa = (fluidDensity * GRAVITY * depth) / 1000;
  const pressureSurfaceKpa = pressureDepthKpa - (depth * nitrogenDensity * GRAVITY) / 1000;
  const pressureMeanKpa = (pressureDepthKpa + pressureSurfaceKpa) / 2;
  const tempMean = (input.tempDepth + input.tempSurface) / 2;
  const factor = (kpa: number, t: number) => (2.8416 * kpa) / (z * (273 + t));
  const factorMean = factor(pressureMeanKpa, tempMean);
  const factorSurface = factor(pressureSurfaceKpa, input.tempSurface);

  const amount = (gas: number): N2Amount => {
    const liquid = (gas * 1000) / GAS_PER_LIQUID;
    return { gas, liquid, mass: liquid * LIQUID_DENSITY };
  };
  const fillVolume = (freeVolume * depth) / 1000;
  const well = amount(fillVolume * factorMean);
  const reel = amount(((ctLength - depth) * boreCapacity * factorSurface) / 1000);

  return {
    boreCapacity,
    steelVolume,
    freeVolume,
    pressureDepth: pressureDepthKpa / 100,
    pressureSurface: pressureSurfaceKpa / 100,
    pressureMean: pressureMeanKpa / 100,
    tempMean,
    factorMean,
    factorSurface,
    fillVolume,
    well,
    reel,
    total: { gas: well.gas + reel.gas, liquid: well.liquid + reel.liquid, mass: well.mass + reel.mass },
  };
}
