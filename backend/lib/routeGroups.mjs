// File purpose:
// Grouped backend route handlers to keep the server entrypoint focused on routing flow.

import crypto from "node:crypto";
import { buildPaymentTotal, formatPaymentAmount, getStoredPaymentBase, parseOptionalTip } from "./paymentPolicy.mjs";
import { truncateText, validateDataImage } from "./security.mjs";

export async function handleMessagingRoute(context) {
  const {
    request,
    response,
    url,
    requireUser,
    sendJson,
    readBody,
    canAccessRequest,
    decorateRequest,
    writeData,
  } = context;

  if (request.method === "GET" && url.pathname.startsWith("/api/messages/")) {
    const auth = await requireUser(request, response);
    if (!auth) return true;

    const requestId = url.pathname.split("/")[3];
    const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);

    if (!requestRecord) {
      sendJson(response, 404, { error: "Conversation not found." });
      return true;
    }

    if (requestRecord.moderationStatus === "removed") {
      sendJson(response, 410, { error: "This request was removed by an admin." });
      return true;
    }

    if (!canAccessRequest(auth.user.id, requestRecord)) {
      sendJson(response, 403, { error: "You do not have access to this conversation." });
      return true;
    }

    sendJson(response, 200, {
      request: decorateRequest(requestRecord, auth.data),
      messages: (auth.data.messages[requestId] || []).map((message) => ({
        ...message,
        mine: message.senderId === auth.user.id,
        time: new Date(message.createdAt).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
      })),
    });
    return true;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/messages/")) {
    const auth = await requireUser(request, response);
    if (!auth) return true;

    const requestId = url.pathname.split("/")[3];
    const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);
    const body = await readBody(request);
    const text = truncateText(body.text, 1000);

    if (!requestRecord) {
      sendJson(response, 404, { error: "Conversation not found." });
      return true;
    }

    if (requestRecord.moderationStatus === "removed") {
      sendJson(response, 410, { error: "This request was removed by an admin." });
      return true;
    }

    if (!canAccessRequest(auth.user.id, requestRecord)) {
      sendJson(response, 403, { error: "You do not have access to this conversation." });
      return true;
    }

    if (!text) {
      sendJson(response, 400, { error: "Message text is required." });
      return true;
    }

    auth.data.messages[requestId] = auth.data.messages[requestId] || [];
    auth.data.messages[requestId].push({
      id: `message-${crypto.randomUUID()}`,
      senderId: auth.user.id,
      senderName: auth.user.name,
      text,
      createdAt: new Date().toISOString(),
    });
    await writeData(auth.data);
    sendJson(response, 201, { ok: true });
    return true;
  }

  return false;
}

