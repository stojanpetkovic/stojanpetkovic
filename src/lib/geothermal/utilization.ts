/**
 * Heat from a thermal-water well: how much power a flow gives at a temperature, how a
 * cascade of users shares it, what a heat pump adds, how much a year yields, and what
 * investment that yield can carry. Plain formulas on plain numbers, so the project page
 * and the tests use the same ones.
 *
 * The reference temperature is 20 °C, as in the Geothermal Atlas of Vojvodina (2010),
 * whose thermal power per well is Q = m · (T − 20) · 0.004184 with m in kg per
 * 1,000 s (here: l/s and kW, which is the same arithmetic).
 */

/** Specific heat of the water, kJ/(kg·K). Mineralisation of a few g/l changes it by under 1 %. */
export const WATER_CP = 4.184;

/** Reference temperature of the atlas, °C. */
export const ATLAS_REFERENCE_TEMP = 20;

/** Thermal power of a flow cooled from `tIn` to `tOut`, kW. One litre of water is taken as one kilogram. */
export function thermalPowerKw(flowLs: number, tIn: number, tOut: number): number {
  return Math.max(0, flowLs * WATER_CP * (tIn - tOut));
}

/** Energy of a constant power over some full-load hours, MWh. */
export function annualEnergyMWh(powerKw: number, fullLoadHours: number): number {
  return (powerKw * fullLoadHours) / 1000;
}

/** Hours in a year the load runs, from a share of the year. */
export function hoursFromShare(share: number): number {
  return Math.round(8760 * Math.min(Math.max(share, 0), 1));
}

export interface CascadeStage {
  name: string;
  /** Water temperature leaving the stage, °C. */
  tOut: number;
}

export interface CascadeResult extends CascadeStage {
  tIn: number;
  powerKw: number;
  /** Share of the whole cascade's power, 0 to 1. */
  share: number;
}

/**
 * Water passes the users in order, each cooling it to its own outlet temperature. A stage
 * whose outlet is not below its inlet takes nothing and passes the water on unchanged.
 */
export function cascade(flowLs: number, tSource: number, stages: CascadeStage[]): CascadeResult[] {
  let t = tSource;
  const rows = stages.map((s) => {
    const tOut = Math.min(s.tOut, t);
    const row = { ...s, tOut, tIn: t, powerKw: thermalPowerKw(flowLs, t, tOut), share: 0 };
    t = tOut;
    return row;
  });
  const total = rows.reduce((sum, r) => sum + r.powerKw, 0);
  return rows.map((r) => ({ ...r, share: total > 0 ? r.powerKw / total : 0 }));
}

/**
 * Coefficient of performance of a heat pump taking heat from the water at `tSource` and
 * delivering it at `tSink`: a fraction of the Carnot value, capped at a realistic ceiling.
 * Real machines reach 40 to 55 % of Carnot; 50 % is a middle value.
 */
export function heatPumpCop(tSource: number, tSink: number, carnotShare = 0.5, cap = 8): number {
  const lift = tSink - tSource;
  if (lift <= 0) return cap;
  return Math.min(cap, (carnotShare * (tSink + 273.15)) / lift);
}

export interface HeatPumpResult {
  cop: number;
  /** Heat delivered to the user, kW. */
  heatKw: number;
  /** Electricity the pump takes, kW. */
  electricKw: number;
  /** Heat taken from the water, kW. */
  fromWaterKw: number;
}

/**
 * A heat pump cooling the water from `tIn` to `tOut` and delivering heat at `tSink`.
 * The heat taken from the water is Q_w; the pump delivers Q_w · COP / (COP − 1).
 */
export function heatPump(
  flowLs: number,
  tIn: number,
  tOut: number,
  tSink: number,
  carnotShare = 0.5,
): HeatPumpResult {
  const fromWaterKw = thermalPowerKw(flowLs, tIn, tOut);
  const cop = heatPumpCop((tIn + tOut) / 2, tSink, carnotShare);
  const heatKw = cop > 1 ? (fromWaterKw * cop) / (cop - 1) : fromWaterKw;
  return { cop, heatKw, electricKw: heatKw - fromWaterKw, fromWaterKw };
}

/** Present value of a yearly amount over some years at a discount rate, in the amount's unit. */
export function annuity(perYear: number, years: number, rate: number): number {
  if (rate === 0) return perYear * years;
  return (perYear * (1 - Math.pow(1 + rate, -years))) / rate;
}

/**
 * The most that can be invested and still be paid back: the yearly saving less the yearly
 * running cost, carried over the years at a discount rate.
 */
export function allowableInvestment(
  annualSaving: number,
  annualCost: number,
  years: number,
  rate: number,
): number {
  return Math.max(0, annuity(annualSaving - annualCost, years, rate));
}

