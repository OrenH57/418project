// File purpose:
// Shared request-form data and helper functions.
// Keeps campus-specific choices out of the request page so the UI stays easier to read.

export const GET_MOBILE_URL = "https://get.cbord.com/albany/full/food_home.php";
export const MIN_PAYMENT_OFFER = 3.99;
export const serviceTypes = [
  { value: "food", label: "Food Delivery", suggestedPrice: "Auto by location" },
  { value: "ride", label: "Ride", suggestedPrice: "$3.99 + optional tip" },
];

export const housingLocations = [
  {
    id: "state",
    label: "State Quad",
    buildings: [
      "Eastman Tower",
      "Anthony Hall",
      "Cooper Hall",
      "Fulton Hall",
      "Irving Hall",
      "Melville Hall",
      "Steinmetz Hall",
      "Tappan Hall",
      "Whitman Hall",
    ],
  },
  {
    id: "indigenous",
    label: "Indigenous Quad",
    buildings: [
      "Mohawk Tower",
      "Adirondack Hall",
      "Cayuga Hall",
      "Mahican Hall",
      "Montauk Hall",
      "Oneida Hall",
      "Onondaga Hall",
      "Seneca Hall",
      "Tuscarora Hall",
    ],
  },
  {
    id: "dutch",
    label: "Dutch Quad",
    buildings: [
      "Stuyvesant Tower",
      "Beverwyck Hall",
      "Bleeker Hall",
      "Ryckman Hall",
      "Schuyler Hall",
      "Ten Broeck Hall",
      "Ten Eyck Hall",
      "Van Cortlandt Hall",
      "Van Rensselaer Hall",
    ],
  },
  {
    id: "colonial",
    label: "Colonial Quad",
    buildings: [
      "Livingston Tower",
      "Clinton Hall",
      "Delancey Hall",
      "Hamilton Hall",
      "Herkimer Hall",
      "Johnson Hall",
      "Morris Hall",
      "Paine Hall",
      "Zenger Hall",
    ],
  },
  {
    id: "empire",
    label: "Empire Commons",
    buildings: [
      "A1",
      "A2",
      "A3",
      "A4",
      "B1",
      "B2",
      "B3",
      "B4",
      "C1",
      "C2",
      "C3",
      "C4",
      "D1",
      "D2",
      "D3",
      "D4",
      "E1",
      "E2",
      "E3",
      "E4",
      "F1",
      "F2",
      "F3",
      "F4",
      "G1",
      "G2",
      "G3",
      "G4",
    ],
  },
  {
    id: "freedom",
    label: "Freedom Apartments",
    buildings: ["Truth Cluster", "Stanton Cluster", "Northup Cluster", "Lazarus Cluster"],
  },
  {
    id: "liberty",
    label: "Liberty Terrace",
    buildings: ["Building 1", "Building 2", "Community Area"],
  },
  {
    id: "library",
    label: "Main Library",
    buildings: ["Main Library"],
  },
  {
    id: "science-library",
    label: "Science Library",
    buildings: ["Science Library"],
  },
  {
    id: "massry",
    label: "Massry Center",
    buildings: ["Massry Center"],
  },
  {
    id: "lecture-center",
    label: "Lecture Center",
    buildings: Array.from({ length: 24 }, (_, index) => `LC ${index + 1}`),
  },
];

export const deliveryFeesByLocationId: Record<string, number> = {
  state: 3.99,
  indigenous: 3.99,
  dutch: 3.99,
  colonial: 3.99,
  empire: 5.99,
  freedom: 5.99,
  liberty: 4.99,
  library: 3.99,
  "science-library": 4.99,
  massry: 4.99,
  "lecture-center": 3.99,
};

export function getDeliveryFeeForLocation(locationId: string) {
  const fee = deliveryFeesByLocationId[locationId];
  return Number.isFinite(fee) ? fee : null;
}

export function formatDeliveryFee(amount: number) {
  return amount.toFixed(2);
}

export function parseOptionalTip(value: string) {
  if (!value.trim()) {
    return { ok: true, amount: 0 };
  }

  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) {
    return { ok: false, amount: 0 };
  }

  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, amount: 0 };
  }

  return { ok: true, amount: Number(amount.toFixed(2)) };
}

export function formatPaymentTotal(basePayment: number, tipAmount: number) {
  return (basePayment + tipAmount).toFixed(2);
}

export function getHelperCopy(serviceType: string) {
  if (serviceType === "food") {
    return {
      title: "Campus delivery details",
      pickupLabel: "Campus Center Restaurant *",
      destinationLabel: "Delivery Location *",
      destinationPlaceholder: "Dorm, classroom, or study lounge",
      notesPlaceholder: "Pickup name, allergies, or handoff instructions...",
    };
  }

  return {
    title: "Ride details",
    pickupLabel: "Pickup Location *",
    destinationLabel: "Destination *",
    destinationPlaceholder: "Residence hall, classroom, or campus stop",
    notesPlaceholder: "Add pickup details or timing notes...",
  };
}

export function buildFoodNotes(orderNumber: string, orderItems: string, notes: string) {
  return [
    `GET Mobile order #: ${orderNumber.trim()}`,
    `Items: ${orderItems.trim()}`,
    notes.trim() ? `Extra notes: ${notes.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildHousingDestination(areaLabel: string, buildingLabel: string, details: string) {
  const parts = [areaLabel, buildingLabel, details.trim()].filter(Boolean);
  return parts.join(" - ");
}

export function getFloorOptions(areaId: string) {
  if (areaId === "library") {
    return ["Basement", "1st floor", "2nd floor", "3rd floor"];
  }

  if (areaId === "science-library") {
    return ["1st floor", "2nd floor", "3rd floor"];
  }

  if (areaId === "massry") {
    return ["1st floor", "2nd floor", "3rd floor"];
  }

  return [];
}

export function getMeetSpotOptions(areaId: string, buildingLabel: string) {
  const normalizedBuilding = buildingLabel.toLowerCase();

  if (areaId === "empire" || areaId === "freedom" || areaId === "liberty") {
    return ["Front entrance", "Back entrance"];
  }

  if (areaId === "library" || areaId === "science-library" || areaId === "massry") {
    return ["Front entrance", "Back entrance", "Main lobby"];
  }

  if (areaId === "lecture-center") {
    return ["Meet outside classroom", "Main lobby", "Podium entrance"];
  }

  if (normalizedBuilding.includes("tower")) {
    return ["Outside tower entrance", "Front of quad", "Back staircase of quad"];
  }

  return ["Front entrance", "Back entrance", "Front of quad", "Back staircase of quad"];
}
