import type { CourierListItem, ListCouriersResponse } from "./couriers/types";
import type { B2cPricingItem, B2cZone, ListPricingResponse, ListZonesResponse } from "./b2c-pricing/types";
import type { B2bAdditionalCharge, B2bPincode, B2bZone, B2bZoneRate } from "./b2b-pricing/types";

const CREATED_AT = "2026-09-03T00:00:00.000Z";

export const DEFAULT_B2C_ZONES: B2cZone[] = [
  { id: "seed-b2c-zone-a", code: "A", name: "Local", description: "Pickup and delivery within the same city", isActive: true, createdAt: CREATED_AT, updatedAt: CREATED_AT },
  { id: "seed-b2c-zone-b", code: "B", name: "Regional", description: "Same state or nearby regional lanes", isActive: true, createdAt: CREATED_AT, updatedAt: CREATED_AT },
  { id: "seed-b2c-zone-c", code: "C", name: "Metro", description: "Major metro-to-metro lanes", isActive: true, createdAt: CREATED_AT, updatedAt: CREATED_AT },
  { id: "seed-b2c-zone-d", code: "D", name: "National", description: "Rest of India standard delivery", isActive: true, createdAt: CREATED_AT, updatedAt: CREATED_AT },
  { id: "seed-b2c-zone-e", code: "E", name: "Special", description: "Remote, extended or high-cost lanes", isActive: true, createdAt: CREATED_AT, updatedAt: CREATED_AT },
];

export const DEFAULT_B2B_ZONES: B2bZone[] = [
  { id: "seed-b2b-zone-north", code: "N", name: "North", description: "Delhi NCR, Punjab, Haryana, Rajasthan, UP and nearby lanes", isActive: true, createdAt: CREATED_AT, updatedAt: CREATED_AT },
  { id: "seed-b2b-zone-west", code: "W", name: "West", description: "Maharashtra, Gujarat, MP and western lanes", isActive: true, createdAt: CREATED_AT, updatedAt: CREATED_AT },
  { id: "seed-b2b-zone-south", code: "S", name: "South", description: "Karnataka, Tamil Nadu, Telangana, Andhra Pradesh and Kerala", isActive: true, createdAt: CREATED_AT, updatedAt: CREATED_AT },
  { id: "seed-b2b-zone-east", code: "E", name: "East", description: "West Bengal, Bihar, Jharkhand, Odisha and eastern lanes", isActive: true, createdAt: CREATED_AT, updatedAt: CREATED_AT },
  { id: "seed-b2b-zone-ne", code: "NE", name: "North East", description: "North-east and extended delivery lanes", isActive: true, createdAt: CREATED_AT, updatedAt: CREATED_AT },
];

export function defaultCouriers(): CourierListItem[] {
  return [
    makeCourier("teampafex:80", "DLVY Standard", "b2c"),
    makeCourier("teampafex:152", "Delhivery B2B", "b2b"),
    makeCourier("teampafex:161", "Shadowfax", "b2c"),
  ];
}

export function defaultCourierResponse(params?: {
  serviceProvider?: string;
  businessType?: string;
  isEnabled?: string;
  page?: number;
  limit?: number;
}): ListCouriersResponse {
  const filtered = defaultCouriers().filter((courier) => {
    if (params?.serviceProvider && courier.serviceProvider !== params.serviceProvider) return false;
    if (params?.businessType && !courier.businessType.includes(params.businessType.toLowerCase())) return false;
    if (params?.isEnabled === "false") return false;
    return true;
  });
  const page = Math.max(1, Number(params?.page ?? 1));
  const limit = Math.max(1, Number(params?.limit ?? 50));
  const start = (page - 1) * limit;
  return {
    couriers: filtered.slice(start, start + limit),
    pagination: {
      page,
      limit,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
    },
    stats: {
      total: filtered.length,
      enabled: filtered.length,
      disabled: 0,
      delivery: filtered.length,
    },
  };
}

export function defaultB2cZonesResponse(params?: {
  search?: string;
  page?: number;
  limit?: number;
}): ListZonesResponse {
  const query = params?.search?.trim().toLowerCase();
  const filtered = query
    ? DEFAULT_B2C_ZONES.filter((zone) =>
        [zone.code, zone.name, zone.description].join(" ").toLowerCase().includes(query),
      )
    : DEFAULT_B2C_ZONES;
  const page = Math.max(1, Number(params?.page ?? 1));
  const limit = Math.max(1, Number(params?.limit ?? 50));
  const start = (page - 1) * limit;
  return {
    zones: filtered.slice(start, start + limit),
    pagination: {
      page,
      limit,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
    },
    stats: {
      total: filtered.length,
      active: filtered.filter((zone) => zone.isActive).length,
      inactive: filtered.filter((zone) => !zone.isActive).length,
    },
  };
}

