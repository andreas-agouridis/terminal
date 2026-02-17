import { SubscriptionSchedule } from "@terminal/core/subscription/subscription.sql";

/**
 * Format currency from cents to dollars
 */
export function formatCurrency(cents: number | string | null | undefined): string {
  const amount = typeof cents === "string" ? parseInt(cents) : cents || 0;
  return `$${(amount / 100).toFixed(2)}`;
}

/**
 * Format total amount including shipping
 */
export function formatTotalAmount(
  subtotalCents: number | string | null | undefined,
  shippingCents: number | null | undefined,
): string {
  const subtotal = typeof subtotalCents === "string" ? parseInt(subtotalCents) : subtotalCents || 0;
  const shipping = shippingCents || 0;
  return `$${((subtotal + shipping) / 100).toFixed(2)}`;
}

/**
 * Format subscription schedule
 */
type ScheduleLike = SubscriptionSchedule | { type: "lifetime" } | null | undefined;

export function formatSchedule(schedule: ScheduleLike): string {
  if (!schedule) return "N/A";
  if (schedule.type === "weekly") {
    return `every ${schedule.interval} weeks`;
  }
  if (schedule.type === "lifetime") {
    return "lifetime";
  }
  return schedule.type;
}

/**
 * Format address as a short string (city, province, country)
 */
export function formatAddressShort(address: any): string {
  if (!address) return "N/A";
  const parts = [
    address.city,
    address.province,
    address.country,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "N/A";
}

/**
 * Format address as a full multi-line string
 */
export function formatAddressFull(address: any): string {
  if (!address) return "N/A";
  const parts = [
    address.name,
    address.street1,
    address.street2,
    `${address.city}, ${address.province} ${address.zip}`,
    address.country,
  ].filter(Boolean);
  return parts.join("\n");
}

/**
 * Format shipping address inline (name, city, province)
 */
export function formatShippingAddressInline(address: any): string {
  if (!address) return "N/A";
  const parts = [
    address.name,
    address.city,
    address.province,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "N/A";
}

/**
 * Format card last4 with masking
 */
export function formatCardLast4(last4: string | null | undefined): string {
  return last4 ? `****${last4}` : "N/A";
}

/**
 * Format card expiration date
 */
export function formatCardExpiration(
  month: number | null | undefined,
  year: number | null | undefined,
): string {
  if (!month || !year) return "N/A";
  return `${month}/${year}`;
}

/**
 * Format boolean or truthy value as Yes/No
 */
export function formatBoolean(value: boolean | null | undefined): string {
  return value ? "Yes" : "No";
}

