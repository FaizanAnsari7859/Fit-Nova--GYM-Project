import Subscription from '../models/subscription.model.js';
import Payment from '../models/payment.model.js';

/**
 * Computes membership expiry and status based on a payment record or a dedicated subscription record.
 * Supports backward compatibility for raw payment records while fully utilizing subscription records.
 * Safely handles missing, pending, failed, or refunded payments, invalid dates, and missing plan duration.
 */
export const computeMembershipExpiry = (payment, subscription = null) => {
  // Check if a subscription document was explicitly passed or is populated on the payment
  const sub =
    subscription ||
    (payment?.subscription &&
    typeof payment.subscription === 'object' &&
    payment.subscription.endDate
      ? payment.subscription
      : null);

  if (sub && sub.endDate) {
    const expiryDate = new Date(sub.endDate);
    if (!isNaN(expiryDate.getTime())) {
      const now = new Date();
      const startDate = new Date(sub.startDate || sub.createdAt || now);
      const diffMs = expiryDate.getTime() - now.getTime();
      const daysRemaining = Math.max(0, Math.ceil(diffMs / 86400000));
      const isActive = sub.status === 'active' && expiryDate >= now;
      const status = isActive ? 'active' : sub.status === 'cancelled' ? 'cancelled' : 'expired';

      return {
        paymentDate: startDate,
        startDate,
        expiryDate,
        endDate: expiryDate,
        expiryISO: expiryDate.toISOString(),
        daysRemaining,
        status,
        isActive,
        subscriptionId: sub._id,
      };
    }
  }

  // Fallback to legacy payment-based calculation (backward compatibility)
  if (!payment || payment.paymentStatus !== 'paid') {
    return null;
  }

  const rawDate = payment.paymentDate || payment.createdAt;
  if (!rawDate) {
    return null;
  }

  const paymentDate = new Date(rawDate);
  if (isNaN(paymentDate.getTime())) {
    return null;
  }

  const durationDays = Number(payment.membership?.duration) || 30;
  const expiryDate = new Date(paymentDate.getTime() + durationDays * 86400000);
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / 86400000));
  const status = expiryDate >= now ? 'active' : 'expired';

  return {
    paymentDate,
    startDate: paymentDate,
    expiryDate,
    endDate: expiryDate,
    expiryISO: expiryDate.toISOString(),
    daysRemaining,
    status,
    isActive: expiryDate >= now,
    subscriptionId: null,
  };
};

/**
 * Creates or renews an individual member subscription upon a valid paid payment.
 * If an active subscription already exists for this member, the renewal extends from
 * the existing end date.
 * If creating an expired/historic record, sets status to 'expired' so old payments
 * are never incorrectly treated as active subscriptions.
 */
export const createOrRenewSubscription = async ({
  memberId,
  planId,
  paymentId = null,
  paymentDate = null,
  durationDays = 30,
}) => {
  const now = new Date();
  const days = Math.max(1, Number(durationDays) || 30);

  // Check if member currently has an active subscription
  const existingActiveSub = await Subscription.findOne({
    member: memberId,
    status: 'active',
    endDate: { $gt: now },
  }).sort({ endDate: -1 });

  let startDate;
  if (existingActiveSub) {
    // Renewal: extends from existing subscription's end date
    startDate = new Date(existingActiveSub.endDate);
  } else {
    // New subscription: starts on payment date or now
    startDate = paymentDate ? new Date(paymentDate) : now;
  }

  const endDate = new Date(startDate.getTime() + days * 86400000);
  const isFuture = endDate > now;
  const status = isFuture ? 'active' : 'expired';

  const subscription = await Subscription.create({
    member: memberId,
    membershipPlan: planId,
    payment: paymentId,
    startDate,
    endDate,
    status,
  });

  // Link payment back to subscription if paymentId is provided
  if (paymentId) {
    await Payment.findByIdAndUpdate(paymentId, { subscription: subscription._id });
  }

  return subscription;
};
