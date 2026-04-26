// File purpose:
// Central source of truth for location-based food delivery pricing.

export const DELIVERY_LOCATIONS = [
  { id: "state", label: "State Quad", fee: 3.99 },
  { id: "indigenous", label: "Indigenous Quad", fee: 3.99 },
  { id: "dutch", label: "Dutch Quad", fee: 3.99 },
  { id: "colonial", label: "Colonial Quad", fee: 3.99 },
  { id: "empire", label: "Empire Commons", fee: 5.99 },
  { id: "freedom", label: "Freedom Apartments", fee: 5.99 },
  { id: "liberty", label: "Liberty Terrace", fee: 4.99 },
  { id: "library", label: "Main Library", fee: 3.99 },
  { id: "science-library", label: "Science Library", fee: 4.99 },
  { id: "massry", label: "Massry Center", fee: 4.99 },
  { id: "lecture-center", label: "Lecture Center", fee: 3.99 },
];

const deliveryLocationById = new Map(DELIVERY_LOCATIONS.map((location) => [location.id, location]));

export function normalizeDeliveryLocationId(value) {
  return String(value || "").trim().toLowerCase();
}

export function getDeliveryPricingForLocation(locationId) {
  const normalizedLocationId = normalizeDeliveryLocationId(locationId);

  if (!normalizedLocationId) {
    return {
      ok: false,
      error: "Choose a delivery location before placing the order.",
    };
  }

  const location = deliveryLocationById.get(normalizedLocationId);

  if (!location) {
    return {
      ok: false,
      error: "That delivery location is not supported yet. Choose one of the listed campus locations.",
    };
  }

  if (!Number.isFinite(location.fee) || location.fee <= 0) {
    return {
      ok: false,
      error: `Delivery pricing is missing for ${location.label}. Try another location or contact support.`,
    };
  }

  return {
    ok: true,
    id: location.id,
    label: location.label,
    fee: location.fee,
    payment: location.fee.toFixed(2),
  };
}
