-- Razorpay INR orders must be at least ₹1 (100 paise).
-- Free coupon-covered orders remain valid at exactly zero.
-- Historical failed sub-₹1 attempts are retained for audit; no active order is affected.
alter table public.orders
  add constraint orders_razorpay_minimum_amount_check
  check (
    (status = 'free' and total_minor = 0)
    or (status in ('pending', 'paid') and total_minor >= 100)
    or status not in ('free', 'pending', 'paid')
  ) not valid;

alter table public.orders
  validate constraint orders_razorpay_minimum_amount_check;
