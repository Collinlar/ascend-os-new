# Inventory Core (spec 06)

18 November 2026. For Collins to approve before anything is built.

Spec: `06_Inventory_Core_Specification_v1.0.md`. Its one rule: **a stock figure is the sum of movements, never a number someone typed over.** Ascend has kept that rule since migration 0002. This plan does not start over. It fills the gaps between the ledger Ascend already has and the one the spec describes, and leaves the advanced inventory product (batches, expiry, valuation, warehouses, forecasting, spec section 11) named for later.

Live today: 31 businesses, each with one location. 37 products, 5 of them with stock tracking on. 20 stock movements (11 sales, 5 restocks, 4 shop holds). No suppliers, no purchase orders, no variants. Small enough that every change below can be checked against every real movement.

---

## 1. What exists today

| Spec | Where it lives | State |
|---|---|---|
| Ledger, not edited numbers (s2) | `stock_movement`, append-only by trigger (0072); `stock_balance` sums it per item and location | Holds |
| Location (s5) | Every movement has a location | Holds |
| POS (s6) | `complete_pos_sale` writes a sale movement, idempotent by `client_ref`, so an offline till can resend safely | Holds |
| Shop (s7) | An order places a hold (`reservation`), released when it is fulfilled or cancelled; fulfilling writes the sale | Holds, but see gaps 2 and 3 |
| Opening, restock, loss, count (s4) | `record_stock_movement` and the Products page; loss and count corrections need a reason, the actor is recorded | Holds, one item at a time |
| Returns (s9) | A till reversal or a refunded shop order puts the goods straight back on the shelf | Partly: always restocked |
| Reorder rule | `low_stock_threshold` on each item, and a "Low stock" filter on the Products page | Holds, simple |
| Suppliers | `supplier` table (0054), for purchase orders as documents | Exists, unused, and not linked to stock |
| Cost (s12) | `unit_cost` on a movement | The column exists; no restock on live has a cost |
| Stock rules at the till | `stock_enforcement` (none, soft, hard) on each item | The setting exists; nothing reads it |

## 2. What is missing

1. **Goods in from a supplier are anonymous.** A restock says "5 more", not who supplied them, at what cost, or on which purchase order. So there is no cost to work out margin from, and the money paid for stock never reaches the Financial Foundation's "Stock and goods for resale" category.
2. **No "available" figure.** The shelf count ignores shop holds, which is right, but nothing subtracts them either. A customer can order the last bag of rice online while the till sells it.
3. **Nothing stops or flags selling what is not there.** `stock_enforcement` is never read. The shop accepts any quantity, and the till never warns. (Selling into negative must stay possible for an offline till; the spec asks for a visible policy, s15.)
4. **Every return goes back on the shelf.** Spoiled rice refunded at the counter comes back as sellable stock. The spec wants the return's condition to decide: restocked, damaged, or written off (s9).
5. **A stocktake is one item at a time, and keeps only the difference.** The spec wants a count to keep expected, counted, variance, reason and an approver (s10), across the whole shelf in one sitting.
6. **No transfers.** The movement kinds exist; nothing writes them. No business has a second location yet, so this is not urgent.
7. **Services cannot use stock** (s8). A salon's relaxer, a mechanic's oil.
8. **Stock tells no story yet.** A business that counts its shelf every week, and whose counts agree with its sales, is showing discipline worth evidence (s14). Large write-offs and count gaps are a risk signal. Neither is read today.

## 3. What this plan builds