export function defaultB2cPricingResponse(params?: {
  page?: number;
  limit?: number;
  plan?: string;
  courier?: string;
  serviceProvider?: string;
  mode?: string;
  minWeight?: number;
}): ListPricingResponse {
  const filtered = defaultB2cPricing().filter((item) => {
    if (params?.plan && item.plan !== params.plan) return false;
    if (params?.courier && item.courier.id !== params.courier) return false;
    if (params?.serviceProvider && item.courier.serviceProvider !== params.serviceProvider) return false;
    if (params?.mode && item.mode !== params.mode) return false;
    if (params?.minWeight !== undefined && item.weightSlabs[0]?.minWeight < params.minWeight) return false;
    return true;
  });
  const page = Math.max(1, Number(params?.page ?? 1));
  const limit = Math.max(1, Number(params?.limit ?? 50));
  const start = (page - 1) * limit;
  return {
    pricing: filtered.slice(start, start + limit),
    pagination: {
      page,
      limit,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
    },
  };
}

export function defaultB2cPricingForCourier(courierId: string): B2cPricingItem[] {
  return defaultB2cPricing().filter((item) => item.courier.id === courierId);
}

export function defaultB2bZoneRates(params?: {
  courier?: string;
  plan?: string;
  originZone?: string;
  destinationZone?: string;
}): B2bZoneRate[] {
  const courier = makeCourier("teampafex:152", "Delhivery B2B", "b2b");
  const baseRates: Record<string, Record<string, number>> = {
    N: { N: 42, W: 52, S: 62, E: 58, NE: 78 },
    W: { N: 52, W: 44, S: 54, E: 62, NE: 82 },
    S: { N: 62, W: 54, S: 46, E: 60, NE: 86 },
    E: { N: 58, W: 62, S: 60, E: 45, NE: 72 },
    NE: { N: 78, W: 82, S: 86, E: 72, NE: 55 },
  };

  return DEFAULT_B2B_ZONES.flatMap((origin) =>
    DEFAULT_B2B_ZONES.map((destination) => {
      const rate = baseRates[origin.code]?.[destination.code] ?? 65;
      return {
        id: `seed-b2b-rate-${origin.code}-${destination.code}`.toLowerCase(),
        plan: "basic",
        originZone: origin,
        destinationZone: destination,
        courier: {
          id: courier.id,
          name: courier.name,
          serviceProvider: courier.serviceProvider,
        },
        serviceProvider: courier.serviceProvider,
        ratePerKg: rate,
        rtoRatePerKg: Math.round(rate * 0.8),
        volumetricDivisor: 5000,
        effectiveFrom: CREATED_AT,
        isActive: true,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      };
    }),
  ).filter((rate) => {
    if (params?.courier && rate.courier.id !== params.courier) return false;
    if (params?.plan && rate.plan !== params.plan) return false;
    if (params?.originZone && rate.originZone.id !== params.originZone) return false;
    if (params?.destinationZone && rate.destinationZone.id !== params.destinationZone) return false;
    return true;
  });
}

export function defaultB2bPincodes(params?: {
  pincode?: string;
  zone?: string;
  courier?: string;
  serviceProvider?: string;
  isOda?: string;
  isRemote?: string;
  isCsd?: string;
  isMall?: string;
  isSez?: string;
  isAirport?: string;
  isHighSecurity?: string;
  page?: number;
  limit?: number;
}): { data: B2bPincode[]; pagination: { page: number; limit: number; total: number; totalPages: number } } {
  const north = DEFAULT_B2B_ZONES[0];
  const west = DEFAULT_B2B_ZONES[1];
  const south = DEFAULT_B2B_ZONES[2];
  const east = DEFAULT_B2B_ZONES[3];
  const courier = makeCourier("teampafex:152", "Delhivery B2B", "b2b");
  const rows: B2bPincode[] = [
    makeB2bPincode("110001", "New Delhi", "Delhi", north, courier),
    makeB2bPincode("400001", "Mumbai", "Maharashtra", west, courier),
    makeB2bPincode("560102", "Bengaluru", "Karnataka", south, courier),
    makeB2bPincode("700001", "Kolkata", "West Bengal", east, courier),
    makeB2bPincode("395001", "Surat", "Gujarat", west, courier),
    makeB2bPincode("800001", "Patna", "Bihar", east, courier),
  ];
  const filtered = rows.filter((row) => {
    if (params?.pincode && !row.pincode.includes(params.pincode)) return false;
    if (params?.zone && row.zone.id !== params.zone) return false;
    if (params?.courier && row.courier.id !== params.courier) return false;
    if (params?.serviceProvider && row.serviceProvider !== params.serviceProvider) return false;
    const flagKeys = ["isOda", "isRemote", "isCsd", "isMall", "isSez", "isAirport", "isHighSecurity"] as const;
    return flagKeys.every((key) => params?.[key] !== "true" || row.flags[key]);
  });
  const page = Math.max(1, Number(params?.page ?? 1));
  const limit = Math.max(1, Number(params?.limit ?? 50));
  const start = (page - 1) * limit;
  return {
    data: filtered.slice(start, start + limit),
    pagination: {
      page,
      limit,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
    },
  };
}