export async function handleRatingsRoute(context) {
  const {
    request,
    response,
    url,
    requireUser,
    sendJson,
    readBody,
    canAccessRequest,
    writeData,
  } = context;

  if (request.method === "GET" && url.pathname.startsWith("/api/ratings/")) {
    const auth = await requireUser(request, response);
    if (!auth) return true;

    const requestId = url.pathname.split("/")[3];
    const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);

    if (!requestRecord) {
      sendJson(response, 404, { error: "Request not found." });
      return true;
    }

    if (!canAccessRequest(auth.user.id, requestRecord)) {
      sendJson(response, 403, { error: "You do not have access to this rating flow." });
      return true;
    }

    if (requestRecord.status !== "completed") {
      sendJson(response, 200, {
        canRate: false,
        requestId,
        targetUser: null,
        existingRating: null,
      });
      return true;
    }

    const isRequester = requestRecord.userId === auth.user.id;
    const targetUserId = isRequester ? requestRecord.acceptedBy : requestRecord.userId;
    const targetUser = targetUserId ? auth.data.users.find((entry) => entry.id === targetUserId) ?? null : null;
    const existingRating =
      auth.data.ratings.find((entry) => entry.requestId === requestId && entry.authorUserId === auth.user.id) ?? null;

    sendJson(response, 200, {
      canRate: Boolean(targetUser),
      requestId,
      targetUser: targetUser ? { id: targetUser.id, name: targetUser.name } : null,
      existingRating,
    });
    return true;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/ratings/")) {
    const auth = await requireUser(request, response);
    if (!auth) return true;

    const requestId = url.pathname.split("/")[3];
    const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);

    if (!requestRecord) {
      sendJson(response, 404, { error: "Request not found." });
      return true;
    }

    if (!canAccessRequest(auth.user.id, requestRecord)) {
      sendJson(response, 403, { error: "You do not have access to this rating flow." });
      return true;
    }

    if (requestRecord.status !== "completed") {
      sendJson(response, 400, { error: "You can rate this request after it is marked complete." });
      return true;
    }

    const body = await readBody(request);
    const ratingValue = Number(body.rating);
    const comment = truncateText(body.comment, 500);
    const isRequester = requestRecord.userId === auth.user.id;
    const targetUserId = isRequester ? requestRecord.acceptedBy : requestRecord.userId;

    if (!targetUserId) {
      sendJson(response, 400, { error: "A courier must accept the request before you can leave a rating." });
      return true;
    }

    if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      sendJson(response, 400, { error: "Ratings must be a whole number between 1 and 5." });
      return true;
    }

    const targetUser = auth.data.users.find((entry) => entry.id === targetUserId);

    if (!targetUser) {
      sendJson(response, 404, { error: "The person you are trying to rate was not found." });
      return true;
    }

    const ratingRecord = {
      requestId,
      authorUserId: auth.user.id,
      targetUserId,
      rating: ratingValue,
      comment,
      createdAt: new Date().toISOString(),
    };
    const existingIndex = auth.data.ratings.findIndex(
      (entry) => entry.requestId === requestId && entry.authorUserId === auth.user.id,
    );

    if (existingIndex >= 0) {
      auth.data.ratings[existingIndex] = ratingRecord;
    } else {
      auth.data.ratings.push(ratingRecord);
    }

    const userRatings = auth.data.ratings.filter((entry) => entry.targetUserId === targetUserId);
    const averageRating = userRatings.reduce((total, entry) => total + entry.rating, 0) / userRatings.length;
    targetUser.rating = Number(averageRating.toFixed(1));

    await writeData(auth.data);
    sendJson(response, 201, {
      ok: true,
      rating: ratingRecord,
      targetUser: { id: targetUser.id, name: targetUser.name, rating: targetUser.rating },
    });
    return true;
  }

  return false;
}

