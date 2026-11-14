# AscendSME Platform Capability Map & Business Graph Specification v1.0

**Status:** Foundational architecture specification  
**Date:** 29 October 2026  
**Owner:** Bold Vision MultiTech / AscendSME Product & Engineering  
**Applies to:** All current and future AscendSME product sets

---

## 1. Purpose

This document defines the foundational capability ownership model of AscendSME.

Its purpose is to prevent future product growth from creating duplicate customers, duplicate staff, duplicate catalogues, duplicate payments, duplicate documents, conflicting inventory, fragmented permissions or inconsistent evidence.

> **Different product experiences. One connected business foundation.**

---

## 2. Business Graph Concept

The Ascend Business Graph is the connected operational representation of a business.

It is not initially a separate customer-facing product.

It represents the relationships between:

```text
Business
  ↕
People
  ↕
Locations
  ↕
Customers
  ↕
Products and Services
  ↕
Orders and Bookings
  ↕
Transactions
  ↕
Payments
  ↕
Documents
  ↕
Staff Activity
  ↕
Suppliers
  ↕
Campaigns
  ↕
Operational Events
```

The Business Graph is the operational memory.

The Business Evidence Ledger is the governed proof layer derived from selected events in that graph.

---

## 3. Business Graph vs Evidence Ledger

### Business Graph

Answers:

- What entities exist?
- How are they related?
- What happened?
- Who did it?
- Where did it happen?
- Which product set initiated it?

### Business Evidence Ledger

Answers:

- Which events count as evidence?
- How strong is the evidence?
- Was it verified?
- Was it reversed or corrected?
- Can it be used in readiness or scoring?

---

## 4. Canonical Shared Domains

| Domain | Canonical responsibility |
|---|---|
| Identity | Person and authentication identity |
| Business | Business identity and status |
| Membership | Relationship between person and business |
| Locations | Business operating locations |
| Roles & Permissions | Access and delegated authority |
| Customers | Customer relationship records |
| Suppliers | Supplier relationship records |
| Catalogue | Products and services |
| Inventory | Stock and movement ledger |
| Orders | Product-sale orders |
| Bookings | Service bookings |
| Transactions | Commercial transaction record |
| Payments | Payment attempts, verification and allocation |
| Financial Foundation | Money-in, money-out, receivables, liabilities and financial events |
| Documents | Quotations, invoices, receipts, agreements and POs |
| Work | Tasks, projects and assignments |
| Approvals | Internal control and approval history |
| Communications | WhatsApp, SMS, email and push |
| Campaigns | CRM and Discover campaigns |
| Devices | Registered POS and managed devices |
| Entitlements | Commercial access rights |
| Ascend Balance | Prepaid value ledger |
| Events | Business Event Engine |
| Evidence | Business Evidence Ledger |
| Readiness | MOT, Sustainability Score, Trust, Funding Readiness and Evidence Confidence |

---

## 5. Identity Model

One human identity may have many contexts.

```text
Person
  ├── Owner of Business A
  ├── Manager of Business B
  └── Customer of Business C
```

The platform must not create separate login identities merely because the context changes.

Access is determined by membership, role, location and permissions.

---

## 6. Business Model

One business record shall own or reference:

- business identity
- locations
- memberships
- customers
- catalogue
- inventory
- transactions
- payments
- documents
- work
- campaigns
- evidence
- entitlements

A business may operate several locations without becoming several businesses unless deliberately configured that way.

---

## 7. Customer Model

One customer relationship per business should represent the person or organisation the business serves.

The same human may be a customer of several Ascend businesses, but merchant data remains isolated.

Ascend may provide the customer with access to their own cross-business history without exposing one merchant's data to another merchant.

---

## 8. Catalogue Model

The Catalogue is shared across:

- POS
- Shop
- Discover
- Documents
- Inventory
- CRM
- reporting

A product is created once and enabled for relevant channels.

Channel-specific fields may vary without duplicating the core product identity.

---

## 9. Inventory Model

