import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY environment variable is required");
    _resend = new Resend(apiKey);
  }
  return _resend;
}

const FROM_EMAIL = process.env.EMAIL_FROM || "Track Clear <noreply@trackclear.io>";

export type AlertType =
  | "tracking_down"
  | "high_error_rate"
  | "order_limit_warning"
  | "order_limit_reached";

export interface AlertDetails {
  workspaceName: string;
  successRate?: number;
  errorRate?: number;
  ordersUsed?: number;
  ordersLimit?: number;
  usagePercent?: number;
}

const ALERT_SUBJECT: Record<AlertType, (details: AlertDetails) => string> = {
  tracking_down: (d) =>
    `Track Clear: Tracking health degraded for ${d.workspaceName}`,
  high_error_rate: (d) =>
    `Track Clear: High error rate detected for ${d.workspaceName}`,
  order_limit_warning: (d) =>
    `Track Clear: Order limit at ${d.usagePercent ?? 0}% for ${d.workspaceName}`,
  order_limit_reached: (d) =>
    `Track Clear: Order limit reached for ${d.workspaceName}`,
};

function buildAlertBody(alertType: AlertType, details: AlertDetails): string {
  const header = `
    <h1 style="font-size: 24px; font-weight: 700; color: #111; margin-bottom: 8px;">
      <span style="color: #14b8a6;">Track</span>&thinsp;Clear
    </h1>
    <p style="font-size: 14px; color: #666; margin-bottom: 32px;">Alert Notification</p>
  `;

  const footer = `
    <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
    <p style="font-size: 12px; color: #bbb;">
      Track Clear - Server-side conversion tracking for Shopify.<br/>
      You are receiving this because email alerts are enabled in your account settings.
    </p>
  `;

  let body = "";

  switch (alertType) {
    case "tracking_down":
      body = `
        <h2 style="font-size: 18px; font-weight: 600; color: #dc2626; margin-bottom: 16px;">
          Tracking health degraded
        </h2>
        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          The workspace <strong>${details.workspaceName}</strong> has a success rate of
          <strong>${details.successRate ?? 0}%</strong> over the last hour, which is below the
          80% threshold.
        </p>
        <p style="font-size: 15px; color: #333; line-height: 1.6; margin-top: 12px;">
          Events may not be reaching Meta CAPI. Check your Meta access token and Pixel ID in
          your workspace settings.
        </p>
      `;
      break;

    case "high_error_rate":
      body = `
        <h2 style="font-size: 18px; font-weight: 600; color: #dc2626; margin-bottom: 16px;">
          High error rate detected
        </h2>
        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          The workspace <strong>${details.workspaceName}</strong> has an error rate of
          <strong>${details.errorRate ?? 0}%</strong> over the last hour, exceeding the 10%
          threshold.
        </p>
        <p style="font-size: 15px; color: #333; line-height: 1.6; margin-top: 12px;">
          Review your event logs for error details and verify your integration settings.
        </p>
      `;
      break;

    case "order_limit_warning":
      body = `
        <h2 style="font-size: 18px; font-weight: 600; color: #d97706; margin-bottom: 16px;">
          Approaching order limit
        </h2>
        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          The workspace <strong>${details.workspaceName}</strong> has used
          <strong>${details.ordersUsed ?? 0}</strong> of
          <strong>${details.ordersLimit ?? 0}</strong> orders this month
          (<strong>${details.usagePercent ?? 0}%</strong>).
        </p>
        <p style="font-size: 15px; color: #333; line-height: 1.6; margin-top: 12px;">
          Consider upgrading your plan to avoid Purchase events being blocked when the limit
          is reached.
        </p>
      `;
      break;

    case "order_limit_reached":
      body = `
        <h2 style="font-size: 18px; font-weight: 600; color: #dc2626; margin-bottom: 16px;">
          Order limit reached
        </h2>
        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          The workspace <strong>${details.workspaceName}</strong> has reached its monthly order
          limit of <strong>${details.ordersLimit ?? 0}</strong> orders.
        </p>
        <p style="font-size: 15px; color: #333; line-height: 1.6; margin-top: 12px;">
          Purchase events are now being blocked. Upgrade your plan to continue tracking
          conversions.
        </p>
      `;
      break;

  }

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
      ${header}
      ${body}
      ${footer}
    </div>
  `;
}

export async function sendAlertEmail(
  email: string,
  alertType: AlertType,
  details: AlertDetails
): Promise<void> {
  const resend = getResend();
  const subject = ALERT_SUBJECT[alertType](details);
  const html = buildAlertBody(alertType, details);

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject,
    html,
  });
}

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const resend = getResend();

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "Reset your Track Clear password",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 700; color: #111; margin-bottom: 8px;">
          <span style="color: #14b8a6;">Track</span>&thinsp;Clear
        </h1>
        <p style="font-size: 14px; color: #666; margin-bottom: 32px;">Password Reset Request</p>

        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          You requested a password reset. Click the button below to set a new password.
          This link expires in 1 hour.
        </p>

        <div style="margin: 32px 0;">
          <a href="${resetUrl}"
             style="display: inline-block; background-color: #14b8a6; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Reset Password
          </a>
        </div>

        <p style="font-size: 13px; color: #999; line-height: 1.5;">
          If you didn't request this, you can safely ignore this email.
          Your password will not be changed.
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />

        <p style="font-size: 12px; color: #bbb;">
          Track Clear - Server-side conversion tracking for Shopify
        </p>
      </div>
    `,
  });
}
