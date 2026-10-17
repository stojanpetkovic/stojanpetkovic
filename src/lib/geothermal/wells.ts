/**
 * Hydrothermal wells of Vojvodina, transcribed from "Mogućnosti korišćenja
 * energetskog potencijala geotermalnih voda u AP Vojvodini", Prilog 1
 * (Institut za energetiku, procesnu tehniku i zaštitu okoline, 2005), published
 * by the Provincial Secretariat for Energy and Mineral Resources.
 *
 * What the annex gives per well: settlement, designation, year, total depth,
 * screened interval, water temperature, optimal yield and mineralisation. It
 * gives no coordinates, no wellhead elevation and no temperature log, so:
 *   - position is the centre of the settlement (`SETTLEMENTS`), not the well;
 *   - there is one temperature per tested interval, not a profile.
 */

/** Table of the annex the well is listed in. */
export type WellStatus = 'producing' | 'idle' | 'untapped';

export interface WellTest {
  /** Screened interval, metres below surface. Absent where the annex gives none. */
  top?: number;
  bottom?: number;
  /** Water temperature given in the annex, °C: the water as it leaves the well, so cooler than the rock. */
  temp: number;
  /** Optimal yield for this interval, l/s. */
  flow: number;
  /** Total mineralisation, g/l. */
  minerals?: number;
}

export interface Well {
  /** Designation in the annex, e.g. "Bč-2/H". */
  id: string;
  /** Settlement key into `SETTLEMENTS`. */
  place: string;
  status: WellStatus;
  year: number;
  /** Total depth, metres. */
  depth: number;
  tests: WellTest[];
}

export interface Settlement {
  name: string;
  lat: number;
  lon: number;
}

/**
 * Settlement centres, WGS84. Taken from Wikidata (P625); Bačko Karađorđevo from
 * Wikipedia (Karađorđevo, Bačka Palanka). Where Wikidata held several entries
 * for a name, the one for the village or town itself was used.
 */
export const SETTLEMENTS: Record<string, Settlement> = {
  alibunar: { name: 'Alibunar', lat: 45.0808, lon: 20.9658 },
  backoKarađorđevo: { name: 'Bačko Karađorđevo', lat: 45.2917, lon: 19.3031 },
  banatskoVelikoSelo: {
    name: 'Banatsko Veliko Selo',
    lat: 45.8272,
    lon: 20.5992,
  },
  becej: { name: 'Bečej', lat: 45.6167, lon: 20.0333 },
  backiPetrovac: { name: 'Bački Petrovac', lat: 45.3564, lon: 19.5883 },
  kanjiza: { name: 'Kanjiža', lat: 46.0667, lon: 20.05 },
  kula: { name: 'Kula', lat: 45.6, lon: 19.5333 },
  melenci: { name: 'Melenci', lat: 45.5083, lon: 20.3169 },
  mokrin: { name: 'Mokrin', lat: 45.9358, lon: 20.4072 },
  palic: { name: 'Palić', lat: 46.1031, lon: 19.7586 },
  prigrevica: { name: 'Prigrevica', lat: 45.6739, lon: 19.0853 },
  temerin: { name: 'Temerin', lat: 45.4053, lon: 19.8869 },
  celarevo: { name: 'Čelarevo', lat: 45.2694, lon: 19.5253 },
  kikinda: { name: 'Kikinda', lat: 45.8244, lon: 20.4592 },
  srbobran: { name: 'Srbobran', lat: 45.5522, lon: 19.8017 },
  subotica: { name: 'Subotica', lat: 46.1002, lon: 19.6653 },
  vrbas: { name: 'Vrbas', lat: 45.5697, lon: 19.6378 },
  srpskaCrnja: { name: 'Srpska Crnja', lat: 45.7206, lon: 20.6864 },
  backoDobroPolje: { name: 'Bačko Dobro Polje', lat: 45.4975, lon: 19.6892 },
  kupusina: { name: 'Kupusina', lat: 45.7361, lon: 19.0972 },
  noviSad: { name: 'Novi Sad', lat: 45.2644, lon: 19.8317 },
  sonta: { name: 'Sonta', lat: 45.5939, lon: 19.0956 },
  backaTopola: { name: 'Bačka Topola', lat: 45.8089, lon: 19.635 },
  zobnatica: { name: 'Zobnatica', lat: 45.8617, lon: 19.6353 },
  banatskiKarlovac: { name: 'Banatski Karlovac', lat: 45.0472, lon: 21.0161 },
  janosik: { name: 'Janošik', lat: 45.1736, lon: 21.0083 },
  vrbica: { name: 'Vrbica', lat: 46.0111, lon: 20.3128 },
  zitiste: { name: 'Žitište', lat: 45.485, lon: 20.5497 },
  zrenjanin: { name: 'Zrenjanin', lat: 45.3778, lon: 20.3861 },
  indjija: { name: 'Inđija', lat: 45.0492, lon: 20.0792 },
  kupinovo: { name: 'Kupinovo', lat: 44.7056, lon: 20.0481 },
  sajkas: { name: 'Šajkaš', lat: 45.2722, lon: 20.0897 },
};