/** Years to pay back an investment from a net yearly gain, without discounting. */
export function simplePayback(investment: number, netPerYear: number): number | null {
  return netPerYear > 0 ? investment / netPerYear : null;
}

/** Heat stored in a block of rock and the water in its pores above a reference temperature, J. */
export function storedHeat(o: {
  areaM2: number;
  thicknessM: number;
  porosity: number;
  tReservoir: number;
  tReference: number;
  rockDensity?: number;
  rockCp?: number;
  waterDensity?: number;
  waterCp?: number;
}): number {
  const rockRho = o.rockDensity ?? 2650;
  const rockCp = o.rockCp ?? 900;
  const waterRho = o.waterDensity ?? 1000;
  const waterCp = o.waterCp ?? 4184;
  const v = o.areaM2 * o.thicknessM;
  const dT = o.tReservoir - o.tReference;
  return ((1 - o.porosity) * rockRho * rockCp + o.porosity * waterRho * waterCp) * v * dT;
}

/** Average thermal power the recoverable part of a stored heat gives over a lifetime, MW. */
export function recoverablePowerMw(heatJ: number, recovery: number, years: number): number {
  return (heatJ * recovery) / (years * 365.25 * 86400) / 1e6;
}

/** Share of the cost of the first well that a later well in the same field costs: no more than 80 % by the fifth. */
export function learningFactor(wellNumber: number, fifthWell = 0.8): number {
  if (wellNumber <= 1) return 1;
  if (wellNumber >= 5) return fifthWell;
  return 1 - ((1 - fifthWell) * (wellNumber - 1)) / 4;
}

/** Wells needed for a number of successful ones, at a success rate (rounded up). */
export function wellsToDrill(successful: number, successRate: number): number {
  return Math.ceil(successful / successRate);
}

export interface ChainOptions {
  /** Outlet of the space-heating stage, °C. */
  heatingTo?: number;
  /** Outlet of the pool stage, °C. */
  poolTo?: number;
  /** Temperature the water is cooled to by the heat pump, and reinjected at, °C. */
  returnTo?: number;
  /** Temperature the heat pump delivers at, °C. */
  sinkTemp?: number;
  /** Share of the Carnot coefficient the pump reaches. */
  carnotShare?: number;
}

export interface Chain {
  heatingKw: number;
  poolKw: number;
  /** Heat from the pump, kW. */
  pumpKw: number;
  /** Electricity of the pump, kW. */
  electricKw: number;
  cop: number;
  /** Heat delivered to users, kW. */
  totalKw: number;
  /** Thermal power of the flow above the atlas reference of 20 °C, kW. */
  atlasKw: number;
}

/**
 * The use of one flow in a fixed order: space heating, then pools, then a heat pump that
 * takes what is left down to the return temperature. A stage the water is too cool for
 * takes nothing, so a 33 °C well heats pools a little and leaves the rest to the pump.
 */
export function heatChain(flowLs: number, tSource: number, o: ChainOptions = {}): Chain {
  const heatingTo = o.heatingTo ?? 35;
  const poolTo = o.poolTo ?? 28;
  const returnTo = o.returnTo ?? 15;
  const stages = cascade(flowLs, tSource, [
    { name: 'heating', tOut: heatingTo },
    { name: 'pools', tOut: poolTo },
  ]);
  const tAfter = stages[1].tOut;
  const pump = heatPump(
    flowLs,
    tAfter,
    Math.min(returnTo, tAfter),
    o.sinkTemp ?? 45,
    o.carnotShare ?? 0.4,
  );
  const pumpHeat = tAfter > returnTo ? pump.heatKw : 0;
  const electric = tAfter > returnTo ? pump.electricKw : 0;
  return {
    heatingKw: stages[0].powerKw,
    poolKw: stages[1].powerKw,
    pumpKw: pumpHeat,
    electricKw: electric,
    cop: pump.cop,
    totalKw: stages[0].powerKw + stages[1].powerKw + pumpHeat,
    atlasKw: thermalPowerKw(flowLs, tSource, ATLAS_REFERENCE_TEMP),
  };
}

/** Lower heating value of methane, kWh per m³ at normal conditions. */
export const METHANE_KWH_PER_M3 = 9.94;

export interface DissolvedGas {
  /** Gas released over the year, m³. */
  gasM3: number;
  /** Energy in the methane of that gas, MWh. */
  energyMWh: number;
}

/**
 * Gas released from the water: the flow over the hours it runs, times the gas the water
 * holds per m³ (the atlas gives 0.04 to 2.2 m³/m³ for Vojvodina), of which the methane
 * share burns. A well's own gas content has to be measured.
 */
