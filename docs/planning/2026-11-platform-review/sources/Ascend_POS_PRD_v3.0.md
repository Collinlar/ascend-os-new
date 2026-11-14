# Ascend POS Product Requirements Document v3.0

**Status:** Authoritative POS baseline  
**Date:** 16 September 2026  
**Inherits:** AscendSME Master PRD v3.0  
**Supersedes:** Ascend POS PRD v2.0 where this document introduces conflicting BYOD, commercial, setup or deployment decisions.

---

## 1. Executive Summary

Ascend POS turns a supported Android smartphone into a business POS for free.

A merchant can download the app, manually create a business and catalogue, record sales, trigger supported payments, issue digital receipts and track basic stock without paying a software licence.

Ascend monetizes optional value around the free operating core:

- Smart Setup
- Assisted Setup
- Portable receipt printers
- Smart POS terminals
- Counter deployments
- Integrated payment services
- Assurance
- Office
- advanced Documents
- Shop and Discover growth
- multi-location operations
- verified business reports

The same POS engine adapts across personal smartphones, merchant-owned tablets, Ascend Smart POS terminals and wide counter screens.

---

## 2. Product Promise

> **Start selling with the phone you already have. Upgrade when your business needs more.**

---

## 3. Deployment Family

### Ascend POS

Free software on supported personal or business Android devices.

### Ascend POS Print Kit

Ascend POS plus a supported portable printer, pairing, test receipt and optional setup.

### Ascend Smart POS

Dedicated Android device with integrated printer, preinstalled Ascend POS, device registration, offline capability and managed support.

### Ascend POS Counter

Fixed-counter configuration with larger screen, external printer and optional scanner, cash drawer, customer display and payment terminal.

---

## 4. Free POS Scope

- Business creation
- Manual catalogue
- Product images
- Categories
- Prices
- Opening stock
- Cash sales
- Supported payment triggering
- Basic payment recording
- Digital receipts
- Supported printer pairing
- Daily sales summary
- Customer records
- Basic staff
- Cashier roles
- Shift open and close
- Offline cash selling
- Synced business history

---

## 5. Setup Choice

During onboarding the user chooses:

1. **Add products myself** - free
2. **Let Ascend AI help me** - paid Smart Setup
3. **Set it up for me** - paid Assisted Setup

No paid path may block free manual activation.

---

## 6. Screen Strategy

### Compact phone and Android POS screens

- Portrait-first
- Sequential selling flow
- Large touch targets
- Persistent cart total
- Quick checkout access
- Minimal simultaneous panels

### Tablets and wide counters

- Product browser and cart visible together
- Scanner and keyboard-friendly interaction
- Persistent totals
- Faster high-throughput selling

Both use identical transaction, stock, payment and evidence records.

---

## 7. Requirements

