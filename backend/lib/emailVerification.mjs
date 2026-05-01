// File purpose:
// Email verification code helpers with demo-friendly delivery.

const EMAIL_VERIFICATION_TTL_MS = 15 * 60 * 1000;

export function createEmailVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function isEmailVerificationExpired(user) {
  const issuedAt = new Date(user?.pendingEmailVerificationIssuedAt || "").getTime();
  return !Number.isFinite(issuedAt) || issuedAt + EMAIL_VERIFICATION_TTL_MS < Date.now();
}

export async function deliverEmailVerificationCode({ email, code, log = () => {} }) {
  const resendApiKey = process.env.RESEND_API_KEY || "";
  const fromEmail = process.env.VERIFICATION_FROM_EMAIL || "";

  if (resendApiKey && fromEmail) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: email,
        subject: "Your CampusConnect verification code",
        text: `Your CampusConnect verification code is ${code}. It expires in 15 minutes.`,
      }),
    });

    if (!response.ok) {
      throw new Error("Could not send verification email.");
    }

    return { delivered: true, previewCode: "" };
  }

  log("email_verification.demo_code", { email, code });
  return { delivered: false, previewCode: code };
}
