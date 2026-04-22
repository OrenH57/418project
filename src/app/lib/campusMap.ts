import type { RequestRecord } from "./api";

// File purpose:
// Central campus map data and helper functions used by the courier feed and map page.
// Keeps location labels, zone matching, and request-to-campus lookup logic in one place.

export type CampusMapNode = {
  id: string;
  name: string;
  shortLabel: string;
  description: string;
  top: string;
  left: string;
  kind: "pickup" | "housing" | "academic";
};

export const campusMapNodes: CampusMapNode[] = [
  {
    id: "campus-center",
    name: "Campus Center",
    shortLabel: "CC",
    description: "Main pickup hub for GET orders and most campus food runs.",
    top: "47%",
    left: "50%",
    kind: "pickup",
  },
  {
    id: "state-quad",
    name: "State Quad",
    shortLabel: "SQ",
    description: "Eastman Tower plus eight residence halls.",
    top: "17%",
    left: "58%",
    kind: "housing",
  },
  {
    id: "indigenous-quad",
    name: "Indigenous Quad",
    shortLabel: "IQ",
    description: "Mohawk Tower and first-year residence halls.",
    top: "17%",
    left: "29%",
    kind: "housing",
  },
  {
    id: "dutch-quad",
    name: "Dutch Quad",
    shortLabel: "DQ",
    description: "Residence area near athletics and western campus paths.",
    top: "56%",
    left: "20%",
    kind: "housing",
  },
  {
    id: "colonial-quad",
    name: "Colonial Quad",
    shortLabel: "CQ",
    description: "Livingston Tower and Collins Circle residence area.",
    top: "63%",
    left: "57%",
    kind: "housing",
  },
  {
    id: "empire-commons",
    name: "Empire Commons",
    shortLabel: "EC",
    description: "Apartment community with A through G building groups.",
    top: "15%",
    left: "82%",
    kind: "housing",
  },
  {
    id: "freedom-apartments",
    name: "Freedom Apartments",
    shortLabel: "FA",
    description: "Apartment clusters along Jose Marti Drive.",
    top: "81%",
    left: "34%",
    kind: "housing",
  },
  {
    id: "liberty-terrace",
    name: "Liberty Terrace",
    shortLabel: "LT",
    description: "Apartment complex near Parker Pond.",
    top: "81%",
    left: "77%",
    kind: "housing",
  },
  {
    id: "main-library",
    name: "Main Library",
    shortLabel: "ML",
    description: "Main Library with basement and three floors.",
    top: "38%",
    left: "42%",
    kind: "academic",
  },
  {
    id: "science-library",
    name: "Science Library",
    shortLabel: "SL",
    description: "Science Library with three floors.",
    top: "38%",
    left: "60%",
    kind: "academic",
  },
  {
    id: "massry-center",
    name: "Massry Center",
    shortLabel: "MC",
    description: "Massry Center academic building.",
    top: "54%",
    left: "69%",
    kind: "academic",
  },
];

export const campusZones = campusMapNodes.filter((node) => node.kind !== "pickup");

export function buildDestinationLabel(request: RequestRecord) {
  return request.destination || "Campus drop-off";
}

export function getRequestZoneLabel(request: RequestRecord) {
  const destination = buildDestinationLabel(request).toLowerCase();

  if (destination.includes("state quad") || destination.includes("eastman") || destination.includes("tappan")) {
    return "State Quad";
  }
  if (
    destination.includes("indigenous") ||
    destination.includes("mohawk") ||
    destination.includes("seneca") ||
    destination.includes("tuscarora")
  ) {
    return "Indigenous Quad";
  }
  if (destination.includes("dutch") || destination.includes("stuyvesant") || destination.includes("ten eyck")) {
    return "Dutch Quad";
  }
  if (
    destination.includes("colonial") ||
    destination.includes("livingston") ||
    destination.includes("herkimer") ||
    destination.includes("zenger")
  ) {
    return "Colonial Quad";
  }
  if (destination.includes("empire")) {
    return "Empire Commons";
  }
  if (destination.includes("freedom") || destination.includes("truth cluster") || destination.includes("lazarus")) {
    return "Freedom Apartments";
  }
  if (destination.includes("liberty")) {
    return "Liberty Terrace";
  }
  if (destination.includes("science library")) {
    return "Science Library";
  }
  if (destination.includes("main library") || destination.includes("library")) {
    return "Main Library";
  }
  if (destination.includes("massry")) {
    return "Massry Center";
  }

  return "Campus Center";
}

export function findCampusNodeByName(name: string) {
  const normalizedName = name.trim().toLowerCase();
  return campusMapNodes.find((node) => node.name.toLowerCase() === normalizedName) ?? null;
}

export function findCampusNodeForRequest(request: RequestRecord | null) {
  if (!request) return null;
  const zoneLabel = getRequestZoneLabel(request);
  return findCampusNodeByName(zoneLabel);
}
