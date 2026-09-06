-- ---------------------------------------------------------------------------
-- 0059  Register the reminder template with the provider
--
-- 0055 added invoice.reminder as a WhatsApp template and gave it none of
-- what 0027 requires: no provider_name, no param_order. Verified against
-- the live database, every reminder to a customer outside their 24-hour
-- window failed with "WhatsApp will not deliver this outside a customer
-- conversation until the template is approved".
--
-- The engine was right and the template was wrong. It refused rather than
-- spending a merchant's balance on a message 360dialog was always going to
-- reject, which is exactly what 0027 was written to do.
--
-- param_order follows the order the placeholders appear in the body,
-- because that is the order 360dialog fills positional parameters in.
-- ---------------------------------------------------------------------------

update message_template
set provider_name = replace(key, '.', '_'),
    param_order = array[
      'customer_name', 'document_number', 'business_name',
      'amount', 'due_date', 'link'
    ]
where key = 'invoice.reminder'
  and provider_name is null;

-- ---------------------------------------------------------------------------
-- approval_status is deliberately left at 'draft'.
--
-- Approval is a fact about 360dialog's systems, not about ours. Setting it
-- here would assert something nobody has done, and the first a merchant
-- would know of it is a customer never receiving a reminder the business
-- had been charged for.
--
-- Every WhatsApp template in the database is in this state, including the
-- three that shipped in 0015: document.issued, order.confirmed and
-- receipt.sent. Until each is submitted to 360dialog and approved, WhatsApp
-- delivery only works inside a customer's 24-hour window, which means it
-- works when the customer wrote first and not otherwise.
--
-- When a template is approved with the provider, flip it here:
--
--   update message_template
--   set approval_status = 'approved'
--   where key = 'document.issued';
--
-- Email is unaffected. It has no provider template concept, which is why
-- the email reminder delivered in the same test where the WhatsApp one
-- failed.
-- ---------------------------------------------------------------------------
