import { api } from "./api";
import {
  courierApi,
  shouldUseCourierApi,
  type CourierPackagePayload,
  type CourierShippingRate,
} from "./courierApi";

export interface DelhiveryRate {
  total_amount: number;
  gross_amount: number;
  charged_weight: number;
  zone: string;
  charge_COD: number;
  charge_FS: number;
  charge_DL: number;
  charge_RTO: number;
  tax_amount: number;
}

interface DelhiveryRateParams {
  originPin: string;
  destinationPin: string;
  chargeableGrams: number;
  mode: string;
}

export interface CourierRate {
  forward: number;
  rto: number;
  codCharges: number;
  otherCharges: number;
  freightCharge: number;
  totalCharge: number;
}

export interface AvailableCourier {
  courierId: string;
  name: string;
  serviceProvider: string;
  serviceProviderDisplayName: string;
  logo: string | null;
  mode: "air" | "surface";
  zone: { code: string; name: string };
  chargeableWeight: number;
  minWeight: number;
  rate: CourierRate;
  tag?: "economy" | "fastest";
  /** Present only for B2B couriers — carries the line-by-line freight breakdown. */
  _b2bRate?: B2bCourierRate;
}

export interface AvailableCouriersParams {
  origin: string;
  destination: string;
  weight: number;
  length?: number;
  breadth?: number;
  height?: number;
  paymentType: "prepaid" | "cod";
  orderAmount?: number;
  orderType?: "B2B" | "B2C";
}

// ── B2B Rate Types ──

export interface B2bRateOverhead {
  code: string;
  name: string;
  type: string;
  amount: number;
}

export interface B2bCourierRate {
  baseFreight: number;
  overheads: B2bRateOverhead[];
  rtoRate: number;
  total: number;
  billableWeight: number;
  packages: Array<{
    deadWeight: number;
    volumetricWeight: number;
    billableWeight: number;
  }>;
}

export interface B2bAvailableCourier {
  courierId: string;
  name: string;
  serviceProvider: string;
  serviceProviderDisplayName: string;
  logo: string | null;
  zone: {
    originCode: string;
    originName: string;
    destinationCode: string;
    destinationName: string;
  };
  billableWeight: number;
  packages: Array<{
    deadWeight: number;
    volumetricWeight: number;
    billableWeight: number;
  }>;
  rate: B2bCourierRate;
  tag?: "economy" | "fastest";
}

export interface B2bAvailableCouriersParams {
  origin: string;
  destination: string;
  packages: Array<{
    weight: number;
    length: number;
    breadth: number;
    height: number;
  }>;
  paymentType: "prepaid" | "cod";
  orderAmount: number;
  declaredValue?: number;
  isInsurance?: boolean;
  isTimeSpecificDelivery?: boolean;
  isHolidayPickup?: boolean;
}

export interface SlabRateItem {
  forward: number;
  rto: number;
  codCharges: number;
  codPercent: number;
}

export interface ZoneRateItem {
  zone: { id: string; name: string; code: string };
  slabRates: SlabRateItem[];
}

export interface WeightSlabItem {
  minWeight: number;
  maxWeight: number | null;
}

export interface RateCardPricing {
  id: string;
  courier: { id: string; name: string; serviceProvider: string; logo?: string | null };
  plan: string;
  mode: "air" | "surface";
  otherCharges: number;
  weightSlabs: WeightSlabItem[];
  zoneRates: ZoneRateItem[];
  createdAt: string;
  updatedAt: string;
}