| ID | Requirement |
|---|---|
| POS3-001 | POS shall be downloadable without software licence purchase. |
| POS3-002 | Manual onboarding shall be possible without payment. |
| POS3-003 | Supported Android smartphones shall be first-class POS devices. |
| POS3-004 | The app shall support compact portrait layouts. |
| POS3-005 | The app shall support tablet layouts. |
| POS3-006 | The app shall support wide counter layouts. |
| POS3-007 | Layout adaptation shall not change the underlying transaction model. |
| POS3-008 | Compact layouts shall use a sequential sale flow. |
| POS3-009 | Compact layouts shall keep cart total visible. |
| POS3-010 | Wide layouts shall support persistent cart visibility. |
| POS3-011 | Camera-based product-image capture shall be supported. |
| POS3-012 | Manual product creation shall remain free. |
| POS3-013 | AI product creation shall be available through Smart Setup. |
| POS3-014 | Assisted Setup shall be available through Ascend or approved partners. |
| POS3-015 | Products shall use the shared Catalogue Core. |
| POS3-016 | POS products shall be reusable by Shop and Discover. |
| POS3-017 | Merchants shall retain catalogue ownership after paid setup. |
| POS3-018 | Cash payment shall be supported. |
| POS3-019 | Mobile Money initiation shall be supported through approved integrations where available. |
| POS3-020 | Card-payment initiation shall be supported through approved integrations where available. |
| POS3-021 | Manual external-payment recording shall be supported. |
| POS3-022 | Payment verification confidence shall be preserved. |
| POS3-023 | Unverified payments shall not be shown as provider-verified. |
| POS3-024 | Digital receipts shall be supported. |
| POS3-025 | Supported Bluetooth printers shall be supported. |
| POS3-026 | Integrated Smart POS printers shall be supported. |
| POS3-027 | Approved USB or network printers may be supported on Counter deployments. |
| POS3-028 | Printer setup shall include discovery, connection, paper settings and test receipt. |
| POS3-029 | Digital receipt shall remain available when printer is unavailable. |
| POS3-030 | Printer failure shall not lose a sale. |
| POS3-031 | Receipt reprint shall be supported. |
| POS3-032 | Digital receipt sharing shall be supported. |
| POS3-033 | Completed sales shall reduce shared inventory where stock tracking is enabled. |
| POS3-034 | Manual stock adjustment shall require permission. |
| POS3-035 | Sensitive stock adjustment may require Office approval. |
| POS3-036 | Basic customer capture shall be supported. |
| POS3-037 | POS shall reuse shared customer records. |
| POS3-038 | Basic cashier users shall be supported. |
| POS3-039 | Shift opening shall be supported. |
| POS3-040 | Shift closing shall be supported. |
| POS3-041 | Location assignment shall be supported. |
| POS3-042 | Offline cash sales and product lookup shall be supported. |
| POS3-043 | Offline sales shall queue for synchronization. |
| POS3-044 | Synchronization shall be idempotent. |
| POS3-045 | Merchant-owned and Ascend-managed devices shall be distinguished. |
| POS3-046 | Personal phones shall not require MDM. |
| POS3-047 | Ascend Smart POS may use managed-device controls. |
| POS3-048 | Counter devices supplied by Ascend may use managed-device controls. |
| POS3-049 | Signing into another supported device shall expose the same business data subject to permission. |
| POS3-050 | Smart POS upgrade shall not require catalogue migration. |
| POS3-051 | Counter upgrade shall not require transaction migration. |
| POS3-052 | Managed devices shall support remote logout. |
| POS3-053 | Managed devices shall support device registration. |
| POS3-054 | Managed-device status and last sync shall be visible. |
| POS3-055 | Daily sales summary shall be supported. |
| POS3-056 | Payment-method summary shall be supported. |
| POS3-057 | Cashier summary shall be supported. |
| POS3-058 | Owner monitoring shall be available through Ascend Business Mobile. |
| POS3-059 | Owner monitoring shall show sales, payment mix, shifts, stock exceptions and sync state. |
| POS3-060 | Basic receipts shall not require Documents Pro. |
| POS3-061 | Basic invoice capability may be included where appropriate. |
| POS3-062 | Advanced quotations, recurring invoices, statements and signatures shall belong to Documents Pro. |
| POS3-063 | Basic cashier roles shall not require Full Office. |
| POS3-064 | Full attendance, leave, projects, procurement and advanced approvals shall belong to Office. |
| POS3-065 | Products shall be publishable to Shop without recreation. |
| POS3-066 | Eligible products shall be promotable through Discover. |
| POS3-067 | POS and Shop shall share one inventory ledger. |
| POS3-068 | Multi-location inventory shall be supported through entitled configurations. |
| POS3-069 | Managed setup packages shall be supported. |
| POS3-070 | Product-count based Smart Setup packs shall be supported. |
| POS3-071 | Smart Setup consumption shall be measurable. |
| POS3-072 | Manual product creation shall remain after paid AI capacity is exhausted. |
| POS3-073 | Portable printer bundles shall be supported. |
| POS3-074 | Dedicated Smart POS SKUs shall be supported. |
| POS3-075 | Counter SKUs shall be supported. |
| POS3-076 | Hardware purchase shall remain distinct from free POS entitlement. |
| POS3-077 | Assurance purchase shall remain distinct from free POS entitlement. |
| POS3-078 | Historical sales shall remain accessible after Assurance expiry. |
| POS3-079 | Merchant export access shall remain available. |
| POS3-080 | Sales, payments, stock and shift events shall feed the Business Event Engine. |
| POS3-081 | Sales evidence shall use verification confidence. |
| POS3-082 | Hardware purchase shall not improve Sustainability Score directly. |
| POS3-083 | Smart Setup purchase shall not improve Sustainability Score directly. |
| POS3-084 | Verified integrated payments may strengthen evidence confidence for related transactions. |
| POS3-085 | Ghana-first currency and payment configuration shall be supported. |
| POS3-086 | Country expansion shall not require separate POS codebases. |
| POS3-087 | Free-to-paid conversion shall be measurable. |
| POS3-088 | Time to first sale shall be measured. |
| POS3-089 | Printer attachment rate shall be measured. |
| POS3-090 | Smart POS upgrade rate shall be measured. |
| POS3-091 | Payment activation rate shall be measured. |
| POS3-092 | Shop activation from POS shall be measured. |
| POS3-093 | Discover activation from POS shall be measured. |
| POS3-094 | Office conversion from POS shall be measured. |
| POS3-095 | Device and screen class shall be measured. |
| POS3-096 | Compact and wide layouts shall meet accessibility requirements. |
| POS3-097 | Core POS actions shall work on low bandwidth. |
| POS3-098 | Sync status shall be visible. |
| POS3-099 | Printer status shall be visible. |
| POS3-100 | One shared code and data foundation shall support all POS deployment configurations. |

---

## 8. Onboarding Flow

1. Create business
2. Choose business type
3. Choose setup method
4. Add or generate products
5. Confirm prices
6. Configure stock
7. Select payment methods
8. Select receipt mode
9. Connect printer or remain digital-only
10. Complete test sale

A simple business using AI or assisted setup should be able to reach a usable first sale in under 10 minutes, subject to catalogue size and connectivity.

---

## 9. Commercial Packages

### Free POS

- App
- Manual setup
- Manual catalogue
- Digital receipts
- Cash sales
- Basic stock
- Basic staff and shifts

### Smart Setup

Paid AI catalogue processing.

### Assisted Setup

Paid implementation service.

### POS Print Kit

Portable printer and optional setup.

### Ascend Smart POS

Dedicated all-in-one hardware.

### Ascend POS Counter

Fixed-counter hardware and peripherals.

---

## 10. Final Definition

> **Ascend POS is a free business POS that turns a supported smartphone into a selling device and scales into dedicated Smart POS and Counter deployments without changing the business record.**
