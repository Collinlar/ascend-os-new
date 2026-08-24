# AscendSME Connected Platform (new deployment)

One connected business operating and credibility platform for African SMEs.
Businesses start with POS, Shop, Services or Documents; their customers,
products, inventory, payments, people, work and evidence stay connected on
one shared engine.

Built from:
- **AscendSME Connected Platform Master PRD v2.0** (23 July 2026)
- **Ascend POS PRD v2.0**

## Status

Foundation phase (Master PRD §26.1): shared identity and domains, the business
event outbox, the evidence ledger, the entitlement engine, the POS sale
completion service and sync contract, plus the app shell (entry routing,
onboarding, Business Web dashboard, POS Terminal Mode).

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Backend | Next.js API routes + Postgres functions for atomic domain services |
| Database | Supabase (PostgreSQL), RLS tenant isolation |
| AI | Anthropic Claude API (Shop catalogue assistance) |
| Payments | Paystack (MTN MoMo, card, bank transfer) |
| Messaging | 360dialog WhatsApp, WhatsApp OTP auth |

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys
npm run dev
```

Apply the schema to a Supabase project with the Supabase CLI:

```bash
supabase db push
```

Routes to look at first:

- `/` entry routing: four jobs, no product lecture
- `/onboarding?path=pos|shop|services|documents` first-value onboarding
- `/pos` Terminal Mode compact selling screen (offline-first pattern)
- `/dashboard` Business Web owner home (exceptions before totals)
- `POST /api/pos/sync` the terminal sync contract

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the zero-silo rules,
domain ownership map, event and evidence flow, and PRD traceability.

Two rules that never bend:

1. **One record, many experiences.** A capability has one owning domain.
   Product sets never create duplicate customer, product, staff, inventory,
   payment or evidence records (PRI-002).
2. **Evidence follows activity.** Scores come from real operating behaviour
   and are explainable. Buying more Ascend products never buys a better
   score (RDY-005).