export interface RateCardResponse {
  plan: string;
  pricing: RateCardPricing[];
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function kgFromGrams(grams: number): number {
  return round(Math.max(grams, 0) / 1000, 3);
}

function volumetricKg(length = 0, breadth = 0, height = 0): number {
  if (!length || !breadth || !height) return 0;
  return round((length * breadth * height) / 5000, 3);
}

function makePackagePayload(pkg: {
  count?: number;
  weightKg: number;
  length?: number;
  breadth?: number;
  height?: number;
}): CourierPackagePayload {
  const length = pkg.length || 0;
  const breadth = pkg.breadth || 0;
  const height = pkg.height || 0;
  const weightKg = round(pkg.weightKg, 3);
  return {
    count: String(pkg.count ?? 1),
    length: String(length),
    width: String(breadth),
    height: String(height),
    volumetric_weight: String(volumetricKg(length, breadth, height)),
    weight: String(weightKg),
    total_weight: String(weightKg * (pkg.count ?? 1)),
  };
}

function getRateName(rate: CourierShippingRate, fallback: string): string {
  return String(rate.delivery_partner_name || rate.name || fallback).trim();
}

async function enrichShippingRates(
  shippingData: CourierShippingRate[],
  orderType: "B2B" | "B2C",
): Promise<Array<CourierShippingRate & { _partnerId: string; _partnerType?: string }>> {
  const partners = await courierApi.getCourierIds().catch(() => []);
  return shippingData.map((rate, index) => {
    const name = getRateName(rate, `Courier ${index + 1}`);
    const exactPartner = partners.find((p) =>
      String(p.name).trim().toLowerCase() === name.toLowerCase() &&
      (!p.type || String(p.type).toUpperCase() === orderType),
    );
    const loosePartner = exactPartner ?? partners.find((p) =>
      name.toLowerCase().includes(String(p.name).trim().toLowerCase()) ||
      String(p.name).trim().toLowerCase().includes(name.toLowerCase()),
    );
    const id =
      rate.delivery_partner_id ??
      rate.courier_id ??
      rate.id ??
      loosePartner?.id ??
      String(index + 1);
    return { ...rate, _partnerId: String(id), _partnerType: loosePartner?.type };
  });
}

async function getCourierApiRates(params: AvailableCouriersParams): Promise<AvailableCourier[]> {
  const actualKg = kgFromGrams(params.weight);
  const volKg = volumetricKg(params.length, params.breadth, params.height);
  const chargeableKg = Math.max(actualKg, volKg);
  const response = await courierApi.getShippingCharges({
    pickup_code: params.origin,
    delivery_code: params.destination,
    amount: String(params.orderAmount ?? 0),
    payment_method: params.paymentType === "cod" ? "COD" : "PREPAID",
    rov: "Owner Risk",
    appointment_delivery: "No",
    no_of_box: "1",
    total_weight: String(actualKg),
    total_volumetric_weight: String(volKg),
    chargeable_weight: String(chargeableKg),
    dimension_unit: "cm",
    packages: [
      makePackagePayload({
        weightKg: actualKg,
        length: params.length,
        breadth: params.breadth,
        height: params.height,
      }),
    ],
    calculator_type: "B2C",
  });

  const rates = await enrichShippingRates(response.shipping_data ?? [], "B2C");
  const totals = rates.map((r) => toNumber(r.total_charges ?? r.total));
  const cheapest = totals.length ? Math.min(...totals) : null;

  return rates.map((rate, index) => {
    const name = getRateName(rate, `Courier ${index + 1}`);
    const freight = toNumber(rate.total_freight ?? rate.freight);
    const gst = toNumber(rate.gst);
    const total = toNumber(rate.total_charges ?? rate.total, freight + gst);
    const codCharges = toNumber(rate.cod_charges);
    return {
      courierId: rate._partnerId,
      name,
      serviceProvider: name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
      serviceProviderDisplayName: name,
      logo: null,
      mode: "surface",
      zone: { code: "API", name: "Courier API" },
      chargeableWeight: Math.ceil(chargeableKg * 1000),
      minWeight: 500,
      rate: {
        forward: freight,
        rto: toNumber(rate.rto),
        codCharges,
        otherCharges: gst,
        freightCharge: freight,
        totalCharge: total,
      },
      tag: total === cheapest ? "economy" : undefined,
    };
  });
}

async function getCourierApiB2bRates(params: B2bAvailableCouriersParams): Promise<B2bAvailableCourier[]> {
  const packages = params.packages.map((pkg) =>
    makePackagePayload({
      weightKg: pkg.weight,
      length: pkg.length,
      breadth: pkg.breadth,
      height: pkg.height,
    }),
  );
  const totalWeight = round(params.packages.reduce((sum, pkg) => sum + (pkg.weight || 0), 0), 3);
  const totalVolumetric = round(params.packages.reduce(
    (sum, pkg) => sum + volumetricKg(pkg.length, pkg.breadth, pkg.height),
    0,
  ), 3);
  const chargeable = Math.max(totalWeight, totalVolumetric);

  const response = await courierApi.getShippingCharges({
    pickup_code: params.origin,
    delivery_code: params.destination,
    amount: String(params.orderAmount ?? params.declaredValue ?? 0),
    payment_method: params.paymentType === "cod" ? "COD" : "PREPAID",
    rov: params.isInsurance ? "Carrier Risk" : "Owner Risk",
    appointment_delivery: params.isTimeSpecificDelivery ? "Yes" : "No",
    no_of_box: String(packages.length),
    total_weight: String(totalWeight),
    total_volumetric_weight: String(totalVolumetric),
    chargeable_weight: String(chargeable),
    dimension_unit: "cm",
    packages,
    calculator_type: "B2B",
  });

  const rates = await enrichShippingRates(response.shipping_data ?? [], "B2B");
  const totals = rates.map((r) => toNumber(r.total_charges ?? r.total));
  const cheapest = totals.length ? Math.min(...totals) : null;

  return rates.map((rate, index) => {
    const name = getRateName(rate, `Courier ${index + 1}`);
    const freight = toNumber(rate.total_freight ?? rate.freight);
    const gst = toNumber(rate.gst);
    const codCharges = toNumber(rate.cod_charges);
    const total = toNumber(rate.total_charges ?? rate.total, freight + gst + codCharges);
    const rtoRate = toNumber(rate.rto);
    const overheads = [
      ...(gst > 0 ? [{ code: "GST", name: "GST", type: "fixed", amount: gst }] : []),
      ...(codCharges > 0 ? [{ code: "COD", name: "COD Charges", type: "fixed", amount: codCharges }] : []),
    ];
    return {
      courierId: rate._partnerId,
      name,
      serviceProvider: name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
      serviceProviderDisplayName: name,
      logo: null,
      zone: {
        originCode: params.origin,
        originName: params.origin,
        destinationCode: params.destination,
        destinationName: params.destination,
      },
      billableWeight: chargeable,
      packages: params.packages.map((pkg) => ({
        deadWeight: pkg.weight,
        volumetricWeight: volumetricKg(pkg.length, pkg.breadth, pkg.height),
        billableWeight: Math.max(pkg.weight, volumetricKg(pkg.length, pkg.breadth, pkg.height)),
      })),
      rate: {
        baseFreight: freight,
        overheads,
        rtoRate,
        total,
        billableWeight: chargeable,
        packages: params.packages.map((pkg) => ({
          deadWeight: pkg.weight,
          volumetricWeight: volumetricKg(pkg.length, pkg.breadth, pkg.height),
          billableWeight: Math.max(pkg.weight, volumetricKg(pkg.length, pkg.breadth, pkg.height)),
        })),
      },
      tag: total === cheapest ? "economy" : undefined,
    };
  });
}

export const ratesApi = {
  getDelhiveryRate: async (params: DelhiveryRateParams): Promise<DelhiveryRate> => {
    const { data } = await api.get<DelhiveryRate>("/rates/delhivery", {
      params: {
        o_pin: params.originPin,
        d_pin: params.destinationPin,
        cgm: params.chargeableGrams,
        md: params.mode,
      },
    });
    return data;
  },

  getAvailableCouriers: async (
    params: AvailableCouriersParams,
  ): Promise<AvailableCourier[]> => {
    if (shouldUseCourierApi()) {
      return getCourierApiRates(params);
    }

    const { data } = await api.post<{ success: boolean; data: AvailableCourier[] }>(
      "/rates/available",
      params,
    );
    return data.data;
  },

  getRateCard: async (): Promise<RateCardResponse> => {
    const { data } = await api.get<RateCardResponse>("/rates/rate-card");
    return data;
  },

  getB2bAvailableCouriers: async (
    params: B2bAvailableCouriersParams,
  ): Promise<B2bAvailableCourier[]> => {
    if (shouldUseCourierApi()) {
      return getCourierApiB2bRates(params);
    }

    const { data } = await api.post<{ success: boolean; data: B2bAvailableCourier[] }>(
      "/rates/b2b/available",
      params,
    );
    return data.data;
  },
};