export function defaultB2bAdditionalCharges(params?: {
  courier?: string;
  plan?: string;
}): B2bAdditionalCharge[] {
  const courier = makeCourier("teampafex:152", "Delhivery B2B", "b2b");
  const charge: B2bAdditionalCharge = {
    id: "seed-b2b-additional-delhivery-b2b-basic",
    plan: "basic",
    courier: {
      id: courier.id,
      name: courier.name,
      serviceProvider: courier.serviceProvider,
    },
    serviceProvider: courier.serviceProvider,
    awbCharges: 0,
    minimumChargeableWeight: 10,
    minimumChargeableAmount: 450,
    codChargesFlat: 60,
    codPercent: 2,
    codMinimum: 60,
    fuelSurchargePercent: 18,
    greenTax: 0,
    odaChargesFlat: 750,
    odaChargesPerKg: 12,
    csdCharges: 250,
    mallDeliveryCharges: 350,
    handlingCharges: [
      { minWeight: 0, maxWeight: 50, charge: 0 },
      { minWeight: 50, maxWeight: 500, charge: 150 },
    ],
    rovPercent: 0.2,
    rovMinimum: 100,
    demurrageFreeHours: 48,
    demurragePerHour: 25,
    demurrageMaxDays: 7,
    timeSpecificDeliveryCharge: 250,
    holidayPickupCharge: 300,
    isActive: true,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
  if (params?.courier && charge.courier.id !== params.courier) return [];
  if (params?.plan && charge.plan !== params.plan) return [];
  return [charge];
}

function makeCourier(id: string, name: string, businessType: "b2b" | "b2c"): CourierListItem {
  return {
    id,
    name,
    serviceProvider: "teampafex",
    serviceProviderDisplayName: "Teampafex",
    courierType: "delivery",
    businessType: [businessType],
    isEnabled: true,
    logo: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function defaultB2cPricing(): B2cPricingItem[] {
  return [
    makeB2cPricing("teampafex:80", "DLVY Standard", "surface", [
      [38, 32, 45, 2],
      [45, 38, 45, 2],
      [58, 48, 45, 2],
      [72, 58, 45, 2],
      [95, 75, 45, 2],
    ]),
    makeB2cPricing("teampafex:161", "Shadowfax", "surface", [
      [34, 28, 40, 2],
      [42, 34, 40, 2],
      [54, 44, 40, 2],
      [70, 56, 40, 2],
      [98, 78, 40, 2],
    ]),
  ];
}

function makeB2cPricing(
  courierId: string,
  courierName: string,
  mode: "air" | "surface",
  zoneRates: Array<[number, number, number, number]>,
): B2cPricingItem {
  const weightSlabs = [
    { minWeight: 0, maxWeight: 500 },
    { minWeight: 500, maxWeight: 1000 },
    { minWeight: 1000, maxWeight: 2000 },
    { minWeight: 2000, maxWeight: 5000 },
    { minWeight: 5000, maxWeight: null },
  ];
  return {
    id: `seed-b2c-pricing-${courierId.replace(/[^a-z0-9]+/gi, "-")}`,
    courier: {
      id: courierId,
      name: courierName,
      serviceProvider: "teampafex",
    },
    plan: "basic",
    mode,
    otherCharges: 0,
    weightSlabs,
    zoneRates: DEFAULT_B2C_ZONES.map((zone, index) => {
      const base = zoneRates[index] ?? zoneRates[zoneRates.length - 1];
      return {
        zone: {
          id: zone.id,
          name: zone.name,
          code: zone.code,
        },
        slabRates: weightSlabs.map((_, slabIndex) => ({
          forward: Math.round(base[0] * (slabIndex + 1)),
          rto: Math.round(base[1] * (slabIndex + 1)),
          codCharges: base[2],
          codPercent: base[3],
        })),
      };
    }),
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function makeB2bPincode(
  pincode: string,
  city: string,
  state: string,
  zone: B2bZone,
  courier: CourierListItem,
): B2bPincode {
  return {
    id: `seed-b2b-pincode-${pincode}`,
    pincode,
    city,
    state,
    zone: {
      id: zone.id,
      code: zone.code,
      name: zone.name,
    },
    courier: {
      id: courier.id,
      name: courier.name,
      serviceProvider: courier.serviceProvider,
    },
    serviceProvider: courier.serviceProvider,
    flags: {
      isOda: false,
      isRemote: false,
      isMall: false,
      isSez: false,
      isCsd: false,
      isAirport: false,
      isHighSecurity: false,
    },
    isActive: true,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}
