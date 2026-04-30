// File purpose:
// Request/order HTTP routes kept thin around orderService workflows.

import {
  acceptOrder,
  buildBootstrapPayload,
  cancelOrder,
  completeOrder,
  createOrder,
  listRequestsForUser,
  markFoodReady,
} from "../services/orderService.mjs";

function sendServiceResult(sendJson, response, result) {
  sendJson(response, result.statusCode, result.payload);
}

export async function handleRequestRoute(context) {
  const {
    request,
    response,
    url,
    requireUser,
    sendJson,
    readBody,
    dataRepository,
    readData,
    sanitizeUser,
    createStripeCheckoutSession,
    logBackendEvent,
  } = context;

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    const auth = await requireUser(request, response);
    if (!auth) return true;

    sendJson(response, 200, {
      user: sanitizeUser(auth.user),
      ...buildBootstrapPayload(auth),
    });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/requests") {
    const auth = await requireUser(request, response);
    if (!auth) return true;

    sendJson(response, 200, {
      requests: listRequestsForUser(auth, url.searchParams.get("mode") || "all"),
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/requests") {
    const auth = await requireUser(request, response);
    if (!auth) return true;

    const body = await readBody(request);
    const result = await createOrder({
      auth,
      body,
      request,
      dataRepository,
      createStripeCheckoutSession,
      log: logBackendEvent,
    });
    sendServiceResult(sendJson, response, result);
    return true;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/requests/") && url.pathname.endsWith("/accept")) {
    const auth = await requireUser(request, response);
    if (!auth) return true;

    const result = await acceptOrder({
      auth,
      requestId: url.pathname.split("/")[3],
      dataRepository,
      readData,
    });
    sendServiceResult(sendJson, response, result);
    return true;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/requests/") && url.pathname.endsWith("/ready")) {
    const auth = await requireUser(request, response);
    if (!auth) return true;

    const result = await markFoodReady({
      auth,
      requestId: url.pathname.split("/")[3],
      dataRepository,
    });
    sendServiceResult(sendJson, response, result);
    return true;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/requests/") && url.pathname.endsWith("/complete")) {
    const auth = await requireUser(request, response);
    if (!auth) return true;

    const result = await completeOrder({
      auth,
      requestId: url.pathname.split("/")[3],
      dataRepository,
      readData,
    });
    sendServiceResult(sendJson, response, result);
    return true;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/requests/") && url.pathname.endsWith("/cancel")) {
    const auth = await requireUser(request, response);
    if (!auth) return true;

    const result = await cancelOrder({
      auth,
      requestId: url.pathname.split("/")[3],
      dataRepository,
      readData,
    });
    sendServiceResult(sendJson, response, result);
    return true;
  }

  return false;
}