Inventory is an append-only movement ledger.

Movement types may include:

- opening balance
- purchase receipt
- sale
- return
- transfer
- adjustment
- wastage
- count
- reservation
- release

POS and Shop must not maintain separate stock truths.

---

## 10. Transaction Model

A transaction is the commercial outcome around which product experiences operate.

Examples:

- POS sale
- Shop order
- service booking
- invoice payment
- project milestone payment

The transaction should link business, location, customer, products or services, payment obligations, payments, documents, fulfilment, staff and evidence.

---

## 11. Communications Model

One Communications Engine shall support:

- WhatsApp
- SMS
- email
- push

It owns:

- templates
- consent
- opt-out
- delivery status
- channel configuration
- cost
- message history

CRM, Documents, Shop, Services, Discover and Office call the same engine.

---

## 12. Work Model

One Work Core shall support:

- tasks
- projects
- assignments
- milestones
- recurring work
- completion
- escalation

Shop fulfilment, Services delivery, CRM follow-up and Office operations may all create work in the same domain.

---

## 13. Product Set Responsibility Map

| Product set | Primary job |
|---|---|
| POS | Physical selling and transaction capture |
| Shop | Online selling and conversion |
| Services | Booking and service delivery |
| Discover | Customer discovery and promotion |
| CRM | Customer lifecycle and retention |
| Office | Internal people, work and operational control |
| Documents | Transaction formalisation |
| Finance | Financial visibility and interpretation |
| Inventory | Advanced stock and supplier control |
| Readiness | Credibility, evidence and opportunity readiness |

---

## 14. Shared Capability Ownership Map

| Capability | Canonical owner | Main consumers |
|---|---|---|
| Business identity | Business Core | All |
| Staff | People & Access | POS, Services, Office |
| Customers | Customer Core | POS, Shop, Services, CRM, Documents |
| Catalogue | Catalogue Core | POS, Shop, Discover, Documents, Inventory |
| Inventory | Inventory Core | POS, Shop, Office, Inventory |
| Payments | Payments Core | POS, Shop, Services, Documents, Finance |
| Documents | Documents Core | POS, Shop, Services, Office, CRM |
| Work | Work Core | Office, Shop, Services, CRM |
| Messaging | Communications Engine | CRM, Shop, Services, Documents, Office, Discover |
| Evidence | Evidence Engine | All |
| Entitlements | Commercial Engine | All |
| AI | AI Services Layer | All |

---

## 15. Core Architecture Requirements

