import { api } from "@/lib/api";
import { readStaticLocations, writeStaticLocations } from "@/lib/staticSeeds";
import type {
  LocationListItem,
  LocationTag,
  ListLocationsResponse,
  CreateLocationPayload,
  BulkImportPayload,
  BulkImportResponse,
  BulkDeletePayload,
  PincodeLookupResponse,
} from "./types";

const useStaticData = !import.meta.env.VITE_API_URL || import.meta.env.VITE_STATIC_DATA_ENABLED === "true";
const MIN_FULL_DATASET_SIZE = 1000;
const PINCODE_CSV_PRIMARY_URL =
  import.meta.env.VITE_PINCODE_CSV_PRIMARY_URL ||
  "https://raw.githubusercontent.com/dropdevrahul/pincodes-india/main/pincode.csv";
const PINCODE_CSV_FALLBACK_URL =
  import.meta.env.VITE_PINCODE_CSV_SECONDARY_URL ||
  "https://raw.githubusercontent.com/kishorek/India-Codes/master/csv/pincodes.csv";

const STATE_NORMALIZE: Record<string, string> = {
  orissa: "Odisha",
  uttaranchal: "Uttarakhand",
  pondicherry: "Puducherry",
  "andaman nicobar": "Andaman and Nicobar Islands",
  lakshdweep: "Lakshadweep",
  "jammu & kashmir": "Jammu and Kashmir",
  "dadra & nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "dadra & nagar haveli ": "Dadra and Nagar Haveli and Daman and Diu",
  "daman & diu": "Dadra and Nagar Haveli and Daman and Diu",
  hazaribagh: "Jharkhand",
};

const ZONE_MAP: Record<string, LocationTag[]> = {
  "Jammu and Kashmir": ["north"],
  Ladakh: ["north", "special_zone"],
  "Himachal Pradesh": ["north"],
  Punjab: ["north"],
  Chandigarh: ["north"],
  Haryana: ["north"],
  Uttarakhand: ["north"],
  "Uttar Pradesh": ["north"],
  Delhi: ["north", "metro"],
  Rajasthan: ["north"],
  "Andhra Pradesh": ["south"],
  Telangana: ["south"],
  Karnataka: ["south"],
  Kerala: ["south"],
  "Tamil Nadu": ["south"],
  Puducherry: ["south"],
  Lakshadweep: ["south", "special_zone"],
  "Andaman and Nicobar Islands": ["south", "special_zone"],
  Bihar: ["east"],
  Jharkhand: ["east"],
  Odisha: ["east"],
  "West Bengal": ["east"],
  Sikkim: ["east"],
  Assam: ["east"],
  Meghalaya: ["east"],
  "Arunachal Pradesh": ["east"],
  Nagaland: ["east"],
  Manipur: ["east"],
  Mizoram: ["east"],
  Tripura: ["east"],
  Gujarat: ["west"],
  Maharashtra: ["west"],
  Goa: ["west"],
  "Dadra and Nagar Haveli and Daman and Diu": ["west"],
  "Madhya Pradesh": ["west"],
  Chhattisgarh: ["west"],
};

const METRO_DISTRICTS = new Set([
  "MUMBAI",
  "MUMBAI SUBURBAN",
  "NEW DELHI",
  "NORTH DELHI",
  "SOUTH DELHI",
  "EAST DELHI",
  "WEST DELHI",
  "CENTRAL DELHI",
  "NORTH EAST DELHI",
  "NORTH WEST DELHI",
  "SOUTH EAST DELHI",
  "SOUTH WEST DELHI",
  "SHAHDARA",
  "CHENNAI",
  "KOLKATA",
  "BANGALORE",
  "BENGALURU",
  "BENGALURU URBAN",
  "HYDERABAD",
  "PUNE",
  "AHMEDABAD",
]);

let fullDatasetPromise: Promise<LocationListItem[]> | null = null;

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

function parseQuotedCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeState(value: string): string {
  const trimmed = value.trim();
  return STATE_NORMALIZE[trimmed.toLowerCase()] ?? titleCase(trimmed);
}

function tagsFor(state: string, district?: string): LocationTag[] {
  const tags = [...(ZONE_MAP[state] ?? [])];
  if (district && METRO_DISTRICTS.has(district.toUpperCase()) && !tags.includes("metro")) {
    tags.push("metro");
  }
  return tags;
}

function parseDropdev(csv: string, createdAt: string): Map<string, LocationListItem> {
  const map = new Map<string, LocationListItem>();
  const lines = csv.split(/\r?\n/);
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const fields = parseQuotedCsvLine(line);
    if (fields.length < 9) continue;

    const pincode = fields[4];
    const district = fields[7];
    const state = titleCase(fields[8]);
    if (!/^\d{6}$/.test(pincode) || map.has(pincode)) continue;

    map.set(pincode, {
      id: `loc-${pincode}`,
      pincode,
      city: titleCase(district),
      state,
      tags: tagsFor(state, district),
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    });
  }
  return map;
}

