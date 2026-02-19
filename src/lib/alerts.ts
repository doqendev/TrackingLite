import { db } from "@/lib/db";
import { EventStatus } from "@prisma/client";
import { getOrderCount } from "@/lib/billing";
import { BILLING_PLANS } from "@/lib/constants";
import { sendAlertEmail } from "@/lib/email";
import type { AlertType, AlertDetails } from "@/lib/email";

export type { AlertType };

export interface Alert {
  userId: string;
  workspaceId: string;
  workspaceName: string;
  alertType: AlertType;
  details: AlertDetails;
  message: string;
}

// ---------------------------------------------------------------------------
// Per-workspace checks
// ---------------------------------------------------------------------------

async function checkTrackingDown(
  workspaceId: string,
  workspaceName: string,
  userId: string
): Promise<Alert | null> {
  const since1h = new Date(Date.now() - 60 * 60 * 1000);

  const [total, sent] = await Promise.all([
    db.eventLog.count({
      where: { workspaceId, createdAt: { gte: since1h } },
    }),
    db.eventLog.count({
      where: {
        workspaceId,
        createdAt: { gte: since1h },
        status: EventStatus.SENT,
      },
    }),
  ]);

  if (total === 0) return null;

  const successRate = Math.round((sent / total) * 1000) / 10;
  if (successRate >= 80) return null;

  return {
    userId,
    workspaceId,
    workspaceName,
    alertType: "tracking_down",
    details: { workspaceName, successRate },
    message: `Tracking health degraded: ${successRate}% success rate over the last hour (workspace: ${workspaceName})`,
  };
}

async function checkHighErrorRate(
  workspaceId: string,
  workspaceName: string,
  userId: string
): Promise<Alert | null> {
  const since1h = new Date(Date.now() - 60 * 60 * 1000);

  const [total, failed] = await Promise.all([
    db.eventLog.count({
      where: { workspaceId, createdAt: { gte: since1h } },
    }),
    db.eventLog.count({
      where: {
        workspaceId,
        createdAt: { gte: since1h },
        status: EventStatus.FAILED,
      },
    }),
  ]);

  if (total === 0) return null;

  const errorRate = Math.round((failed / total) * 1000) / 10;
  if (errorRate <= 10) return null;

  return {
    userId,
    workspaceId,
    workspaceName,
    alertType: "high_error_rate",
    details: { workspaceName, errorRate },
    message: `High error rate: ${errorRate}% of events failed in the last hour (workspace: ${workspaceName})`,
  };
}

async function checkEmqDrop(
  workspaceId: string,
  workspaceName: string,
  userId: string
): Promise<Alert | null> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const events = await db.eventLog.findMany({
    where: {
      workspaceId,
      status: EventStatus.SENT,
      createdAt: { gte: since24h },
    },
    select: {
      fbp: true,
      fbc: true,
      customerIp: true,
      userAgent: true,
      pageUrl: true,
      payload: true,
    },
    take: 200,
  });

  if (events.length === 0) return null;

  let totalScore = 0;
  for (const event of events) {
    let eventScore = 0;
    const payload =
      event.payload !== null && typeof event.payload === "object"
        ? (event.payload as Record<string, unknown>)
        : null;

    const hasEmail =
      payload !== null &&
      (payload.hasEmail === true ||
        (typeof payload.userData === "object" &&
          payload.userData !== null &&
          "email" in (payload.userData as Record<string, unknown>)));

    const hasPhone =
      payload !== null &&
      (payload.hasPhone === true ||
        (typeof payload.userData === "object" &&
          payload.userData !== null &&
          "phone" in (payload.userData as Record<string, unknown>)));

    if (hasEmail) eventScore += 2;
    if (hasPhone) eventScore += 1.5;
    if (event.fbp) eventScore += 1.5;
    if (event.fbc) eventScore += 1;
    if (event.customerIp) eventScore += 1;
    if (event.userAgent) eventScore += 1;
    if (event.pageUrl) eventScore += 0.5;

    totalScore += Math.min(10, eventScore);
  }

  const emqScore = Math.round((totalScore / events.length) * 10) / 10;
  if (emqScore >= 6) return null;

  return {
    userId,
    workspaceId,
    workspaceName,
    alertType: "emq_drop",
    details: { workspaceName, emqScore },
    message: `EMQ score dropped to ${emqScore} (below 6.0 threshold) for workspace: ${workspaceName}`,
  };
}