| ID | Requirement |
|---|---|
| BG-001 | The platform shall maintain one canonical person identity. |
| BG-002 | A person shall support multiple business and customer contexts. |
| BG-003 | The platform shall maintain one canonical business identity per business. |
| BG-004 | The platform shall support multiple locations per business. |
| BG-005 | The platform shall maintain one staff membership record per person-business relationship. |
| BG-006 | The platform shall maintain one role and permission system. |
| BG-007 | Product sets shall not create separate permission engines. |
| BG-008 | The platform shall maintain one Customer Core. |
| BG-009 | Product sets shall reuse Customer Core records. |
| BG-010 | The platform shall maintain one Supplier Core. |
| BG-011 | The platform shall maintain one shared Catalogue Core. |
| BG-012 | POS and Shop shall not maintain separate canonical products. |
| BG-013 | Discover shall reference canonical catalogue items. |
| BG-014 | Documents shall reference canonical catalogue items where applicable. |
| BG-015 | CRM shall reference canonical products and services. |
| BG-016 | The platform shall maintain one Inventory Core. |
| BG-017 | Inventory movement shall be append-only and auditable. |
| BG-018 | POS sales shall create inventory movements through Inventory Core. |
| BG-019 | Shop fulfilment shall create inventory movements through Inventory Core. |
| BG-020 | Purchase receipt shall create inventory movements through Inventory Core. |
| BG-021 | The platform shall support stock by location. |
| BG-022 | The platform shall maintain one transaction identity for each commercial transaction. |
| BG-023 | A transaction shall link customer where available. |
| BG-024 | A transaction shall link location and actor where relevant. |
| BG-025 | A transaction shall link products or services. |
| BG-026 | A transaction shall link payment obligations and payments. |
| BG-027 | A transaction shall link documents and fulfilment. |
| BG-028 | The platform shall maintain one Payments Core. |
| BG-029 | Payment states shall distinguish pending, verified, failed, reversed and refunded. |
| BG-030 | Product sets shall not invent payment verification. |
| BG-031 | The platform shall maintain one Financial Foundation. |
| BG-032 | Financial events shall derive from canonical transactions and payments. |
| BG-033 | The platform shall maintain one Documents Core. |
| BG-034 | Product sets shall not create independent invoice or receipt engines. |
| BG-035 | The platform shall maintain one Work Core. |
| BG-036 | Shop fulfilment tasks shall use Work Core. |
| BG-037 | Services delivery tasks shall use Work Core. |
| BG-038 | CRM follow-up tasks shall use Work Core. |
| BG-039 | Office shall provide the primary full work-management experience. |
| BG-040 | The platform shall maintain one Approval Core. |
| BG-041 | Product sets shall reuse shared approval rules. |
| BG-042 | The platform shall maintain one Communications Engine. |
| BG-043 | CRM shall not create a separate WhatsApp store. |
| BG-044 | Documents shall not create a separate email engine. |
| BG-045 | Shop shall not create a separate SMS engine. |
| BG-046 | The Communications Engine shall own consent and opt-out state. |
| BG-047 | The platform shall maintain one campaign abstraction where practical. |
| BG-048 | CRM and Discover campaigns may differ in objective while reusing common infrastructure. |
| BG-049 | The platform shall maintain one Device Registry. |
| BG-050 | Device Registry shall distinguish personal and managed devices. |
| BG-051 | The platform shall maintain one Entitlement Engine. |
| BG-052 | Product sets shall not enforce pricing through hard-coded duplicated rules. |
| BG-053 | The platform shall maintain one Ascend Balance ledger. |
| BG-054 | Variable-cost services shall use the shared commercial engine. |
| BG-055 | The platform shall maintain one Business Event Engine. |
| BG-056 | All product sets shall emit canonical events. |
| BG-057 | Events shall identify business, source product set and related entity. |
| BG-058 | Events shall identify location and actor where relevant. |
| BG-059 | Events shall preserve event time and verification level. |
| BG-060 | Events shall support correction and reversal references. |
| BG-061 | The platform shall maintain one Business Evidence Ledger. |
| BG-062 | Evidence shall be append-only. |
| BG-063 | Evidence shall distinguish merchant-declared, system-recorded, customer-confirmed, payment-verified and institution-verified sources. |
| BG-064 | Paid product purchases shall not directly improve Sustainability Score. |
| BG-065 | Promotion spend shall not directly improve trust. |
| BG-066 | Hardware purchase shall not directly improve evidence confidence. |
| BG-067 | The platform shall maintain one Readiness layer. |
| BG-068 | MOT, Sustainability Score, Trust, Funding Readiness and Evidence Confidence shall remain distinct outputs. |
| BG-069 | Missing data shall not automatically equal poor business performance. |
| BG-070 | The platform shall maintain one AI Services Layer. |
| BG-071 | POS may use AI for Smart Setup. |
| BG-072 | Shop may use AI for catalogue creation. |
| BG-073 | CRM may use AI for campaign and follow-up assistance. |
| BG-074 | Documents may use AI for drafting assistance. |
| BG-075 | Office may use AI for work summaries. |
| BG-076 | Finance may use AI for financial explanations. |
| BG-077 | Readiness may use AI for recommendation explanations. |
| BG-078 | AI shall not become a separate conflicting data store. |
| BG-079 | AI-generated fields shall preserve source and review status. |
| BG-080 | The platform shall maintain one audit framework. |
| BG-081 | High-risk actions shall preserve actor, timestamp and before-after state. |
| BG-082 | The platform shall maintain one notification framework. |
| BG-083 | Notifications shall link to canonical records. |
| BG-084 | The platform shall maintain one authorised search abstraction. |
| BG-085 | Search shall respect tenancy and permissions. |
| BG-086 | The platform shall maintain one analytics event taxonomy. |
| BG-087 | Analytics shall not replace canonical transaction or evidence records. |
| BG-088 | The platform shall maintain one integration gateway. |
| BG-089 | External APIs shall use canonical identifiers. |
| BG-090 | External integrations shall not create duplicate domain stores. |
| BG-091 | Retry-sensitive creation shall be idempotent. |
| BG-092 | Reliable event publication shall use a transactional outbox or equivalent pattern. |
| BG-093 | Product experiences may use eventual consistency where immediate transaction consistency is unnecessary. |
| BG-094 | Payment and financial operations shall use stronger consistency guarantees. |
| BG-095 | Product sets shall not bypass domain ownership through direct database writes. |
| BG-096 | Domain APIs shall define supported mutations. |
| BG-097 | Channel-specific API composition may optimize web, mobile and POS without duplicating domain logic. |
| BG-098 | The platform shall support country configuration without codebase forks. |
| BG-099 | The platform shall support local currencies, payment providers, messaging providers and approved tax configuration. |
| BG-100 | The platform shall support phased product activation without changing core identity. |

