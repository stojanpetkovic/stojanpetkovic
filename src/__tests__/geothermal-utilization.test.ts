import { describe, expect, it } from 'vitest';
import {
  allowableInvestment,
  annualEnergyMWh,
  annuity,
  cascade,
  heatPump,
  heatPumpCop,
  heatChain,
  hoursFromShare,
  investmentEstimate,
  learningFactor,
  recoverablePowerMw,
  simplePayback,
  storedHeat,
  thermalPowerKw,
  wellsToDrill,
  yearBalance,
  dissolvedGas,
} from '@/lib/geothermal/utilization';

describe('thermal power', () => {
  it('reproduces the atlas figure for Melenci: 10.3 l/s at 33 °C is 0.560 MWt', () => {
    expect(thermalPowerKw(10.3, 33, 20)).toBeCloseTo(560.2, 1);
  });

  it('scales with the flow and the temperature drop, and is never negative', () => {
    expect(thermalPowerKw(6.9, 33, 20)).toBeCloseTo(375.3, 1);
    expect(thermalPowerKw(10, 50, 20)).toBeCloseTo(2 * thermalPowerKw(10, 35, 20), 6);
    expect(thermalPowerKw(10, 20, 30)).toBe(0);
  });

  it('turns power into energy over full-load hours', () => {
    expect(annualEnergyMWh(560.2, 4380)).toBeCloseTo(2453.7, 1);
    expect(hoursFromShare(0.5)).toBe(4380);
    expect(hoursFromShare(2)).toBe(8760);
  });
});

describe('cascade', () => {
  const rows = cascade(10, 60, [
    { name: 'a', tOut: 45 },
    { name: 'b', tOut: 30 },
    { name: 'c', tOut: 35 },
  ]);

  it('hands the water on from one stage to the next', () => {
    expect(rows.map((r) => [r.tIn, r.tOut])).toEqual([
      [60, 45],
      [45, 30],
      [30, 30],
    ]);
  });

  it('shares add up to one and a stage that cannot cool the water takes nothing', () => {
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 9);
    expect(rows[2].powerKw).toBe(0);
    expect(rows[0].powerKw + rows[1].powerKw).toBeCloseTo(thermalPowerKw(10, 60, 30), 6);
  });
});

describe('heat pump', () => {
  it('has a coefficient of half the Carnot value, capped', () => {
    expect(heatPumpCop(24, 45, 0.5)).toBeCloseTo((0.5 * 318.15) / 21, 6);
    expect(heatPumpCop(44, 45, 0.5)).toBe(8);
    expect(heatPumpCop(50, 45)).toBe(8);
  });

  it('delivers the heat from the water plus the electricity it takes', () => {
    const r = heatPump(10, 33, 15, 45);
    expect(r.fromWaterKw).toBeCloseTo(thermalPowerKw(10, 33, 15), 6);
    expect(r.heatKw).toBeCloseTo(r.fromWaterKw + r.electricKw, 6);
    expect(r.heatKw / r.electricKw).toBeCloseTo(r.cop, 6);
  });
});

describe('money', () => {
  it('discounts a yearly amount over the years', () => {
    expect(annuity(100, 10, 0.05)).toBeCloseTo(772.17, 2);
    expect(annuity(100, 10, 0)).toBe(1000);
  });

  it('carries only the net saving, and nothing when running costs eat it', () => {
    expect(allowableInvestment(150, 50, 10, 0.05)).toBeCloseTo(772.17, 2);
    expect(allowableInvestment(40, 50, 10, 0.05)).toBe(0);
    expect(simplePayback(500, 100)).toBe(5);
    expect(simplePayback(500, 0)).toBeNull();
  });
});

describe('reservoir and wells', () => {
  it('stores the heat of rock and water above the reference temperature', () => {
    const e = storedHeat({
      areaM2: 1e6,
      thicknessM: 100,
      porosity: 0.2,
      tReservoir: 70,
      tReference: 20,
    });
    expect(e).toBeCloseTo(1.3724e16, -12);
    expect(recoverablePowerMw(e, 0.25, 30)).toBeCloseTo(3.62, 2);
  });

  it('lets the fifth well of a field cost 80 % of the first', () => {
    expect(learningFactor(1)).toBe(1);
    expect(learningFactor(3)).toBeCloseTo(0.9, 9);
    expect(learningFactor(9)).toBe(0.8);
  });

  it('drills enough wells for a success rate', () => {
    expect(wellsToDrill(6, 0.7)).toBe(9);
    expect(wellsToDrill(1, 0.7)).toBe(2);
  });
});

describe('chain of uses', () => {
  it('heats pools from a 33 °C well and leaves the rest to the pump', () => {
    const c = heatChain(10.3, 33);
    expect(c.heatingKw).toBe(0);
    expect(c.poolKw).toBeCloseTo(thermalPowerKw(10.3, 33, 28), 6);
    expect(c.pumpKw).toBeGreaterThan(0);
    expect(c.totalKw).toBeCloseTo(c.poolKw + c.pumpKw, 6);
    expect(c.atlasKw).toBeCloseTo(560.2, 1);
  });

  it('takes all heat above the return temperature, plus the pump electricity, from a hot well', () => {
    const c = heatChain(8, 75);
    // Heat delivered is the heat taken from the water down to 15 °C plus the pump's electricity.
    expect(c.totalKw).toBeCloseTo(thermalPowerKw(8, 75, 15) + c.electricKw, 6);
  });

  it('gives no pump heat when the water is already at the return temperature', () => {
    const c = heatChain(5, 15);
    expect(c.totalKw).toBe(0);
    expect(c.electricKw).toBe(0);
  });

  it('balances a year: heat and gas against electricity, upkeep and fixed costs', () => {
    const chain = heatChain(8, 75);
    const o = {
      hours: 4000,
      heatValue: 80,
      electricPrice: 100,
      investment: 1000000,
      upkeepShare: 0.03,
      otherFixed: 10000,
      gasMWh: 0,
      gasValue: 35,
    };
    const b = yearBalance(chain, o);
    expect(b.heatMWh).toBeCloseTo((chain.totalKw * 4000) / 1000, 6);
    expect(b.opexUpkeep).toBe(30000);
    expect(b.opex).toBeCloseTo(b.electricMWh * 100 + 30000 + 10000, 6);
    expect(b.netPerYear).toBeCloseTo(b.heatMWh * 80 - b.opex, 6);
    // The gas moves the balance by its own value.
    const withGas = yearBalance(chain, { ...o, gasMWh: 100 });
    expect(withGas.netPerYear - b.netPerYear).toBeCloseTo(3500, 6);
  });
});

