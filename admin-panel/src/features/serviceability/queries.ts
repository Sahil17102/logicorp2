import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { readStaticLocations } from "@/lib/staticSeeds";
import { locationsApi } from "./api";
import type {
  ListLocationsResponse,
  CreateLocationPayload,
  BulkImportPayload,
  BulkImportResponse,
  BulkDeletePayload,
  PincodeLookupResponse,
} from "./types";

export const LOCATIONS_KEY = ["locations"] as const;

export interface LocationFilters {
  search?: string;
  state?: string;
  tag?: string;
  isActive?: string;
  page?: number;
  limit?: number;
}

function useInvalidateLocations() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: LOCATIONS_KEY });
}

function initialLocationsData(filters?: LocationFilters): ListLocationsResponse | undefined {
  const hasFilter = Boolean(filters?.search || filters?.state || filters?.tag || filters?.isActive);
  const page = filters?.page ?? 1;
  if (hasFilter || page !== 1) return undefined;

  const all = [...readStaticLocations()].sort((a, b) => a.pincode.localeCompare(b.pincode));
  if (all.length === 0) return undefined;

  const limit = filters?.limit ?? 100;
  return {
    locations: all.slice(0, limit),
    pagination: {
      page,
      limit,
      total: all.length,
      totalPages: Math.max(1, Math.ceil(all.length / limit)),
    },
    stats: {
      total: all.length,
      active: all.filter((location) => location.isActive).length,
      inactive: all.filter((location) => !location.isActive).length,
    },
  };
}

export function useLocations(filters?: LocationFilters) {
  return useQuery<ListLocationsResponse>({
    queryKey: [...LOCATIONS_KEY, filters],
    queryFn: () => locationsApi.list(filters),
    initialData: () => initialLocationsData(filters),
    initialDataUpdatedAt: 0,
    placeholderData: keepPreviousData,
  });
}

export function useCreateLocation() {
  const onSuccess = useInvalidateLocations();
  return useMutation({
    mutationFn: (payload: CreateLocationPayload) =>
      locationsApi.create(payload),
    onSuccess,
  });
}

export function useBulkImportLocations() {
  const onSuccess = useInvalidateLocations();
  return useMutation<BulkImportResponse, Error, BulkImportPayload>({
    mutationFn: (payload) => locationsApi.bulkImport(payload),
    onSuccess,
  });
}

export function useDeleteLocation() {
  const onSuccess = useInvalidateLocations();
  return useMutation({
    mutationFn: (id: string) => locationsApi.delete(id),
    onSuccess,
  });
}

export function useBulkDeleteLocations() {
  const onSuccess = useInvalidateLocations();
  return useMutation({
    mutationFn: (payload: BulkDeletePayload) =>
      locationsApi.bulkDelete(payload),
    onSuccess,
  });
}

export function useToggleLocation() {
  const onSuccess = useInvalidateLocations();
  return useMutation({
    mutationFn: (id: string) => locationsApi.toggle(id),
    onSuccess,
  });
}

export function usePincodeLookup() {
  return useMutation<PincodeLookupResponse, Error, string>({
    mutationFn: (pincode) => locationsApi.lookupPincode(pincode),
  });
}
