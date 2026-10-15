/**
 * Nitrogen needed to bring a vessel up to a pressure.
 *
 * The gas that has to be added is the vessel volume times the difference of the
 * nitrogen volume factors at the final and the initial pressure, at the vessel
 * temperature. Pressures are gauge: a vessel at atmospheric pressure is at 0.
 * The volume factor, the liquid nitrogen and the mass follow the Nitrogen
 * Displacement tool (`n2-displacement.ts`).
 *
 * Quantities are metric: volume in m³, pressure in bar (gauge), temperature in
 * °C; gas in sm³, liquid in litres and mass in kg.
 */
import { nitrogenAmount, nitrogenVolumeFactor, type N2Amount } from './n2-displacement';

export interface VesselInput {
  /** Vessel volume, m³. */
  volume: number;
  /** Pressure the vessel is raised to, bar gauge. */
  pressure: number;
  /** Pressure the vessel starts at, bar gauge; 0 for an empty vessel at atmospheric pressure. */
  initialPressure: number;
  /** Temperature of the gas in the vessel, °C. */
  temperature: number;
  /** Gas compressibility factor Z. */
  compressibility: number;
}

export type VesselError = keyof VesselInput;

export interface VesselResult extends N2Amount {
  /** Volume factor at the final pressure, sm³/m³. */
  factor: number;
  /** Gas in the vessel at the final pressure, sm³. */
  gasInVessel: number;
}

export function validateVesselInput(input: VesselInput): VesselError[] {
  const errors: VesselError[] = [];
  if (!Number.isFinite(input.volume) || input.volume <= 0) errors.push('volume');
  if (!Number.isFinite(input.pressure) || input.pressure <= 0) errors.push('pressure');
  if (!Number.isFinite(input.initialPressure) || input.initialPressure < 0) errors.push('initialPressure');
  if (
    !errors.includes('pressure') &&
    !errors.includes('initialPressure') &&
    input.initialPressure >= input.pressure
  ) {
    errors.push('initialPressure');
  }
  if (!Number.isFinite(input.temperature) || input.temperature <= -273) errors.push('temperature');
  if (!Number.isFinite(input.compressibility) || input.compressibility < 0.2 || input.compressibility > 2) {
    errors.push('compressibility');
  }
  return errors;
}

export function calculateVessel(input: VesselInput): VesselResult {
  const { volume, pressure, initialPressure, temperature, compressibility: z } = input;
  const factor = nitrogenVolumeFactor(pressure * 100, temperature, z);
  const initialFactor = nitrogenVolumeFactor(initialPressure * 100, temperature, z);
  return {
    ...nitrogenAmount(volume * (factor - initialFactor)),
    factor,
    gasInVessel: volume * factor,
  };
}