const iv = (
  top: number,
  bottom: number,
  temp: number,
  flow: number,
  minerals?: number,
): WellTest => ({
  top,
  bottom,
  temp,
  flow,
  minerals,
});

/** A test with no interval in the annex: only the well's total depth is known. */
const open = (temp: number, flow: number, minerals?: number): WellTest => ({
  temp,
  flow,
  minerals,
});

export const WELLS: Well[] = [
  // Table 1: in production in 2005.
  {
    id: 'Db-1/H',
    place: 'alibunar',
    status: 'producing',
    year: 1978,
    depth: 600,
    tests: [iv(356.4, 488.5, 24, 7.4, 0.489)],
  },
  {
    id: 'Kđ-1/H',
    place: 'backoKarađorđevo',
    status: 'producing',
    year: 1974,
    depth: 1059,
    tests: [open(34, 2.17)],
  },
  {
    id: 'VS-1/H',
    place: 'banatskoVelikoSelo',
    status: 'producing',
    year: 1986,
    depth: 925,
    tests: [iv(762, 846, 43, 11.2, 1.866)],
  },
  {
    id: 'Bč-2/H',
    place: 'becej',
    status: 'producing',
    year: 1985,
    depth: 1020,
    tests: [iv(890, 971, 65, 17.2, 4.617)],
  },
  {
    id: 'BP-2/H',
    place: 'backiPetrovac',
    status: 'producing',
    year: 1984,
    depth: 800,
    tests: [iv(658, 780.5, 46, 6.5, 0.743)],
  },
  {
    id: 'Kž-1/H',
    place: 'kanjiza',
    status: 'producing',
    year: 1977,
    depth: 1147,
    tests: [iv(664, 744, 41, 1.8, 2.48)],
  },
  // Listed in Tables 1 and 2: out of production since 2001, so shown as idle.
  {
    id: 'Kž-2/H',
    place: 'kanjiza',
    status: 'idle',
    year: 1983,
    depth: 1123,
    tests: [iv(895, 965, 65, 9.3, 4.03)],
  },
  {
    id: 'Kž-3/H',
    place: 'kanjiza',
    status: 'producing',
    year: 1996,
    depth: 1140,
    tests: [iv(1008, 1085, 70, 12.5, 4.353)],
  },
  {
    id: 'Kl-2/H',
    place: 'kula',
    status: 'producing',
    year: 1982,
    depth: 787.4,
    tests: [iv(716.5, 754.5, 53, 5.6, 2.51)],
  },
  {
    id: 'Me-1/H',
    place: 'melenci',
    status: 'producing',
    year: 1978,
    depth: 1300,
    tests: [iv(445.2, 560, 33, 6.9, 2.529)],
  },
  {
    id: 'Mk-1/H',
    place: 'mokrin',
    status: 'producing',
    year: 1983,
    depth: 950,
    tests: [iv(886.7, 934.7, 51, 7.0, 3.59)],
  },
  {
    id: 'Pj-1/H',
    place: 'palic',
    status: 'producing',
    year: 1978,
    depth: 701,
    tests: [iv(611.9, 695, 48, 5.5, 3.048)],
  },
  {
    id: 'Pj-2/H',
    place: 'palic',
    status: 'producing',
    year: 1986,
    depth: 750,
    tests: [iv(588.4, 710, 48, 6.3, 3.056)],
  },
  {
    id: 'Pb-1/H',
    place: 'prigrevica',
    status: 'producing',
    year: 1981,
    depth: 701.7,
    tests: [iv(600, 692, 53, 11.8, 6.164)],
  },
  {
    id: 'Te-1/H',
    place: 'temerin',
    status: 'producing',
    year: 1984,
    depth: 914,
    tests: [iv(525.7, 607, 40, 14.9, 3.293)],
  },

  // Table 2: built systems, not in production.
  {
    id: 'VS-2/H',
    place: 'banatskoVelikoSelo',
    status: 'idle',
    year: 1987,
    depth: 895,
    tests: [iv(791, 880, 45, 6.67, 2.072)],
  },
  {
    id: 'Če-1/H',
    place: 'celarevo',
    status: 'idle',
    year: 1989,
    depth: 1134,
    tests: [iv(374.6, 444.6, 31, 5.0, 0.72)],
  },
  {
    id: 'Šm-1/H',
    place: 'kikinda',
    status: 'idle',
    year: 1974,
    depth: 950,
    tests: [iv(864, 929, 50, 6.17, 3.213)],
  },
  {
    id: 'Ki-2/H',
    place: 'kikinda',
    status: 'idle',
    year: 1984,
    depth: 1200,
    tests: [iv(902.1, 970, 51, 10.1, 2.87)],
  },
  {
    id: 'Kl-1/H',
    place: 'kula',
    status: 'idle',
    year: 1980,
    depth: 750,
    tests: [iv(649.3, 735.5, 50, 9.5, 3.964)],
  },
  {
    id: 'Kl-3/H',
    place: 'kula',
    status: 'idle',
    year: 1982,
    depth: 602,
    tests: [iv(478.8, 554.9, 53, 8.33, 4.175)],
  },
  {
    id: 'Kl-4/H',
    place: 'kula',
    status: 'idle',
    year: 1983,
    depth: 820,
    tests: [iv(706.1, 795, 51, 8.5, 3.73)],
  },
  {
    id: 'Sr-1/H',
    place: 'srbobran',
    status: 'idle',
    year: 1981,
    depth: 1207,
    tests: [iv(906.2, 1023.4, 63, 11.67, 3.19)],
  },
  {
    id: 'Dš-2/H',
    place: 'subotica',
    status: 'idle',
    year: 1983,
    depth: 650,
    tests: [iv(432, 564, 35, 4.83, 2.899)],
  },
  {
    id: 'Vrb-1/H',
    place: 'vrbas',
    status: 'idle',
    year: 1979,
    depth: 1033.2,
    tests: [iv(562, 614, 39, 3.5, 4.67)],
  },
  {
    id: 'Vrb-2/H',
    place: 'vrbas',
    status: 'idle',
    year: 1981,
    depth: 932,
    tests: [iv(816, 898, 51, 4.33, 3.0)],
  },

  // Table 3: never in production, considered promising. No interval is given
  // except for Vbc-1/H.
  {
    id: 'Bč-1/H',
    place: 'becej',
    status: 'untapped',
    year: 1981,
    depth: 503,
    tests: [open(33, 10.65, 4.47)],
  },
  {
    id: 'BP-1/H',
    place: 'backiPetrovac',
    status: 'untapped',
    year: 1979,
    depth: 803,
    tests: [open(46, 16.65, 0.794)],
  },
  {
    id: 'BT-2/H',
    place: 'backaTopola',
    status: 'untapped',
    year: 1990,
    depth: 541,
    tests: [open(37, 10.67, 3.84)],
  },
  {
    id: 'Cr-5',
    place: 'srpskaCrnja',
    status: 'untapped',
    year: 1970,
    depth: 2052,
    tests: [open(75, 18.3, 4.61)],
  },
  {
    id: 'DP-1',
    place: 'backoDobroPolje',
    status: 'untapped',
    year: 1980,
    depth: 1659,
    tests: [open(57, 14.66, 2.82)],
  },
  {
    id: 'Kps-1/H',
    place: 'kupusina',
    status: 'untapped',
    year: 1987,
    depth: 1600,
    tests: [open(72, 3.3, 6.568)],
  },
  // Liquidated in 2004; no mineralisation given.
  {
    id: 'NS-2/H',
    place: 'noviSad',
    status: 'untapped',
    year: 1980,
    depth: 809.9,
    tests: [open(35, 2.7)],
  },
  {
    id: 'NS-3/H',
    place: 'noviSad',
    status: 'untapped',
    year: 1982,
    depth: 823.9,
    tests: [open(38, 6.83, 1.01)],
  },
  {
    id: 'NSb-1/H',
    place: 'noviSad',
    status: 'untapped',
    year: 1984,
    depth: 300.5,
    tests: [open(23, 17.06, 1.54)],
  },
  {
    id: 'Pb-3/H',
    place: 'prigrevica',
    status: 'untapped',
    year: 1987,
    depth: 711.7,
    tests: [open(53, 14.0, 5.936)],
  },
  {
    id: 'Prg-1/H',
    place: 'prigrevica',
    status: 'untapped',
    year: 1978,
    depth: 590,
    tests: [open(43, 2.7, 6.59)],
  },
  {
    id: 'So-1/H',
    place: 'sonta',
    status: 'untapped',
    year: 1985,
    depth: 923,
    tests: [open(43, 2.5, 6.667)],
  },
  {
    id: 'Sr-2/H',
    place: 'srbobran',
    status: 'untapped',
    year: 1982,
    depth: 950.2,
    tests: [open(54, 5.5, 3.34)],
  },
  {
    id: 'Vrb-3/H',
    place: 'vrbas',
    status: 'untapped',
    year: 1986,
    depth: 947,
    tests: [open(54, 13.0, 2.94)],
  },
  {
    id: 'Zob-1/H',
    place: 'zobnatica',
    status: 'untapped',
    year: 1993,
    depth: 543,
    tests: [open(36, 3.3, 3.96)],
  },
  {
    id: 'BK-1/H',
    place: 'banatskiKarlovac',
    status: 'untapped',
    year: 1984,
    depth: 509.7,
    tests: [open(27, 15.7, 0.42)],
  },
  {
    id: 'Ja-1/H',
    place: 'janosik',
    status: 'untapped',
    year: 1984,
    depth: 742,
    tests: [open(35, 9.565, 3.51)],
  },
  {
    id: 'Ki-4/H',
    place: 'kikinda',
    status: 'untapped',
    year: 1987,
    depth: 1203,
    tests: [open(57, 4.7, 3.32)],
  },
  // Three tested intervals; the annex lists temperature, yield and the
  // intervals in the same order.
  {
    id: 'Vbc-1/H',
    place: 'vrbica',
    status: 'untapped',
    year: 1980,
    depth: 2520,
    tests: [
      iv(1743, 1854, 82, 16.7, 6.54),
      iv(1626, 1632, 68, 4.3, 4.5),
      iv(1515, 1526, 54, 4.8, 4.41),
    ],
  },
  {
    id: 'Ži-1/H',
    place: 'zitiste',
    status: 'untapped',
    year: 1981,
    depth: 1002,
    tests: [open(44, 3.3, 4.27)],
  },
  {
    id: 'Zr-1/H',
    place: 'zrenjanin',
    status: 'untapped',
    year: 1988,
    depth: 870,
    tests: [open(45, 4.0, 2.996)],
  },
  {
    id: 'Inđ-1/H',
    place: 'indjija',
    status: 'untapped',
    year: 1988,
    depth: 975,
    tests: [open(56, 13.33, 3.97)],
  },
  {
    id: 'Kup-1/H',
    place: 'kupinovo',
    status: 'untapped',
    year: 1982,
    depth: 644,
    tests: [open(51, 42.84, 0.777)],
  },
  {
    id: 'Kup-2/H',
    place: 'kupinovo',
    status: 'untapped',
    year: 1985,
    depth: 663,
    tests: [open(45.5, 15.0, 0.867)],
  },
  {
    id: 'Šaj-1/H',
    place: 'sajkas',
    status: 'untapped',
    year: 2001,
    depth: 801,
    tests: [open(39, 6.0, 1.74)],
  },
];

