-- ---------------------------------------------------------------------------
-- 0094  Phase 5, step 5b: corrections reach the evidence
--
-- PHASE_5_EVIDENCE_PLAN.md 3.2. A sale reversal and a refund emit events
-- marked as corrections, but the evidence engine only acted on event types
-- it had a rule for, and neither had one: a reversed sale or refunded
-- payment kept its positive evidence. And a credit note, issued through
-- issue_document, earned +1 as "issued documentation".
--
-- evidence_correct_event(event)
--   For an event that undoes another (event_outbox.reversal_of, linked since
--   0093, or correction_of), writes one correcting record for each piece of
--   positive evidence the original earned: same dimension, negative weight,
--   pointing at the record it corrects and the event it reverses. Evidence is
--   append-only (0072), so nothing is edited: the original stays, the
--   correction sits beside it (spec 08 section 12).
--   A partial refund corrects in proportion: GHS 40 of a GHS 100 payment
--   undoes 40% of that payment's evidence. Two partial refunds together never
--   undo more than the whole. Running it twice writes nothing new.
--   Its level is the correcting event's own (a provider-confirmed refund is
--   payment-verified; a till reversal is merchant-declared).
--
-- Credit notes stop counting as documentation: the evidence engine skips
-- them (lib/domains/evidence.ts), and the ones already counted are withdrawn
-- below by a correcting record.
--
-- Every existing reversal and refund is corrected once, below. On live on
-- 17 Nov 2026 there are none; the one credit note's +1 is withdrawn.
--
-- Tables and columns touched: evidence_record (insert only), event_outbox
-- (read: event_id, event_type, business_id, amount, verification,
-- reversal_of, correction_of, payload).
-- ---------------------------------------------------------------------------

create or replace function evidence_correct_event(p_event_id uuid)
returns int
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  e event_outbox%rowtype;
  v_original event_outbox%rowtype;
  v_ratio numeric := 1;
  v_written int := 0;
  r record;
  v_already numeric;
  v_take numeric;
begin
  select * into e from event_outbox where event_id = p_event_id;
  if not found then return 0; end if;
  select * into v_original from event_outbox where event_id = coalesce(e.reversal_of, e.correction_of);
  if not found then return 0; end if;

  -- A partial refund undoes only its share.
  if coalesce(e.amount, 0) > 0 and coalesce(v_original.amount, 0) > 0 and e.amount < v_original.amount then
    v_ratio := e.amount / v_original.amount;
  end if;

  for r in
    select * from evidence_record
     where source_event_id = v_original.event_id
       and weight > 0
  loop
    -- What has already been taken off this record, by any correction.
    select coalesce(sum(-weight), 0) into v_already
      from evidence_record
     where detail->>'corrects' = r.id::text;
    v_take := least(round(r.weight * v_ratio, 4), r.weight - v_already);
    continue when v_take <= 0;

    insert into evidence_record (
      business_id, source_event_id, dimension, evidence_type, verification,
      weight, rule_version, detail
    ) values (
      r.business_id, e.event_id, r.dimension, r.evidence_type || '_reversed',
      case coalesce(e.verification, 'merchant_declared')
        when 'provider_confirmed' then 'payment_verified'
        else coalesce(e.verification, 'merchant_declared')
      end,
      -v_take, '2026.11-1',
      jsonb_build_object(
        'corrects', r.id,
        'reverses_event', v_original.event_id,
        'reason', e.event_type,
        'share', round(v_ratio, 4)
      )
    )
    on conflict (source_event_id, evidence_type) do nothing;
    if found then v_written := v_written + 1; end if;
  end loop;
  return v_written;
end
$fn$;

revoke all on function evidence_correct_event(uuid) from public, anon, authenticated;
grant execute on function evidence_correct_event(uuid) to service_role;

-- Every existing reversal and refund, once.
do $$
declare r record; v_total int := 0;
begin
  for r in
    select event_id from event_outbox
     where reversal_of is not null or correction_of is not null
     order by id
  loop
    v_total := v_total + evidence_correct_event(r.event_id);
  end loop;
  raise notice 'corrections: % correcting evidence records written', v_total;
end $$;

-- Credit notes already counted as documentation are withdrawn, beside the
-- original, never by editing it.
insert into evidence_record (
  business_id, source_event_id, dimension, evidence_type, verification,
  weight, rule_version, detail
)
select ev.business_id, ev.source_event_id, ev.dimension, 'issued_document_withdrawn', ev.verification,
       -ev.weight, '2026.11-1',
       jsonb_build_object('corrects', ev.id, 'reason', 'a credit note is not documentation evidence')
  from evidence_record ev
  join event_outbox o on o.event_id = ev.source_event_id
 where ev.evidence_type = 'issued_document'
   and ev.weight > 0
   and o.payload->>'type' = 'credit_note'
on conflict (source_event_id, evidence_type) do nothing;