function parseKishorek(csv: string, createdAt: string): Map<string, LocationListItem> {
  const map = new Map<string, LocationListItem>();
  const lines = csv.split(/\r?\n/);
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const fields = parseQuotedCsvLine(line);
    if (fields.length < 5) continue;

    const pincode = fields[1];
    const city = fields[3] || fields[2];
    const state = normalizeState(fields[4]);
    if (!/^\d{6}$/.test(pincode) || map.has(pincode)) continue;

    map.set(pincode, {
      id: `loc-${pincode}`,
      pincode,
      city: titleCase(city),
      state,
      tags: tagsFor(state, city),
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    });
  }
  return map;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load pincode dataset: ${response.status}`);
  return response.text();
}

function safeWriteStaticLocations(locations: LocationListItem[]): void {
  try {
    writeStaticLocations(locations);
  } catch {
    // Large all-India datasets can exceed localStorage in some browsers.
  }
}

async function loadFullPincodeDataset(): Promise<LocationListItem[]> {
  const existing = readStaticLocations();
  if (existing.length >= MIN_FULL_DATASET_SIZE) return existing;

  const createdAt = nowIso();
  const [primary, fallback] = await Promise.allSettled([
    fetchText(PINCODE_CSV_PRIMARY_URL),
    fetchText(PINCODE_CSV_FALLBACK_URL),
  ]);

  const merged = new Map<string, LocationListItem>();
  if (primary.status === "fulfilled") {
    parseDropdev(primary.value, createdAt).forEach((location, pincode) => merged.set(pincode, location));
  }
  if (fallback.status === "fulfilled") {
    parseKishorek(fallback.value, createdAt).forEach((location, pincode) => {
      if (!merged.has(pincode)) merged.set(pincode, location);
    });
  }

  if (merged.size < MIN_FULL_DATASET_SIZE) return existing;

  existing.forEach((location) => {
    if (merged.has(location.pincode)) {
      merged.set(location.pincode, { ...merged.get(location.pincode)!, ...location });
    } else {
      merged.set(location.pincode, location);
    }
  });

  const locations = Array.from(merged.values()).sort((a, b) => a.pincode.localeCompare(b.pincode));
  safeWriteStaticLocations(locations);
  return locations;
}

async function getStaticLocations(): Promise<LocationListItem[]> {
  if (!fullDatasetPromise) {
    fullDatasetPromise = loadFullPincodeDataset().catch(() => readStaticLocations());
  }
  return fullDatasetPromise;
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
      return filterLocations(await getStaticLocations(), params);
    }

    const { data } = await api.get("/locations", { params });
    return data as ListLocationsResponse;
  },

  create: async (
    payload: CreateLocationPayload,
  ): Promise<{ id: string; pincode: string; city: string; state: string }> => {
    if (useStaticData) {
      const locations = await getStaticLocations();
      const location = makeLocation(payload);
      safeWriteStaticLocations([location, ...locations.filter((item) => item.pincode !== location.pincode)]);
      fullDatasetPromise = null;
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
      const existing = await getStaticLocations();
      const existingPincodes = new Set(existing.map((location) => location.pincode));
      const additions = payload.locations
        .filter((location) => !existingPincodes.has(location.pincode))
        .map(makeLocation);
      safeWriteStaticLocations([...additions, ...existing]);
      fullDatasetPromise = null;
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
      safeWriteStaticLocations((await getStaticLocations()).filter((location) => location.id !== id));
      fullDatasetPromise = null;
      return;
    }

    await api.delete(`/locations/${id}`);
  },

  bulkDelete: async (
    payload: BulkDeletePayload,
  ): Promise<{ deletedCount: number }> => {
    if (useStaticData) {
      const ids = new Set(payload.ids);
      const locations = await getStaticLocations();
      safeWriteStaticLocations(locations.filter((location) => !ids.has(location.id)));
      fullDatasetPromise = null;
      return { deletedCount: locations.filter((location) => ids.has(location.id)).length };
    }

    const { data } = await api.post("/locations/bulk-delete", payload);
    return data as { deletedCount: number };
  },

  toggle: async (id: string): Promise<{ message: string }> => {
    if (useStaticData) {
      const locations = await getStaticLocations();
      safeWriteStaticLocations(locations.map((location) =>
        location.id === id
          ? { ...location, isActive: !location.isActive, updatedAt: nowIso() }
          : location,
      ));
      fullDatasetPromise = null;
      return { message: "Location updated" };
    }

    const { data } = await api.patch(`/locations/${id}/toggle`);
    return data as { message: string };
  },

  lookupPincode: async (pincode: string): Promise<PincodeLookupResponse> => {
    if (useStaticData) {
      const location = (await getStaticLocations()).find((item) => item.pincode === pincode);
      if (location) return { city: location.city, state: location.state };
      throw new Error("Pincode not found in seeded locations");
    }

    const { data } = await api.get(`/locations/pincode-lookup/${pincode}`);
    return data as PincodeLookupResponse;
  },
};
