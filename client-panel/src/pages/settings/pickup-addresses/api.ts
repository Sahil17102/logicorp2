import { api } from "@/lib/api";
import { courierApi, shouldUseCourierApi } from "@/lib/courierApi";
import type {
  PickupAddress,
  PickupAddressListResponse,
  PickupAddressSingleResponse,
  PickupAddressFormValues,
  BulkAddressImportRow,
  BulkImportResponse,
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function makePickupAddress(
  id: string,
  payload: PickupAddressFormValues | BulkAddressImportRow,
): PickupAddress {
  return {
    id,
    nickname: payload.nickname,
    contactName: payload.contactName,
    phone: payload.phone,
    email: payload.email,
    role: (payload.role || "warehouse_manager") as PickupAddress["role"],
    landmark: payload.landmark,
    addressLine1: payload.addressLine1,
    addressLine2: payload.addressLine2,
    city: payload.city,
    state: payload.state,
    country: payload.country || "India",
    pincode: payload.pincode,
    gstNumber: payload.gstNumber,
    isPrimary: false,
    addressType: "pickup",
    isSameAsRto: "isSameAsRto" in payload ? payload.isSameAsRto : true,
    rtoAddress: "rtoAddress" in payload && payload.rtoAddress ? payload.rtoAddress : undefined,
    latitude: "latitude" in payload ? payload.latitude : undefined,
    longitude: "longitude" in payload ? payload.longitude : undefined,
    isActive: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

async function registerProviderPickupAddress(
  payload: PickupAddressFormValues | BulkAddressImportRow,
): Promise<PickupAddress> {
  const result = await courierApi.registerPickupAddress({
    address_nick_name: payload.nickname,
    contact_name: payload.contactName,
    phone: payload.phone,
    email: payload.email || undefined,
    address_line_1: payload.addressLine1,
    address_line_2: payload.addressLine2 || undefined,
    pincode: payload.pincode,
    city: payload.city,
    state: payload.state,
  });
  if (!result.status) throw new Error(result.msg || "Pickup address registration failed");
  const address = makePickupAddress(String(result.pickup_address_id), payload);
  const existing = courierApi.readStoredPickupAddresses<PickupAddress>();
  courierApi.writeStoredPickupAddresses([
    { ...address, isPrimary: existing.length === 0 },
    ...existing.filter((item) => item.id !== address.id),
  ]);
  return { ...address, isPrimary: existing.length === 0 };
}

export const pickupAddressApi = {
  list: async (): Promise<PickupAddressListResponse> => {
    if (shouldUseCourierApi()) {
      return { addresses: courierApi.readStoredPickupAddresses<PickupAddress>() };
    }

    const { data } = await api.get("/pickup-addresses");
    return data;
  },

  getById: async (id: string): Promise<PickupAddressSingleResponse> => {
    if (shouldUseCourierApi()) {
      const address = courierApi.readStoredPickupAddresses<PickupAddress>().find((item) => item.id === id);
      if (!address) throw new Error("Pickup address not found");
      return { message: "Pickup address loaded", address };
    }

    const { data } = await api.get(`/pickup-addresses/${id}`);
    return data;
  },

  create: async (
    payload: PickupAddressFormValues,
  ): Promise<PickupAddressSingleResponse> => {
    if (shouldUseCourierApi()) {
      const address = await registerProviderPickupAddress(payload);
      return { message: "Pickup address created successfully", address };
    }

    const { data } = await api.post("/pickup-addresses", payload);
    return data;
  },

  bulkImport: async (
    addresses: BulkAddressImportRow[],
  ): Promise<BulkImportResponse> => {
    if (shouldUseCourierApi()) {
      const results = [];
      for (let i = 0; i < addresses.length; i += 1) {
        try {
          await registerProviderPickupAddress(addresses[i]);
          results.push({ rowNumber: i + 1, nickname: addresses[i].nickname, success: true });
        } catch (err) {
          results.push({
            rowNumber: i + 1,
            nickname: addresses[i].nickname,
            success: false,
            error: err instanceof Error ? err.message : "Pickup address registration failed",
          });
        }
      }
      const successCount = results.filter((result) => result.success).length;
      return {
        message: "Bulk pickup import completed",
        total: addresses.length,
        successCount,
        failedCount: addresses.length - successCount,
        results,
      };
    }

    const { data } = await api.post("/pickup-addresses/bulk", { addresses });
    return data;
  },

  update: async (
    id: string,
    payload: Partial<PickupAddressFormValues>,
  ): Promise<PickupAddressSingleResponse> => {
    if (shouldUseCourierApi()) {
      const addresses = courierApi.readStoredPickupAddresses<PickupAddress>();
      const current = addresses.find((item) => item.id === id);
      if (!current) throw new Error("Pickup address not found");
      const updated = { ...current, ...payload, updatedAt: nowIso() } as PickupAddress;
      courierApi.writeStoredPickupAddresses([updated, ...addresses.filter((item) => item.id !== id)]);
      return { message: "Pickup address updated locally", address: updated };
    }

    const { data } = await api.put(`/pickup-addresses/${id}`, payload);
    return data;
  },

  delete: async (id: string): Promise<{ message: string }> => {
    if (shouldUseCourierApi()) {
      const addresses = courierApi.readStoredPickupAddresses<PickupAddress>();
      courierApi.writeStoredPickupAddresses(addresses.filter((item) => item.id !== id));
      return { message: "Pickup address removed locally" };
    }

    const { data } = await api.delete(`/pickup-addresses/${id}`);
    return data;
  },

  setPrimary: async (id: string): Promise<PickupAddressSingleResponse> => {
    if (shouldUseCourierApi()) {
      const addresses = courierApi.readStoredPickupAddresses<PickupAddress>();
      const updated = addresses.map((item) => ({ ...item, isPrimary: item.id === id }));
      courierApi.writeStoredPickupAddresses(updated);
      const address = updated.find((item) => item.id === id);
      if (!address) throw new Error("Pickup address not found");
      return { message: "Primary pickup address updated", address };
    }

    const { data } = await api.patch(`/pickup-addresses/${id}/primary`);
    return data;
  },
};
