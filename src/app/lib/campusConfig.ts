// File purpose:
// Shared request-form data and helper functions.
// Keeps campus-specific choices out of the request page so the UI stays easier to read.

export const GET_MOBILE_URL = "https://get.cbord.com/albany/full/food_home.php";
export const MIN_PAYMENT_OFFER = 4;
export const DISCOUNT_RATE = 0.4;

export const serviceTypes = [
  { value: "food", label: "Food Delivery", suggestedPrice: "$5-10" },
  { value: "discount", label: "Discount Dollars (Coming Soon)", suggestedPrice: "Launching soon" },
  { value: "ride", label: "Ride", suggestedPrice: "$5-15" },
  { value: "moving", label: "Moving Help", suggestedPrice: "$20-50" },
  { value: "tutor", label: "Tutoring", suggestedPrice: "$15-30/hr" },
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
];

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

  if (serviceType === "discount") {
    return {
      title: "Discount Dollars preview",
      pickupLabel: "Campus restaurant",
      destinationLabel: "Pickup location",
      destinationPlaceholder: "Coming soon",
      notesPlaceholder: "Discount Dollars is an incoming feature for future campus restaurant orders.",
    };
  }

  if (serviceType === "tutor") {
    return {
      title: "Tutoring details",
      pickupLabel: "Subject / Topic *",
      destinationLabel: "Meeting Location *",
      destinationPlaceholder: "Library, Zoom, or study room",
      notesPlaceholder: "Share any course details or prep notes...",
    };
  }

  return {
    title: "Service details",
    pickupLabel: "Pickup Location *",
    destinationLabel: "Destination *",
    destinationPlaceholder: "Enter destination",
    notesPlaceholder: "Add any special instructions...",
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

  if (normalizedBuilding.includes("tower")) {
    return ["Outside tower entrance", "Front of quad", "Back staircase of quad"];
  }

  return ["Front entrance", "Back entrance", "Front of quad", "Back staircase of quad"];
}