// ---------------------------------------------------------------------------
// Per-user checks (billing)
// ---------------------------------------------------------------------------

async function checkOrderLimitAlerts(
  userId: string,
  workspaceName: string
): Promise<Alert[]> {
  const alerts: Alert[] = [];

  const subscription = await db.subscription.findUnique({
    where: { userId },
    select: { plan: true },
  });

  const plan = subscription?.plan ?? "FREE";
  const planConfig = BILLING_PLANS[plan as keyof typeof BILLING_PLANS];
  if (!planConfig) return alerts;

  const ordersLimit = planConfig.ordersPerMonth;
  let ordersUsed: number;
  try {
    ordersUsed = await getOrderCount(userId);
  } catch {
    return alerts;
  }

  const usagePercent = Math.min(100, Math.round((ordersUsed / ordersLimit) * 100));

  if (usagePercent >= 100) {
    alerts.push({
      userId,
      workspaceId: "",
      workspaceName,
      alertType: "order_limit_reached",
      details: { workspaceName, ordersUsed, ordersLimit, usagePercent },
      message: `Order limit reached: ${ordersUsed}/${ordersLimit} orders used this month`,
    });
  } else if (usagePercent >= 95) {
    alerts.push({
      userId,
      workspaceId: "",
      workspaceName,
      alertType: "order_limit_warning",
      details: { workspaceName, ordersUsed, ordersLimit, usagePercent },
      message: `Order limit warning: ${ordersUsed}/${ordersLimit} orders used this month (${usagePercent}%)`,
    });
  } else if (usagePercent >= 80) {
    alerts.push({
      userId,
      workspaceId: "",
      workspaceName,
      alertType: "order_limit_warning",
      details: { workspaceName, ordersUsed, ordersLimit, usagePercent },
      message: `Order limit warning: ${ordersUsed}/${ordersLimit} orders used this month (${usagePercent}%)`,
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Cooldown check — same alert type for same user, no repeat within 24 hours
// ---------------------------------------------------------------------------

export async function shouldSendAlert(
  userId: string,
  alertType: AlertType
): Promise<boolean> {
  // Check preferences
  const pref = await db.alertPreference.findUnique({ where: { userId } });
  if (pref) {
    const enabledMap: Record<AlertType, boolean> = {
      tracking_down: pref.trackingDown,
      high_error_rate: pref.highErrorRate,
      order_limit_warning: pref.orderLimitWarning,
      order_limit_reached: pref.orderLimitReached,
      emq_drop: pref.emqDrop,
    };
    if (!enabledMap[alertType]) return false;
  }

  // Check 24-hour cooldown
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await db.alertLog.findFirst({
    where: {
      userId,
      alertType,
      sentAt: { gte: since24h },
    },
  });

  return recent === null;
}

// ---------------------------------------------------------------------------
// Main evaluation entry point
// ---------------------------------------------------------------------------

export async function evaluateAlerts(userId: string): Promise<Alert[]> {
  const workspaces = await db.workspace.findMany({
    where: { userId, isActive: true },
    select: { id: true, name: true },
  });

  if (workspaces.length === 0) return [];

  const allAlerts: Alert[] = [];

  // Per-workspace checks (run all workspaces in parallel)
  const workspaceAlertArrays = await Promise.all(
    workspaces.map(async (ws) => {
      const [trackingDown, highErrorRate, emqDrop] = await Promise.all([
        checkTrackingDown(ws.id, ws.name, userId),
        checkHighErrorRate(ws.id, ws.name, userId),
        checkEmqDrop(ws.id, ws.name, userId),
      ]);
      return [trackingDown, highErrorRate, emqDrop].filter(
        (a): a is Alert => a !== null
      );
    })
  );

  for (const arr of workspaceAlertArrays) {
    allAlerts.push(...arr);
  }

  // Per-user billing check — use first workspace name as context label
  const primaryWorkspaceName = workspaces[0].name;
  const billingAlerts = await checkOrderLimitAlerts(userId, primaryWorkspaceName);
  allAlerts.push(...billingAlerts);

  return allAlerts;
}

// ---------------------------------------------------------------------------
// Send and log an alert
// ---------------------------------------------------------------------------

export async function sendAndLogAlert(
  userEmail: string,
  alert: Alert
): Promise<void> {
  await sendAlertEmail(userEmail, alert.alertType, alert.details);

  await db.alertLog.create({
    data: {
      userId: alert.userId,
      alertType: alert.alertType,
      message: alert.message,
    },
  });
}
