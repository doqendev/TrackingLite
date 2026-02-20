import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeDashboardAnalytics } from "@/lib/analytics";
import { getCachedAnalytics } from "@/lib/analytics-cache";
import { convertCurrency } from "@/lib/currency";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const workspace = await db.workspace.findFirst({
    where: { id, userId: session.user.id, isActive: true },
    select: { id: true, userId: true },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get user's display currency preference
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { displayCurrency: true },
  });
  const displayCurrency = user?.displayCurrency ?? "USD";

  const analytics = await getCachedAnalytics(
    workspace.id,
    async () => {
      const data = await computeDashboardAnalytics(
        workspace.id,
        session.user!.id!,
        displayCurrency
      );

      // Convert revenue values if display currency differs from event currency
      const eventCurrency = data.revenue.purchaseValue.currency;
      if (displayCurrency && displayCurrency !== eventCurrency) {
        const rate = await convertCurrency(1, eventCurrency, displayCurrency);
        data.revenue.addToCartValue = {
          today: data.revenue.addToCartValue.today * rate,
          yesterday: data.revenue.addToCartValue.yesterday * rate,
          currency: displayCurrency,
        };
        data.revenue.checkoutValue = {
          today: data.revenue.checkoutValue.today * rate,
          yesterday: data.revenue.checkoutValue.yesterday * rate,
          currency: displayCurrency,
        };
        data.revenue.purchaseValue = {
          today: data.revenue.purchaseValue.today * rate,
          yesterday: data.revenue.purchaseValue.yesterday * rate,
          currency: displayCurrency,
        };
        // Convert campaign revenue
        data.campaigns = data.campaigns.map((c) => ({
          ...c,
          revenue: c.revenue * rate,
        }));
        data.currency = displayCurrency;
      }

      return data;
    },
    displayCurrency
  );

  return NextResponse.json(analytics);
}