describe('investment', () => {
  const base = {
    newWells: 2,
    depthM: 1300,
    drillingPerM: 400,
    workover: 0,
    heatPumpPerKw: 500,
    pumpKw: 534,
    pipelineM: 500,
    pipelinePerM: 400,
    equipment: 200000,
  };

  it('sums wells, workover, pump, pipe and equipment', () => {
    const inv = investmentEstimate({ ...base, workover: 50000 });
    expect(inv.wells).toBe(1040000);
    expect(inv.heatPump).toBe(267000);
    expect(inv.pipeline).toBe(200000);
    expect(inv.total).toBe(1040000 + 50000 + 267000 + 200000 + 200000);
  });

  it('costs nothing for wells when the existing well is used', () => {
    expect(investmentEstimate({ ...base, newWells: 0 }).wells).toBe(0);
  });

  it('drills a reinjection well at the same cost per metre', () => {
    const inv = investmentEstimate({ ...base, reinjectionWells: 1, reinjectionDepthM: 560 });
    expect(inv.reinjection).toBe(560 * 400);
    expect(inv.total).toBe(investmentEstimate(base).total + 560 * 400);
    expect(investmentEstimate(base).reinjection).toBe(0);
  });

  it('pays for the wells that fail at a success rate below one', () => {
    const inv = investmentEstimate({ ...base, successRate: 0.7 });
    expect(inv.wells).toBeCloseTo(1040000 / 0.7, 6);
    expect(investmentEstimate({ ...base, newWells: 0, successRate: 0.7 }).wells).toBe(0);
  });

  it('brackets the estimate with the class 4 range', () => {
    const inv = investmentEstimate(base);
    expect(inv.low).toBeCloseTo(inv.total * 0.7, 6);
    expect(inv.high).toBeCloseTo(inv.total * 1.5, 6);
  });

  it('pays back in years from the estimate and the net gain', () => {
    const inv = investmentEstimate({ ...base, newWells: 0 });
    expect(simplePayback(inv.total, 100000)).toBeCloseTo(inv.total / 100000, 9);
  });
});

describe('gas', () => {
  it('releases the gas of the water and counts the methane that burns', () => {
    const g = dissolvedGas(6.9, 4000, 0.04);
    expect(g.gasM3).toBeCloseTo(3974.4, 1);
    expect(g.energyMWh).toBeCloseTo((3974.4 * 0.9 * 9.94) / 1000, 3);
    expect(dissolvedGas(6.9, 4000, 0).energyMWh).toBe(0);
  });
});

describe('payback of a generic new well (the conclusion of the Melenci page)', () => {
  // One new well to the depth where the rock is 4 °C above the water, the page's costs and upkeep.
  const payback = (temp: number, flow: number, heatValue: number) => {
    const depthM = Math.round((temp + 4 - 11) / 0.0525 / 50) * 50;
    const chain = heatChain(flow, temp);
    const inv = investmentEstimate({
      newWells: 1,
      depthM,
      drillingPerM: 400,
      workover: 0,
      heatPumpPerKw: 500,
      pumpKw: chain.pumpKw,
      pipelineM: 500,
      pipelinePerM: 400,
      equipment: 200000,
    });
    const b = yearBalance(chain, {
      hours: 4000,
      heatValue,
      electricPrice: 130,
      investment: inv.total,
      upkeepShare: 0.03,
      otherFixed: 10000,
      gasMWh: 0,
      gasValue: 35,
    });
    return simplePayback(inv.total, b.netPerYear);
  };

  it('pays clearly where the heat replaces electricity, except for the coolest, weakest well', () => {
    for (const temp of [35, 50, 65, 80]) {
      for (const flow of [3, 5, 10, 20]) {
        const years = payback(temp, flow, 130)!;
        if (temp === 35 && flow === 3) expect(years).toBeGreaterThan(5);
        else expect(years).toBeLessThanOrEqual(5);
      }
    }
  });

  it('pays clearly against gas only for hot water at a large flow', () => {
    expect(payback(80, 10, 40)!).toBeLessThan(5);
    expect(payback(65, 10, 40)!).toBeLessThan(5);
    expect(payback(50, 20, 40)!).toBeLessThan(5);
    expect(payback(65, 5, 40)!).toBeGreaterThan(5);
    expect(payback(65, 5, 40)!).toBeLessThan(10);
    expect(payback(35, 5, 40)!).toBeGreaterThan(10);
    expect(payback(50, 3, 40)!).toBeGreaterThan(10);
  });

  it('pays sooner the hotter the water and the larger the flow', () => {
    expect(payback(80, 10, 85)!).toBeLessThan(payback(50, 10, 85)!);
    expect(payback(65, 20, 85)!).toBeLessThan(payback(65, 5, 85)!);
  });
});