export function dissolvedGas(
  flowLs: number,
  hours: number,
  ratio: number,
  methaneShare = 0.9,
): DissolvedGas {
  const gasM3 = (flowLs / 1000) * hours * 3600 * ratio;
  return { gasM3, energyMWh: (gasM3 * methaneShare * METHANE_KWH_PER_M3) / 1000 };
}

export interface BalanceInputs {
  /** Hours a year the load runs at full power. */
  hours: number;
  /** Value of the heat replaced, €/MWh. */
  heatValue: number;
  /** Price of electricity, €/MWh. */
  electricPrice: number;
  /** The investment, €, on which upkeep is a yearly share. */
  investment: number;
  /** Upkeep of wells, pipe and equipment, share of the investment a year. */
  upkeepShare: number;
  /** Other fixed costs a year (monitoring, water analyses, attendance), €. */
  otherFixed: number;
  /** Energy of the gas used, MWh a year (0 where the gas is not used). */
  gasMWh: number;
  /** Value of the gas, €/MWh: the fuel it replaces. */
  gasValue: number;
}

export interface Balance {
  heatMWh: number;
  electricMWh: number;
  revenueHeat: number;
  revenueGas: number;
  /** Electricity of the heat pump, upkeep and other fixed costs, €/year. */
  opexElectric: number;
  opexUpkeep: number;
  opexOther: number;
  opex: number;
  /** Revenue less operating costs, €/year. */
  netPerYear: number;
}

/**
 * A year of operation: the heat (and the gas) replaced as revenue, against the electricity
 * of the heat pump, upkeep and other fixed costs.
 */
export function yearBalance(chain: Chain, o: BalanceInputs): Balance {
  const heatMWh = annualEnergyMWh(chain.totalKw, o.hours);
  const electricMWh = annualEnergyMWh(chain.electricKw, o.hours);
  const revenueHeat = heatMWh * o.heatValue;
  const revenueGas = o.gasMWh * o.gasValue;
  const opexElectric = electricMWh * o.electricPrice;
  const opexUpkeep = o.investment * o.upkeepShare;
  const opexOther = o.otherFixed;
  const opex = opexElectric + opexUpkeep + opexOther;
  return {
    heatMWh,
    electricMWh,
    revenueHeat,
    revenueGas,
    opexElectric,
    opexUpkeep,
    opexOther,
    opex,
    netPerYear: revenueHeat + revenueGas - opex,
  };
}

/** AACE class 4 estimate: the cost may fall as much as 30 % below and rise as much as 50 % above the estimate. */
export const CLASS4_RANGE = { low: 0.7, high: 1.5 };

export interface CostInputs {
  /** New wells to drill (0 where the existing well is used). */
  newWells: number;
  /** Depth of each new well, m. */
  depthM: number;
  /** Drilling cost, € per metre. */
  drillingPerM: number;
  /** Workover of the existing well, €. Zero until it has been assessed. */
  workover: number;
  /** Heat pump, € per kW of heat delivered. */
  heatPumpPerKw: number;
  /** Heat delivered by the pump, kW. */
  pumpKw: number;
  /** Length of distribution pipe, m. */
  pipelineM: number;
  /** Pipe laid, € per metre. */
  pipelinePerM: number;
  /** Surface equipment for using the heat (exchangers, pumps), €. */
  equipment: number;
  /** Wells that return the cooled water to the reservoir, drilled at the same cost per metre. */
  reinjectionWells?: number;
  /** Depth of each reinjection well, m. */
  reinjectionDepthM?: number;
  /**
   * Share of new wells that find the water. Below 1 the drilling is the expected cost: the
   * wells that fail are paid for too, so one successful well costs 1 / successRate wells.
   */
  successRate?: number;
}

export interface Investment {
  wells: number;
  reinjection: number;
  workover: number;
  heatPump: number;
  pipeline: number;
  equipment: number;
  /** Sum of the items, €. */
  total: number;
  /** The estimate at the low and high end of an AACE class 4 estimate, €. */
  low: number;
  high: number;
}

/** What the system costs to build: the items, their sum and the class 4 range around it. */
export function investmentEstimate(c: CostInputs): Investment {
  const wells = (c.newWells / (c.successRate ?? 1)) * c.depthM * c.drillingPerM;
  const reinjection = (c.reinjectionWells ?? 0) * (c.reinjectionDepthM ?? 0) * c.drillingPerM;
  const heatPump = c.pumpKw * c.heatPumpPerKw;
  const pipeline = c.pipelineM * c.pipelinePerM;
  const total = wells + reinjection + c.workover + heatPump + pipeline + c.equipment;
  return {
    wells,
    reinjection,
    workover: c.workover,
    heatPump,
    pipeline,
    equipment: c.equipment,
    total,
    low: total * CLASS4_RANGE.low,
    high: total * CLASS4_RANGE.high,
  };
}