export async function handleProfileRoute(context) {
  const {
    request,
    response,
    url,
    requireUser,
    sendJson,
    readBody,
    writeData,
    sanitizeUser,
  } = context;

  if (request.method === "GET" && url.pathname === "/api/profile") {
    const auth = await requireUser(request, response);
    if (!auth) return true;

    sendJson(response, 200, {
      profile: {
        ...sanitizeUser(auth.user),
        postedRequests: auth.data.requests.filter((entry) => entry.userId === auth.user.id).length,
        acceptedRequests: auth.data.requests.filter((entry) => entry.acceptedBy === auth.user.id).length,
      },
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/profile/request-verification-code") {
    const auth = await requireUser(request, response);
    if (!auth) return true;

    const code = String(Math.floor(100000 + Math.random() * 900000));
    auth.user.pendingVerificationCode = code;
    auth.user.pendingVerificationIssuedAt = new Date().toISOString();
    await writeData(auth.data);
    sendJson(response, 200, { ok: true, previewCode: code });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/profile/verify-code") {
    const auth = await requireUser(request, response);
    if (!auth) return true;

    const body = await readBody(request);
    const code = String(body.code || "").trim();

    if (!code || auth.user.pendingVerificationCode !== code) {
      sendJson(response, 400, { error: "That verification code is not correct." });
      return true;
    }

    auth.user.foodSafetyVerified = true;
    delete auth.user.pendingVerificationCode;
    delete auth.user.pendingVerificationIssuedAt;
    await writeData(auth.data);
    sendJson(response, 200, { user: sanitizeUser(auth.user) });
    return true;
  }

  if (request.method === "PATCH" && url.pathname === "/api/profile") {
    const auth = await requireUser(request, response);
    if (!auth) return true;

    const body = await readBody(request);
    auth.user.courierMode = Boolean(body.courierMode);
    auth.user.bio = typeof body.bio === "string" ? truncateText(body.bio, 500) : auth.user.bio;
    if (typeof body.notificationsEnabled === "boolean") {
      auth.user.notificationsEnabled = body.notificationsEnabled;
    }
    if (typeof body.courierOnline === "boolean") {
      auth.user.courierOnline = body.courierOnline;
    }
    if (typeof body.ualbanyIdImage === "string") {
      const imageResult = validateDataImage(body.ualbanyIdImage, {
        required: false,
        maxBytes: 3 * 1024 * 1024,
      });
      if (!imageResult.ok) {
        sendJson(response, 400, { error: imageResult.error });
        return true;
      }
      auth.user.ualbanyIdImage = imageResult.value;
      auth.user.ualbanyIdUploaded = Boolean(imageResult.value);
    }
    await writeData(auth.data);
    sendJson(response, 200, { user: sanitizeUser(auth.user) });
    return true;
  }

  return false;
}

export async function handleAdminRoute(context) {
  const {
    request,
    response,
    url,
    requireUser,
    sendJson,
    readBody,
    writeData,
    sanitizeUser,
    requireAdmin,
    buildAdminOverview,
    decorateRequest,
  } = context;

  if (request.method === "GET" && url.pathname === "/api/admin/overview") {
    const auth = await requireUser(request, response);
    if (!auth) return true;
    if (!requireAdmin(auth.user, response, sendJson)) return true;

    sendJson(response, 200, buildAdminOverview(auth.data, sanitizeUser));
    return true;
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/admin/requests/")) {
    const auth = await requireUser(request, response);
    if (!auth) return true;
    if (!requireAdmin(auth.user, response, sendJson)) return true;

    const requestId = url.pathname.split("/")[4];
    const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);
    const body = await readBody(request);
    const action = String(body.action || "");
    const reason = truncateText(body.reason, 500);

    if (!requestRecord) {
      sendJson(response, 404, { error: "Request not found." });
      return true;
    }

    if (action === "flag") {
      requestRecord.flagged = true;
      requestRecord.flaggedReason = reason || requestRecord.flaggedReason || "Flagged by admin review.";
      requestRecord.moderationStatus = "flagged";
    } else if (action === "remove") {
      requestRecord.flagged = true;
      requestRecord.flaggedReason = reason || requestRecord.flaggedReason || "Removed by admin.";
      requestRecord.moderationStatus = "removed";
      requestRecord.removedAt = new Date().toISOString();
      requestRecord.removedBy = auth.user.id;
    } else if (action === "clear") {
      requestRecord.flagged = false;
      requestRecord.flaggedReason = "";
      requestRecord.moderationStatus = "clear";
      requestRecord.removedAt = "";
      requestRecord.removedBy = "";
    } else {
      sendJson(response, 400, { error: "Unsupported moderation action." });
      return true;
    }

    await writeData(auth.data);
    sendJson(response, 200, { request: decorateRequest(requestRecord, auth.data) });
    return true;
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/admin/users/") && url.pathname.endsWith("/suspension")) {
    const auth = await requireUser(request, response);
    if (!auth) return true;
    if (!requireAdmin(auth.user, response, sendJson)) return true;

    const userId = url.pathname.split("/")[4];
    const targetUser = auth.data.users.find((entry) => entry.id === userId);
    const body = await readBody(request);
    const suspended = body.suspended === true;
    const reason = truncateText(body.reason, 500);

    if (!targetUser) {
      sendJson(response, 404, { error: "User not found." });
      return true;
    }

    if (targetUser.role === "admin" && targetUser.id === auth.user.id) {
      sendJson(response, 400, { error: "Admins cannot suspend their own account." });
      return true;
    }

    targetUser.suspended = suspended;
    targetUser.suspendedReason = suspended ? reason || "Suspended by admin review." : "";

    if (suspended) {
      for (const requestRecord of auth.data.requests) {
        if (requestRecord.userId === targetUser.id || requestRecord.acceptedBy === targetUser.id) {
          requestRecord.flagged = true;
          requestRecord.flaggedReason = `Connected to suspended account: ${targetUser.name}`;
          if (requestRecord.moderationStatus === "clear") {
            requestRecord.moderationStatus = "flagged";
          }
        }
      }
    }

    await writeData(auth.data);
    sendJson(response, 200, { user: sanitizeUser(targetUser) });
    return true;
  }

  return false;
}

export async function handlePaymentsRoute(context) {
  const {
    request,
    response,
    url,
    requireUser,
    sendJson,
    readBody,
    writeData,
    decorateRequest,
    createStripeCheckoutSession,
    getStripeCheckoutSession,
  } = context;

  if (request.method === "POST" && url.pathname === "/api/payments/create-checkout-session") {
    const auth = await requireUser(request, response);
    if (!auth) return true;

    const body = await readBody(request);
    const requestId = String(body.requestId || "");
    const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);

    if (!requestRecord) {
      sendJson(response, 404, { error: "Request not found." });
      return true;
    }

    if (requestRecord.userId !== auth.user.id) {
      sendJson(response, 403, { error: "Only the requester can pay the delivery fee for this request." });
      return true;
    }

    if (requestRecord.status !== "open" && requestRecord.status !== "accepted") {
      sendJson(response, 400, { error: "Closed orders cannot be paid." });
      return true;
    }

    if (requestRecord.paymentStatus !== "paid" && requestRecord.paymentStatus !== "pending" && "tipAmount" in body) {
      const tipResult = parseOptionalTip(body.tipAmount);
      if (!tipResult.ok) {
        sendJson(response, 400, { error: tipResult.error });
        return true;
      }

      const basePayment = getStoredPaymentBase(requestRecord);
      if (!Number.isFinite(basePayment) || basePayment <= 0) {
        sendJson(response, 400, { error: "Request payment amount is invalid." });
        return true;
      }

      requestRecord.basePayment = basePayment;
      requestRecord.tipAmount = tipResult.amount;
      requestRecord.payment = formatPaymentAmount(buildPaymentTotal(basePayment, tipResult.amount));
    }

    const amountNumber = Math.round(Number.parseFloat(requestRecord.payment) * 100);

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      sendJson(response, 400, { error: "Request payment amount is invalid." });
      return true;
    }

    if (requestRecord.paymentStatus === "paid") {
      sendJson(response, 409, { error: "This request has already been paid." });
      return true;
    }

    const session = await createStripeCheckoutSession({
      amount: amountNumber,
      requestId,
      requesterEmail: auth.user.email,
      description: `${requestRecord.pickup} to ${requestRecord.destination || "campus drop-off"}`,
      request,
    });

    requestRecord.paymentStatus = "pending";
    requestRecord.stripeCheckoutSessionId = String(session.id || "");
    await writeData(auth.data);
    sendJson(response, 200, { url: session.url });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/payments/confirm") {
    const auth = await requireUser(request, response);
    if (!auth) return true;

    const body = await readBody(request);
    const requestId = String(body.requestId || "");
    const paymentState = String(body.paymentState || "");
    const checkoutSessionId = String(body.checkoutSessionId || "").trim();
    const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);

    if (!requestRecord) {
      sendJson(response, 404, { error: "Request not found." });
      return true;
    }

    if (requestRecord.userId !== auth.user.id) {
      sendJson(response, 403, { error: "Only the requester can update payment status for this request." });
      return true;
    }

    if (paymentState === "success") {
      const sessionIdToVerify = checkoutSessionId || requestRecord.stripeCheckoutSessionId;

      if (requestRecord.paymentStatus === "paid") {
        sendJson(response, 200, { request: decorateRequest(requestRecord, auth.data) });
        return true;
      }

      if (!sessionIdToVerify) {
        sendJson(response, 400, { error: "Missing Stripe checkout session." });
        return true;
      }

      if (!requestRecord.stripeCheckoutSessionId || requestRecord.stripeCheckoutSessionId !== sessionIdToVerify) {
        sendJson(response, 409, { error: "Stripe checkout session did not match this request." });
        return true;
      }

      const checkoutSession = await getStripeCheckoutSession(sessionIdToVerify);

      if (checkoutSession.payment_status !== "paid") {
        sendJson(response, 409, { error: "Stripe has not marked this checkout session as paid yet." });
        return true;
      }

      requestRecord.paymentStatus = "paid";
      requestRecord.paidAt = new Date().toISOString();
    } else if (paymentState === "cancelled") {
      requestRecord.paymentStatus = "unpaid";
    } else {
      sendJson(response, 400, { error: "Unsupported payment state." });
      return true;
    }

    auth.data.messages[requestId] = auth.data.messages[requestId] || [];
    auth.data.messages[requestId].push({
      id: `message-${crypto.randomUUID()}`,
      senderId: auth.user.id,
      senderName: auth.user.name,
      text:
        paymentState === "success"
          ? "Payment was completed in Stripe Checkout."
          : "Stripe Checkout was cancelled before payment was completed.",
      createdAt: new Date().toISOString(),
    });
    await writeData(auth.data);
    sendJson(response, 200, { request: decorateRequest(requestRecord, auth.data) });
    return true;
  }

  return false;
}
