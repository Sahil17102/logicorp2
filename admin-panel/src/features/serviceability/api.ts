import { api } from "@/lib/api";
import { readStaticLocations, writeStaticLocations } from "@/lib/staticSeeds";
import type {
  LocationListItem,
  ListLocationsResponse,
  CreateLocationPayload,
  BulkImportPayload,
  BulkImportResponse,
  BulkDeletePayload,
  PincodeLookupResponse,
} from "./types";

const useStaticData = !import.meta.env.VITE_API_URL || import.meta.env.VITE_STATIC_DATA_ENABLED === "true";

function nowIso(): string {
  return new Date().toISOString();
}

function makeLocation(payload: CreateLocationPayload): LocationListItem {
  const createdAt = nowIso();
  return {
    id: `loc-${payload.pincode}`,
    pincode: payload.pincode,
    city: payload.city,
    state: payload.state,
    tags: payload.tags ?? [],
    isActive: payload.isActive ?? true,
    createdAt,
    updatedAt: createdAt,
  };
}

function filterLocations(
  locations: LocationListItem[],
  params?: {
    search?: string;
    state?: string;
    tag?: string;
    isActive?: string;
    page?: number;
    limit?: number;
  },
): ListLocationsResponse {
  let filtered = [...locations];
  if (params?.search) {
    const query = params.search.toLowerCase();
    filtered = filtered.filter((location) =>
      [location.pincode, location.city, location.state]
        .some((value) => value.toLowerCase().includes(query)),
    );
  }
  if (params?.state) filtered = filtered.filter((location) => location.state === params.state);
  if (params?.tag) filtered = filtered.filter((location) => location.tags.includes(params.tag as LocationListItem["tags"][number]));
  if (params?.isActive) filtered = filtered.filter((location) => location.isActive === (params.isActive === "true"));

  const page = params?.page ?? 1;
  const limit = params?.limit ?? 100;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const pageItems = filtered.slice(start, start + limit);

  return {
    locations: pageItems,
    pagination: { page, limit, total, totalPages },
    stats: {
      total: locations.length,
      active: locations.filter((location) => location.isActive).length,
      inactive: locations.filter((location) => !location.isActive).length,
    },
  };
}

export const locationsApi = {
  list: async (params?: {
    search?: string;
    state?: string;
    tag?: string;
    isActive?: string;
    page?: number;
    limit?: number;
  }): Promise<ListLocationsResponse> => {
    if (useStaticData) {
      return filterLocations(readStaticLocations(), params);
    }

    const { data } = await api.get("/locations", { params });
    return data as ListLocationsResponse;
  },

  create: async (
    payload: CreateLocationPayload,
  ): Promise<{ id: string; pincode: string; city: string; state: string }> => {
    if (useStaticData) {
      const locations = readStaticLocations();
      const location = makeLocation(payload);
      writeStaticLocations([location, ...locations.filter((item) => item.pincode !== location.pincode)]);
      return {
        id: location.id,
        pincode: location.pincode,
        city: location.city,
        state: location.state,
      };
    }

    const { data } = await api.post("/locations", payload);
    return data.location as {
      id: string;
      pincode: string;
      city: string;
      state: string;
    };
  },

  bulkImport: async (
    payload: BulkImportPayload,
  ): Promise<BulkImportResponse> => {
    if (useStaticData) {
      const existing = readStaticLocations();
      const existingPincodes = new Set(existing.map((location) => location.pincode));
      const additions = payload.locations
        .filter((location) => !existingPincodes.has(location.pincode))
        .map(makeLocation);
      writeStaticLocations([...additions, ...existing]);
      return {
        message: "Locations imported",
        inserted: additions.length,
        duplicates: payload.locations.length - additions.length,
      };
    }

    const { data } = await api.post("/locations/import", payload);
    return data as BulkImportResponse;
  },

  delete: async (id: string): Promise<void> => {
    if (useStaticData) {
      writeStaticLocations(readStaticLocations().filter((location) => location.id !== id));
      return;
    }

    await api.delete(`/locations/${id}`);
  },

  bulkDelete: async (
    payload: BulkDeletePayload,
  ): Promise<{ deletedCount: number }> => {
    if (useStaticData) {
      const ids = new Set(payload.ids);
      const locations = readStaticLocations();
      writeStaticLocations(locations.filter((location) => !ids.has(location.id)));
      return { deletedCount: locations.filter((location) => ids.has(location.id)).length };
    }

    const { data } = await api.post("/locations/bulk-delete", payload);
    return data as { deletedCount: number };
  },

  toggle: async (id: string): Promise<{ message: string }> => {
    if (useStaticData) {
      const locations = readStaticLocations();
      writeStaticLocations(locations.map((location) =>
        location.id === id
          ? { ...location, isActive: !location.isActive, updatedAt: nowIso() }
          : location,
      ));
      return { message: "Location updated" };
    }

    const { data } = await api.patch(`/locations/${id}/toggle`);
    return data as { message: string };
  },

  lookupPincode: async (pincode: string): Promise<PincodeLookupResponse> => {
    if (useStaticData) {
      const location = readStaticLocations().find((item) => item.pincode === pincode);
      if (location) return { city: location.city, state: location.state };
      throw new Error("Pincode not found in seeded locations");
    }

    const { data } = await api.get(`/locations/pincode-lookup/${pincode}`);
    return data as PincodeLookupResponse;
  },
};