| Step | What | Exit gate |
|---|---|---|
| I1 | **Receiving stock**: a purchase receipt names the supplier (optional), the cost per unit, and the purchase order if there is one. It writes the stock movements, and, when paid, money out under "Stock and goods for resale" (decision 2). An average cost per item is kept from receipts (decision 3) | On live, a throwaway business receives goods from a supplier at a cost; the shelf, the average cost and the money out all agree |
| I2 | **Available to sell and the shortage policy**: on hand minus shop holds, shown wherever stock is shown. The shop refuses more than is available on tracked items. The till follows the item's setting: sells freely, warns, or (hard) refuses when online; an offline sale is always accepted and flagged if it took stock below zero (decision 4) | A tracked item with 2 on the shelf and 1 held: the shop takes 1 and refuses a 2nd; the till warns on a soft item; an offline sale into negative is accepted and flagged |
| I3 | **Returns with a condition**: a till reversal and a refunded shop order ask what came back: back on the shelf, damaged, or nothing came back (decision 5) | A spoiled return is written off with its reason; a sound one is restocked; the shelf is right either way |
| I4 | **Stock counts**: a count covers many items in one sitting, keeps expected, counted and variance for each, and posts corrections only when approved. A large variance needs someone other than the counter to approve (decision 6) | A count of five items by a cashier, approved by the owner, posts exactly the differences; the count shows who counted, who approved, and why |
| I5 | **Stock as evidence and as a risk signal**: counts done and how close they came, as operational evidence (never financial); large write-offs and repeated count gaps as signals on the Risk desk (decision 7) | A business with a weekly count shows the evidence; one with heavy write-offs raises a signal |
| I6 | **Services that use stock**: a service lists what it uses; completing the booking takes it from the shelf (decision 8) | A completed hair appointment takes one tub of relaxer off the shelf |

Transfers (gap 6) wait until a business opens a second location; the movement kinds are ready.

Built and tested as before: local Postgres with every migration replayed, then throwaway ZZ businesses on live, cleaned up by id. Each step comes with its screen on the Products page or the till, checked at phone width.

## 4. Named, and not built here

- **Batches and expiry dates, serial numbers, warehouses, valuation methods beyond average cost, forecasting** (s11): the advanced inventory product.
- **Paying suppliers on credit** (what the business owes its suppliers): with the Finance experience. A receipt can say "not paid yet"; the debt itself is tracked later.
- **Variants**: the ledger already carries a variant on every movement. No business uses variants yet; the screens follow when one does.
- **Transfers between locations**: when a business has two.

## 5. Decisions for Collins

1. **Keep the existing movement names.** *Recommended:* the ledger keeps its names (restock, damage_loss, count_correction and so on) and gains the few the spec adds (supplier return, service use, expiry write-off). The spec's list maps onto them one to one; renaming 20 live records and every function that writes them buys nothing.
2. **Goods received and money out.** *Recommended:* a receipt records the goods at once. If the merchant says it was paid (cash or MoMo), the same step records the money out under "Stock and goods for resale", so stock and cash agree without entering it twice. If not paid yet, only the goods are recorded.
3. **Cost.** *Recommended:* a moving average cost per item, updated by each receipt, written onto every sale movement at the time of sale. That is enough for gross margin later and it is what most small shops would recognise. FIFO and batch costing belong to the advanced product. Cost is optional on a receipt; without it the average simply does not move.
4. **Selling what is not there.** *Recommended:* the shop never sells beyond what is available on a tracked item (a customer should not pay for rice that is not there). The till follows the item's own setting, and the default stays "sell freely": a market trader must never be stopped mid-queue by a stock figure they have not kept up to date. An offline sale is always accepted, and if it took stock below zero, the owner sees it flagged on the Products page.
5. **Returns.** *Recommended:* three choices at the counter, back on the shelf (the default), damaged (written off with a reason) or nothing came back (no stock movement). One tap, no extra screens.
6. **Who approves a count.** *Recommended:* an owner or manager can post their own count. A cashier's count waits for an owner or manager to approve it, and any count whose write-down is worth more than GHS 500 (at average cost, or at selling price when there is no cost) needs someone other than the counter, even if the counter is a manager. That is where stock theft hides.
7. **Stock as evidence.** *Recommended:* regular counts that agree with sales are operational evidence, weighted low, and say nothing about the business's money (spec s14). Heavy write-offs (more than 5% of stock value in 30 days) and three count gaps in a row become Risk signals in the cash discipline area.
8. **Services using stock.** *Recommended:* build it last, simply: a service lists items and quantities; a completed booking takes them off. If no salon or workshop on Ascend asks for it by then, it waits.
