import { api } from "@/lib/api";
import {
  DEFAULT_B2B_ZONES,
  defaultB2bAdditionalCharges,
  defaultB2bPincodes,
  defaultB2bZoneRates,
} from "../pricingDefaults";
import type {
  B2bZone,
  B2bPincode,
  B2bPagination,
  CreateB2bPincodePayload,
  B2bZoneRate,
  UpsertB2bZoneRatePayload,
  B2bAdditionalCharge,
  UpsertB2bAdditionalChargePayload,
  CalculateB2bRatePayload,
  B2bAvailableCourier,
} from "./types";

// ── Zones ──

export const b2bZonesApi = {
  list: async (): Promise<{ data: B2bZone[] }> => {
    try {
      const { data } = await api.get("/b2b/zones");
      return data.data?.length > 0 ? data : { data: DEFAULT_B2B_ZONES };
    } catch {
      return { data: DEFAULT_B2B_ZONES };
    }
  },

  create: async (payload: { code: string; name: string; description?: string }): Promise<{ data: B2bZone }> => {
    const { data } = await api.post("/b2b/zones", payload);
    return data;
  },

  update: async (id: string, payload: Partial<B2bZone>): Promise<{ data: B2bZone }> => {
    const { data } = await api.put(`/b2b/zones/${id}`, payload);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/b2b/zones/${id}`);
  },

  toggle: async (id: string): Promise<{ data: B2bZone }> => {
    const { data } = await api.patch(`/b2b/zones/${id}/toggle`);
    return data;
  },
};

// ── Pincodes ──

export const b2bPincodesApi = {
  list: async (params?: {
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
  }): Promise<{ data: B2bPincode[]; pagination: B2bPagination }> => {
    try {
      const { data } = await api.get("/b2b/pincodes", { params });
      return data.data?.length > 0 ? data : defaultB2bPincodes(params);
    } catch {
      return defaultB2bPincodes(params);
    }
  },

  create: async (payload: CreateB2bPincodePayload): Promise<{ data: B2bPincode }> => {
    const { data } = await api.post("/b2b/pincodes", payload);
    return data;
  },

  update: async (id: string, payload: Partial<CreateB2bPincodePayload>): Promise<{ data: B2bPincode }> => {
    const { data } = await api.put(`/b2b/pincodes/${id}`, payload);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/b2b/pincodes/${id}`);
  },

  bulkImport: async (pincodes: CreateB2bPincodePayload[]): Promise<{ inserted: number; total: number }> => {
    const { data } = await api.post("/b2b/pincodes/bulk-import", { pincodes });
    return data;
  },
};

// ── Zone Rates ──

export const b2bZoneRatesApi = {
  list: async (params?: {
    courier?: string;
    plan?: string;
    originZone?: string;
    destinationZone?: string;
  }): Promise<{ data: B2bZoneRate[] }> => {
    try {
      const { data } = await api.get("/b2b/zone-rates", { params });
      return data.data?.length > 0 ? data : { data: defaultB2bZoneRates(params) };
    } catch {
      return { data: defaultB2bZoneRates(params) };
    }
  },

  upsert: async (payload: UpsertB2bZoneRatePayload): Promise<{ data: B2bZoneRate }> => {
    const { data } = await api.post("/b2b/zone-rates", payload);
    return data;
  },

  batchUpsert: async (rates: UpsertB2bZoneRatePayload[]): Promise<{ upserted: number; modified: number }> => {
    const { data } = await api.post("/b2b/zone-rates/batch", { rates });
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/b2b/zone-rates/${id}`);
  },
};

// ── Additional Charges ──

export const b2bAdditionalChargesApi = {
  list: async (params?: {
    courier?: string;
    plan?: string;
  }): Promise<{ data: B2bAdditionalCharge[] }> => {
    try {
      const { data } = await api.get("/b2b/additional-charges", { params });
      return data.data?.length > 0 ? data : { data: defaultB2bAdditionalCharges(params) };
    } catch {
      return { data: defaultB2bAdditionalCharges(params) };
    }
  },

  upsert: async (payload: UpsertB2bAdditionalChargePayload): Promise<{ data: B2bAdditionalCharge }> => {
    const { data } = await api.post("/b2b/additional-charges", payload);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/b2b/additional-charges/${id}`);
  },
};

// ── Rate Calculator ──

export const b2bRateCalculatorApi = {
  calculate: async (payload: CalculateB2bRatePayload): Promise<{ data: B2bAvailableCourier[] }> => {
    const { data } = await api.post("/b2b/calculate-rate", payload);
    return data;
  },
};
