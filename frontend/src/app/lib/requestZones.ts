import type { RequestRecord } from "./api";

// Maps request destinations to broad campus areas shown in the courier feed.

function buildDestinationLabel(request: RequestRecord) {
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