/**
 * Depth, in metres, at which a test's temperature is taken: the middle of the
 * screened interval, or the well's total depth where the annex gives no
 * interval. The total depth is the deepest the water can have come from, so
 * for those wells the gradient is a lower bound.
 */
export function testDepth(well: Well, test: WellTest): number {
  return test.top !== undefined && test.bottom !== undefined
    ? (test.top + test.bottom) / 2
    : well.depth;
}

/** True where the depth of the test is the whole-well fallback, not an interval. */
export function hasInterval(test: WellTest): boolean {
  return test.top !== undefined && test.bottom !== undefined;
}

/**
 * Local flat coordinates in kilometres from a reference point: x east, y north.
 * An equirectangular projection is accurate to well under 1 km over the
 * ~200 km width of Vojvodina, far below the settlement-level position error.
 */
export function project(
  lat: number,
  lon: number,
  lat0: number,
  lon0: number,
): { x: number; y: number } {
  const { kmPerDegLat, kmPerDegLon } = degreeLengths(lat0);
  return { x: (lon - lon0) * kmPerDegLon, y: (lat - lat0) * kmPerDegLat };
}

/** Inverse of `project`. */
export function unproject(
  x: number,
  y: number,
  lat0: number,
  lon0: number,
): { lat: number; lon: number } {
  const { kmPerDegLat, kmPerDegLon } = degreeLengths(lat0);
  return { lat: lat0 + y / kmPerDegLat, lon: lon0 + x / kmPerDegLon };
}

function degreeLengths(lat0: number) {
  return {
    kmPerDegLat: 111.13, // a degree of latitude at 45°N
    kmPerDegLon: 111.32 * Math.cos((lat0 * Math.PI) / 180),
  };
}