---

## 16. Business Graph Relationships

```text
Business ──has──> Locations
Business ──has──> Staff Memberships
Business ──serves──> Customers
Business ──owns──> Catalogue Items
Catalogue Item ──has──> Inventory Positions
Customer ──places──> Order
Customer ──books──> Booking
Order ──creates──> Transaction
Booking ──creates──> Transaction
Transaction ──has──> Payment Obligation
Payment Obligation ──settled_by──> Payment
Transaction ──generates──> Document
Transaction ──creates──> Work
Campaign ──targets──> Customer Segment
Event ──references──> Graph Entity
Evidence ──derived_from──> Event
```

---

## 17. Product Activation Rule

Activating a product set should add a new experience over existing data.

### POS to Shop

No product migration. Products become Shop-enabled.

### POS to CRM

No customer migration. Existing customers gain CRM relationship views.

### Shop to Discover

No catalogue recreation. Eligible products become discoverable.

### Services to Office

No staff recreation. Providers gain broader Office workflows.

### Documents to Finance

No invoice recreation. Finance interprets existing receivables and payments.

---

## 18. Data Ownership and Institutional Access

Merchant operational records remain merchant-controlled subject to platform terms and legal requirements.

Institutional access must be:

- purpose-bound
- consented where required
- time-bound
- field-limited
- auditable

---

## 19. Product Addition Checklist

Every future product set must answer:

1. Which shared domains does it consume?
2. Does it need a genuinely new domain?
3. Which canonical entity owns the data?
4. Which events will it emit?
5. Which evidence can those events create?
6. Which permissions apply?
7. Which channels expose it?
8. What is free versus paid?
9. Does it duplicate an existing capability?
10. Can it be deactivated without losing shared data?

No new product should move to implementation until these questions are resolved.

---

## 20. Recommended Capability Priorities

### Immediate

- CRM
- Communications Engine hardening
- Customer Core hardening
- Catalogue Core hardening
- Business Graph identifiers
- canonical event taxonomy

### Near-term

- Finance foundation
- advanced Inventory
- Procurement depth
- Readiness model formalisation

### Later

- People / HR depth
- delivery integrations
- asset management
- advanced workflow automation
- partner marketplace
- sector-specific product packs

---

## 21. Final Architecture Definition

AscendSME should be able to add new products without rebuilding the business.

That is the test.

> **A business can enter Ascend through any useful job, activate additional capabilities over time, and every new product already understands the business because the foundational data is shared.**

The Business Graph is the connective tissue that makes that possible.
