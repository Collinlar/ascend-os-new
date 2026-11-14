# AscendSME

## Ascend Documents Product Requirements Document

*The connected commercial-document, payment and business-evidence layer for African businesses*

> **Product thesis**
>
> Formalise the transaction without slowing the business down. Let businesses create professional documents, move customers toward payment or approval, and preserve a reliable commercial record through the same shared AscendSME engine.

| **Field** | **Value** |
|---|---|
| Document owner | Bold Vision MultiTech / AscendSME Product |
| Version | 2.0 |
| Status | Authoritative Ascend Documents product requirements baseline |
| Inherits | AscendSME Connected Platform Master PRD v2.0 |
| Primary market | Ghana |
| Expansion markets | Nigeria, Kenya, South Africa and other African markets |
| Date | 24 July 2026 |
| Supersedes | Ascend Documents PRD v1.0 where this document introduces a conflicting architecture, channel, packaging, evidence or monetization decision |

> **CONFIDENTIAL PRODUCT DOCUMENT**

# Document Control

This PRD defines Ascend Documents within the new connected AscendSME deployment. It is subordinate to the Master PRD for shared identity, zero-silo architecture, event governance, evidence, channels, permissions, payments, entitlements, security and monetization.

Ascend Documents operates in two ways:

1. As a standalone product for businesses that primarily need professional commercial documents and payment follow-up.
2. As the shared document capability used by Ascend POS, Ascend Shop, Ascend Services, Ascend Office and approved future product sets.

A document created from any AscendSME experience must use the same business, customer, catalogue, payment, ledger, staff and evidence records. Product sets may present simplified or specialised document actions, but they must not create separate document engines.

## Revision History

| **Version** | **Date** | **Change** | **Owner** |
|---|---|---|---|
| 1.0 | 13 July 2026 | Initial complete Ascend Documents baseline. | AscendSME Product |
| 2.0 | 24 July 2026 | Rebuilt Documents for the connected platform, Business and Customer web/mobile experiences, shared product-set workflows, zero-silo architecture, new monetization and evidence governance. | AscendSME Product |

## Approval Roles

| **Role** | **Approval responsibility** |
|---|---|
| Founder / CEO | Product vision, positioning, investment thesis and commercial direction |
| Product Lead | Scope, prioritisation, backlog quality and release acceptance |
| CTO / Engineering Lead | Architecture, security, data integrity, offline behaviour and delivery feasibility |
| Design Lead | Low-friction document creation, responsive quality and accessibility |
| Finance and Compliance Lead | Financial treatment, tax configuration, corrections, retention and report wording |
| Commercial Lead | Packaging, Ascend Balance, Assurance and unit-economics validation |
| Data and Evidence Lead | Event governance, evidence confidence and score integrity |
| Operations Lead | Assisted setup, templates, support and institutional delivery |

## Requirement Interpretation

- **MVP** requirements are required for the controlled connected-Documents release unless formally deferred.
- **Next** requirements support first commercial expansion.
- **Later** requirements preserve architectural extensibility and must not distort MVP delivery.
- Tax, accounting and regulatory outputs must remain configurable and subject to approved market-specific advice.
- All prices, allowances and targets remain commercial hypotheses until approved through Ghana pricing and unit-economics validation.
- Requirements use “shall” as the normative implementation language.

# Table of Contents

1. Executive Summary  
2. First Deployment Learning and Strategic Opportunity  
3. Relationship to the Connected Platform Master PRD  
4. Product Definition and Positioning  
5. Vision, Promise and Desired Outcomes  
6. Goals, Non-Goals and Product Principles  
7. Target Business Archetypes  
8. Personas, Roles and Permissions  
9. Product Scope and Release Model  
10. Product Surfaces and Channel Experience  
11. Information Architecture and Navigation  
12. Connected Platform and Zero-Silo Requirements  
13. End-to-End Document Journeys  
14. Document Taxonomy  
15. Document Lifecycle and Status Model  
16. Document Creation Entry Points  
17. Responsive Document Builder  
18. Business Identity, Customers and Commercial Parties  
19. Catalogue, Line Items and Pricing  
20. Tax, Discounts, Charges and Currency  
21. Document Numbering and Identity  
22. Templates, Branding and Institutional Co-Branding  
23. Quotations, Estimates and Proformas  
24. Invoices, Payment Requests and Recurring Documents  
25. Receipts, Credit Notes, Refunds and Reversals  
26. Purchase Orders and Supplier Documents  
27. Service, Job, Delivery and Completion Documents  
28. Agreements, Acceptance and Electronic Signatures  
29. Document Conversion and Relationship Graph  
30. Sending, Sharing and Delivery Tracking  
31. Payments, Deposits, Balances and Reconciliation  
32. Receivables, Reminders, Statements and Collections  
33. Customer Document Web and Mobile Experience  
34. My Briefcase and Supporting Documents  
35. Collaboration, Approvals and Accountant Access  
36. Versions, Corrections, Audit and Retention  
37. Offline, Synchronisation and Recovery  
38. Search, Organisation and Reporting  
39. Business Evidence Ledger and Readiness  
40. Monetization, Ascend Balance and Commercial Rules  
41. Bundles, Entitlements and Cross-Set Packaging  
42. Institutional and Sponsored Deployment  
43. Messaging and Notifications  
44. APIs, Webhooks and Integrations  
45. Security, Privacy, Fraud and Compliance  
46. Administration, Support and Merchant Success  
47. Migration and Interoperability  
48. Product Analytics and Success Metrics  
49. Rollout and Release Plan  
50. Quality Assurance and Acceptance  
51. Shared Data Model  
52. Canonical Events  
53. Risks and Mitigations  
54. Dependencies, Assumptions and Constraints  
55. Out of Scope  
56. Open Decisions  
57. Future Enhancements  
58. Master Acceptance Scenarios  
Appendices

---

# 1. Executive Summary

Ascend Documents is the shared commercial-document and transaction-formalisation layer of AscendSME. It helps African businesses create professional quotations, proformas, invoices, receipts, credit notes, purchase orders, delivery notes, service agreements, job cards, statements and related records without requiring accounting or document-management expertise.

The product is designed around a practical business truth: a document is not merely a PDF. It is part of a commercial workflow.

A quotation should move toward acceptance.  
An invoice should move toward payment.  
A receipt should prove payment.  
A purchase order should move toward delivery and supplier settlement.  
A service agreement should move toward delivery, completion and final payment.  
A correction should preserve what changed and why.

Ascend Documents must therefore connect every document to the business activity that created it. A receipt generated from Ascend POS, an invoice generated from Ascend Shop, a quotation generated from Ascend Services and a purchase order generated from Ascend Office all use the same document, customer, payment, financial and evidence foundation.

The product must work across:

- Ascend Business Web for complete creation, conversion, branding, receivables and reporting
- Ascend Business Mobile for quick documents, approvals, payment recording and follow-up
- Ascend POS Terminal Mode for receipts, invoices, returns and selected transaction documents
- Ascend Customer Web for secure viewing, acceptance, payment, signature and download
- Ascend Customer Mobile for document history, reminders, payment and cross-business records

> **Master product decision**
>
> Ascend Documents will formalise transactions across the entire platform without becoming a separate silo or a complex enterprise document-management system. Basic document creation remains accessible. AscendSME earns from branding, automation, payment collection, signatures, advanced collaboration, verification and institutional services.

---

# 2. First Deployment Learning and Strategic Opportunity

The first AscendSME deployment confirmed that businesses value professional documents, but several deeper lessons shape the new product.

Businesses often:

- Recreate quotations and invoices instead of converting one into another
- Issue receipts without linking them to the original payment obligation
- Share documents through WhatsApp without knowing whether they were viewed
- Lose files across phones, email, folders and physical records
- Alter issued documents without preserving a correction trail
- Create customer records repeatedly
- Struggle to follow unpaid balances
- Treat documentation as separate from sales and operations
- Need simple language rather than accounting terminology
- Need mobile actions more often than complex desktop document design

The strategic opportunity is to make documentation a natural consequence of business activity.

A merchant should not re-enter information already captured through POS, Shop, Services or Office. The system should create the correct document from the transaction, preserve the relationship, move the transaction forward and feed the Business Evidence Ledger.

The new Ascend Documents product therefore combines:

1. **Professionalisation**  
   Give businesses credible documents and branding.

2. **Commercial progression**  
   Help quotes become accepted, invoices become paid and obligations become trackable.

3. **Connected records**  
   Preserve one customer, payment, transaction and evidence history.

4. **Monetizable value**  
   Earn from automation, signatures, payments, premium outputs, verification and institutional workflows.

---

# 3. Relationship to the Connected Platform Master PRD

| **Shared platform capability** | **Platform responsibility** | **Ascend Documents responsibility** |
|---|---|---|
| Business identity | Maintain the canonical business, location, legal and trading identity. | Present approved issuer information and document-specific identity choices. |
| People and permissions | Maintain memberships, roles, delegated authority and location scope. | Apply document creation, issue, approval, correction and viewing permissions. |
| Customers and parties | Maintain shared customer, supplier and organisation records. | Use parties as recipients, bill-to contacts, signatories and suppliers. |
| Catalogue | Maintain canonical products, services, variants, units and prices. | Use catalogue items as reusable document line items. |
| Payments | Maintain payment attempts, verification, allocation, refunds and settlement. | Present payment requests, balances and payment status. |
| Financial foundation | Maintain ledger events, receivables, refunds and reconciliations. | Emit accurate commercial document events and reports. |
| Shop | Maintain online orders, fulfilment and customer commerce. | Generate order confirmations, invoices, receipts and refund documents. |
| POS | Maintain physical sales, shifts, returns and payment records. | Generate receipts, invoices, credit notes and transaction statements. |
| Services | Maintain bookings, quotes, deposits and delivery. | Generate quotations, agreements, invoices, job cards and completion records. |
| Office | Maintain projects, tasks, approvals, expenses and procurement. | Generate purchase orders, project invoices, approvals and supplier records. |
| Messaging | Maintain templates, consent, delivery state and variable-cost channels. | Send documents, reminders and secure links. |
| Evidence and Readiness | Maintain event governance, evidence confidence and scoring. | Emit document issue, acceptance, payment, delivery and correction evidence. |
| Entitlements | Maintain product, bundle, capacity, Balance, Assurance and sponsorship access. | Enforce document capabilities consistently across every entry point. |

---

# 4. Product Definition and Positioning

Ascend Documents is the simple, connected business-document system that helps African businesses formalise commercial activity, move customers toward approval or payment and preserve reliable transaction evidence.

It is not:

- A generic file-storage product
- A full enterprise document-management suite
- A legal-advice platform
- A replacement for professional accounting or audit
- A standalone invoicing silo
- A tool that rewards document volume without verified outcomes
- A system that lets users silently rewrite issued records

> **Positioning statement**
>
> Create the document. Move the transaction forward. Preserve the evidence.

---

# 5. Vision, Promise and Desired Outcomes

## 5.1 Vision

Every African business should be able to communicate, formalise and prove commercial transactions professionally without needing specialist software knowledge.

## 5.2 Product promise

Create a professional document in minutes, share it through the channel the customer already uses, track what happens next and keep the commercial record connected to the rest of the business.

## 5.3 Desired outcomes

- Faster document creation
- Fewer repeated entries and calculation errors
- Higher quotation acceptance
- Faster invoice collection
- Stronger receivables visibility
- More consistent customer and supplier records
- Reliable correction and audit history
- Better owner and accountant oversight
- Stronger evidence for reporting and readiness
- Natural cross-sell into POS, Shop, Services, Office and Readiness

---

# 6. Goals, Non-Goals and Product Principles

## 6.1 Goals

1. Make professional commercial documents accessible to small businesses.
2. Allow Documents to work independently and as a shared platform capability.
3. Reduce document creation to the smallest reasonable number of steps.
4. Preserve the full transaction and correction history.
5. Connect documents to customers, products, payments, orders, bookings and projects.
6. Help businesses collect and reconcile payments.
7. Support WhatsApp-first and mobile-first usage.
8. Build evidence from outcomes rather than document volume.
9. Provide clear paid value without forcing basic documents behind monthly subscriptions.
10. Support Ghana-first deployment and later country localisation.

## 6.2 Non-goals

Ascend Documents will not initially:

- Replace a lawyer
- Certify every agreement as legally sufficient
- Produce statutory accounts without approved accounting processes
- Guarantee customer payment
- Provide unrestricted editing of issued documents
- Become a general cloud-drive replacement
- Create separate customers or payments from other product sets
- Automatically expose private documents to institutions
- Let businesses pay for stronger readiness scores
- Support every specialised industry document in the MVP

## 6.3 Product principles

- **Create once, reuse everywhere**
- **Plain language before accounting terminology**
- **Mobile actions, web depth**
- **Issued means preserved**
- **Corrections must be traceable**
- **The document must move the transaction**
- **Basic documentation should remain accessible**
- **Customer consent and privacy are mandatory**
- **Evidence quality is more important than document quantity**
- **Shared capabilities must not be charged twice**

---

# 7. Target Business Archetypes

Ascend Documents should serve:

- Retailers
- Online sellers
- Service providers
- Consultants
- Contractors
- Artisans
- Creative businesses
- Professional firms
- Training businesses
- Repair and maintenance businesses
- Distributors
- Small manufacturers
- Restaurants and hospitality businesses
- Salons and beauty businesses
- Multi-location SMEs
- Institution-supported SME cohorts

---

# 8. Personas, Roles and Permissions

## 8.1 Business owner

Needs to create, approve, send, track, collect and report on documents across the business.

## 8.2 Manager

Needs to create and approve documents within assigned limits, locations and workflows.

## 8.3 Sales or service staff

Needs to create permitted quotes, invoices, receipts or job records from assigned work.

## 8.4 Accountant or finance officer

Needs receivables, payment allocation, statements, correction controls, exports and audit history.

## 8.5 Procurement officer

Needs supplier requests, purchase orders, receiving records and approval history.

## 8.6 External accountant

Needs controlled, time-bound access to approved financial documents and reports.

## 8.7 Customer

Needs to open, download, accept, reject, request changes, sign and pay.

## 8.8 Supplier

Needs to receive purchase orders, confirm supply and provide supporting documents.

## 8.9 Institutional partner

May receive consented reports or sponsored programme outputs, not unrestricted document access.

---

# 9. Product Scope and Release Model

## MVP

- Core business identity
- Customer and supplier records
- Quotations
- Proformas
- Invoices
- Receipts
- Credit notes
- Basic purchase orders
- PDF and print
- WhatsApp, email and secure-link sharing
- Manual and integrated payment recording
- Part payments and balances
- Basic document conversion
- Issued-version preservation
- Basic reports
- Business Web and Mobile
- Customer secure web
- POS, Shop and Services generation
- Business Evidence events

## Next

- Recurring invoices
- Automated reminders
- Customer document history
- Electronic acceptance and signatures
- Delivery notes
- Job cards
- Service agreements
- Supplier workflows
- Accountant access
- Customer Mobile document wallet
- Advanced statements
- Institutional co-branding
- Verified reports

## Later

- Advanced contract templates
- Bulk document generation
- Advanced workflow automation
- Country-specific fiscal integrations
- Advanced e-signature providers
- Partner APIs
- Advanced document intelligence
- Cross-business customer document wallet
- Sector-specific document libraries

---

# 10. Product Surfaces and Channel Experience

## 10.1 Ascend Business Web

The complete document administration experience.

Owners and authorised users can:

- Create and edit drafts
- Manage customers and suppliers
- Use advanced templates
- Convert documents
- Configure numbering
- Manage branding
- Review receivables
- Allocate payments
- Run statements
- Approve documents
- Review corrections and audit
- Export reports
- Configure automation
- Manage accountant access

## 10.2 Ascend Business Mobile

The daily action experience.

Owners and authorised users can:

- Create a simple quote, invoice or receipt
- Record a payment
- Share through WhatsApp
- Approve or reject a draft
- View overdue balances
- Send reminders
- Search customer documents
- Review document status
- Open supporting evidence

## 10.3 Ascend POS Terminal Mode

Authorised terminal users can:

- Issue receipts
- Create tax or commercial invoices where configured
- Reprint permitted documents
- process approved returns
- generate credit or refund records
- send digital receipts
- operate within shift and terminal permissions

## 10.4 Ascend Customer Web

Customers can:

- Open documents through secure links
- Download PDFs
- Accept or reject quotations
- Request changes
- Pay invoices
- Sign approved agreements
- View balances and payment status
- Download receipts
- Access statements where permitted

## 10.5 Ascend Customer Mobile

Repeat customers can:

- Store and organise documents across Ascend businesses
- Receive reminders
- Pay balances
- View transaction history
- Accept documents
- Access receipts and agreements
- manage communication preferences

---

# 11. Information Architecture and Navigation

Business-facing navigation:

1. Overview
2. Create
3. Quotations
4. Invoices
5. Receipts
6. Payments
7. Customers
8. Suppliers
9. Statements
10. Agreements
11. Purchase Documents
12. Templates
13. Reports
14. Approvals
15. Settings

Customer-facing navigation:

1. Document
2. Actions
3. Payment
4. History
5. Related Documents
6. Download
7. Support

---

# 12. Connected Platform and Zero-Silo Requirements

Ascend Documents must use shared identifiers and shared records across every product set.

A Shop order must not create a second customer.  
A POS receipt must not create a separate payment ledger.  
A Services quotation must remain linked to the booking or request.  
An Office purchase order must remain linked to the approval and supplier.  
A correction must update evidence without deleting history.

---

# 13. End-to-End Document Journeys

## 13.1 Standalone invoice

1. User selects customer.
2. User selects catalogue items or enters permitted custom lines.
3. System calculates totals.
4. User reviews payment terms.
5. User issues the invoice.
6. System assigns number and preserves the issued version.
7. User shares by WhatsApp, email, secure link or PDF.
8. Customer views and pays.
9. Payment is allocated.
10. Receipt is generated.
11. Financial and evidence events are recorded.

## 13.2 Quote to payment

1. Merchant creates quotation.
2. Customer accepts or requests changes.
3. Merchant revises through a controlled draft.
4. Accepted quotation converts to proforma or invoice.
5. Deposit or full payment is collected.
6. Delivery or service completion is recorded.
7. Final receipt or completion document is issued.
8. Related records remain connected.

## 13.3 POS sale to receipt

1. Cashier completes sale.
2. Payment is recorded.
3. Receipt is generated automatically.
4. Customer receives print or digital version.
5. Owner and accountant can retrieve the same record.
6. Return or correction uses a linked reversal document.

## 13.4 Shop order to invoice and receipt

1. Customer places order.
2. Shop creates order confirmation.
3. Invoice or payment request is issued where required.
4. Payment is confirmed.
5. Receipt is generated.
6. Delivery note is generated where required.
7. Refund or credit record remains connected to the original order.

## 13.5 Services quote to completion

1. Customer requests service.
2. Merchant issues quotation.
3. Customer accepts.
4. Agreement or job card is generated where required.
5. Deposit is collected.
6. Service is completed.
7. Final invoice and receipt are issued.
8. Completion evidence is recorded.

## 13.6 Office procurement

1. Staff submits purchase request.
2. Approval is completed.
3. Purchase order is generated.
4. Supplier confirms.
5. Goods or services are received.
6. Inventory or expense records update.
7. Supplier payment is allocated.
8. Evidence and audit history remain connected.

---

# 14. Document Taxonomy

Supported document families:

- Sales documents
- Payment documents
- Correction documents
- Purchase documents
- Delivery and fulfilment documents
- Service and job documents
- Agreements and acceptance records
- Statements and summaries
- Supporting and uploaded documents
- Institution-specific outputs

---

# 15. Document Lifecycle and Status Model

Common draft and issue states:

- Draft
- Pending approval
- Approved
- Issued
- Sent
- Delivered
- Viewed
- Accepted
- Rejected
- Change requested
- Partially paid
- Paid
- Overdue
- Cancelled
- Superseded
- Credited
- Refunded
- Expired
- Archived

A document type may use only the relevant subset.

---

# 16. Core Requirements Catalogue

The following requirements are normative unless explicitly marked for a later release.

### 16.1 Master and zero-silo requirements

| ID | Requirement |
|---|---|
| DOC-MST-001 | Ascend Documents shall inherit the AscendSME Connected Platform Master PRD v2.0. |
| DOC-MST-002 | Documents shall use the shared business identity rather than create a document-only business record. |
| DOC-MST-003 | Documents shall use shared customer and supplier identities. |
| DOC-MST-004 | Documents shall use shared catalogue items where available. |
| DOC-MST-005 | Documents shall use shared payment and financial records. |
| DOC-MST-006 | Documents shall use shared staff, role and permission records. |
| DOC-MST-007 | Documents shall emit events to the shared Business Event Engine. |
| DOC-MST-008 | Documents shall contribute evidence through the shared Business Evidence Ledger. |
| DOC-MST-009 | Documents shall operate as a standalone product and an embedded platform capability. |
| DOC-MST-010 | A document created from another product set shall preserve its originating transaction reference. |
| DOC-MST-011 | A document opened through another product set shall preserve the same identifier and status. |
| DOC-MST-012 | The same issued document shall not be duplicated across product sets. |
| DOC-MST-013 | Shared capabilities shall not be charged twice through separate product packages. |
| DOC-MST-014 | Cross-set document actions shall use the same authorization rules. |
| DOC-MST-015 | A product-set interface may simplify document actions without changing the underlying document model. |
| DOC-MST-016 | Any conflict with the Master PRD shall require an approved product-governance decision. |
| DOC-MST-017 | Documents shall use shared country, currency, language and location configuration. |
| DOC-MST-018 | Documents shall support one business operating through multiple locations without duplicate document systems. |
| DOC-MST-019 | Document records shall remain portable across Business Web and Mobile. |
| DOC-MST-020 | Customer-facing document access shall use the shared customer and consent foundation. |

### 16.2 Channel and experience requirements

| ID | Requirement |
|---|---|
| DOC-CHN-001 | Business Web shall provide the complete document-management experience. |
| DOC-CHN-002 | Business Mobile shall provide quick creation, approval, payment and follow-up actions. |
| DOC-CHN-003 | Customer Web shall allow secure document access without mandatory app installation. |
| DOC-CHN-004 | Customer Mobile shall provide persistent document history for signed-in customers. |
| DOC-CHN-005 | POS Terminal Mode shall expose only permitted transaction-document actions. |
| DOC-CHN-006 | All channels shall show consistent document totals and status. |
| DOC-CHN-007 | A change made on one channel shall synchronize to the other authorized channels. |
| DOC-CHN-008 | Mobile shall prioritize action and exceptions rather than reproduce every web setting. |
| DOC-CHN-009 | Business Web shall support bulk work and detailed reporting. |
| DOC-CHN-010 | Customer Web pages shall be responsive and low-bandwidth aware. |
| DOC-CHN-011 | Business Mobile shall support camera-based attachment capture. |
| DOC-CHN-012 | Business Mobile shall allow WhatsApp sharing through approved platform mechanisms. |
| DOC-CHN-013 | Customer actions shall update the same document state visible to the business. |
| DOC-CHN-014 | Channels shall display data-freshness or pending-sync indicators where necessary. |
| DOC-CHN-015 | Role and entitlement restrictions shall remain consistent across channels. |

### 16.3 Navigation and information architecture requirements

| ID | Requirement |
|---|---|
| DOC-IA-001 | The primary document navigation shall separate creation, active work, payments, customers and settings. |
| DOC-IA-002 | The home view shall prioritize actions such as overdue balances, approvals and recently viewed documents. |
| DOC-IA-003 | The system shall provide document-type filters. |
| DOC-IA-004 | The system shall provide status filters. |
| DOC-IA-005 | The system shall provide customer and supplier filters. |
| DOC-IA-006 | The system shall provide date and location filters. |
| DOC-IA-007 | The system shall provide a global document search. |
| DOC-IA-008 | The system shall support saved views on Business Web. |
| DOC-IA-009 | The system shall support recent documents on Business Mobile. |
| DOC-IA-010 | The system shall provide a single Create action with relevant document types. |
| DOC-IA-011 | The system shall not require users to understand internal document-family terminology. |
| DOC-IA-012 | The system shall show related documents from each document detail page. |
| DOC-IA-013 | The system shall show payment status prominently on payment-bearing documents. |
| DOC-IA-014 | The system shall show correction and supersession status prominently. |
| DOC-IA-015 | The system shall preserve clear back-navigation from embedded product-set flows. |

### 16.4 Document creation entry-point requirements

| ID | Requirement |
|---|---|
| DOC-CRT-001 | The user shall be able to create a document from the Documents home. |
| DOC-CRT-002 | The user shall be able to create a document from a customer record. |
| DOC-CRT-003 | The user shall be able to create a document from a supplier record. |
| DOC-CRT-004 | The user shall be able to create a document from a catalogue item. |
| DOC-CRT-005 | The user shall be able to create a receipt from a POS sale. |
| DOC-CRT-006 | The user shall be able to create an invoice or receipt from a Shop order. |
| DOC-CRT-007 | The user shall be able to create a quotation, agreement, invoice or job card from a Services request. |
| DOC-CRT-008 | The user shall be able to create a project invoice or purchase order from Office. |
| DOC-CRT-009 | The user shall be able to duplicate a permitted prior document. |
| DOC-CRT-010 | The user shall be able to convert a compatible document. |
| DOC-CRT-011 | The user shall be able to create from an approved template. |
| DOC-CRT-012 | The system shall prefill available customer, catalogue, pricing and transaction information. |
| DOC-CRT-013 | The system shall prevent duplicate document creation from repeated requests. |
| DOC-CRT-014 | The system shall warn when an equivalent document already exists for the transaction. |
| DOC-CRT-015 | The system shall allow a standalone document without another AscendSME product set. |
| DOC-CRT-016 | The system shall preserve source context when a draft is saved and resumed. |
| DOC-CRT-017 | The system shall support assisted creation by an authorized Account Manager. |
| DOC-CRT-018 | The system shall record who initiated creation and through which channel. |
| DOC-CRT-019 | The system shall apply entitlements before offering a paid document capability. |
| DOC-CRT-020 | The system shall support approved imports from legacy document data. |

### 16.5 Responsive document-builder requirements

| ID | Requirement |
|---|---|
| DOC-BLD-001 | The builder shall support wide desktop and tablet layouts. |
| DOC-BLD-002 | The builder shall support compact mobile layouts. |
| DOC-BLD-003 | Wide layouts shall support a form-and-preview split view where practical. |
| DOC-BLD-004 | Compact layouts shall use a sequential creation flow. |
| DOC-BLD-005 | Compact layouts shall keep the document total visible during line-item editing. |
| DOC-BLD-006 | The builder shall autosave drafts. |
| DOC-BLD-007 | The builder shall show autosave and offline state. |
| DOC-BLD-008 | The builder shall validate required fields before issue. |
| DOC-BLD-009 | The builder shall distinguish draft editing from issued-document correction. |
| DOC-BLD-010 | The builder shall allow line-item reordering. |
| DOC-BLD-011 | The builder shall support quantity, unit, rate, discount and tax entry. |
| DOC-BLD-012 | The builder shall provide plain-language explanations for payment terms. |
| DOC-BLD-013 | The builder shall allow notes, terms and payment instructions. |
| DOC-BLD-014 | The builder shall preview the customer-facing output. |
| DOC-BLD-015 | The builder shall prevent totals from being edited independently of line items except through approved adjustments. |
| DOC-BLD-016 | The builder shall support keyboard navigation on Business Web. |
| DOC-BLD-017 | The builder shall support touch-friendly controls on mobile. |
| DOC-BLD-018 | The builder shall support low-literacy labels and examples. |
| DOC-BLD-019 | The builder shall warn before leaving with unsaved changes. |
| DOC-BLD-020 | The builder shall maintain consistent calculations across all supported screen sizes. |

### 16.6 Business identity and issuer requirements

| ID | Requirement |
|---|---|
| DOC-BIZ-001 | Every issued document shall reference the shared business identity. |
| DOC-BIZ-002 | The system shall support trading and legal names where configured. |
| DOC-BIZ-003 | The system shall support location-specific issuer information. |
| DOC-BIZ-004 | The system shall support business address, contact, email and website fields. |
| DOC-BIZ-005 | The system shall support market-specific registration and tax identifiers. |
| DOC-BIZ-006 | The system shall not present unverified identity information as verified. |
| DOC-BIZ-007 | The system shall support business logo and approved brand settings. |
| DOC-BIZ-008 | The system shall support payment instructions by business or location. |
| DOC-BIZ-009 | The system shall support authorized signatory information. |
| DOC-BIZ-010 | The system shall preserve the issuer identity used at the time of issue. |
| DOC-BIZ-011 | Later changes to the business profile shall not silently rewrite issued documents. |
| DOC-BIZ-012 | The system shall support business identity completeness warnings. |
| DOC-BIZ-013 | The system shall support institution-sponsored co-branding without replacing the merchant identity. |
| DOC-BIZ-014 | The system shall prevent staff from changing issuer identity without permission. |
| DOC-BIZ-015 | The system shall maintain audit history for issuer-setting changes. |

### 16.7 Customer, supplier and commercial-party requirements

| ID | Requirement |
|---|---|
| DOC-PTY-001 | The system shall use the shared customer and party records. |
| DOC-PTY-002 | A recipient may be a person, business, institution or supplier. |
| DOC-PTY-003 | The system shall support bill-to and ship-to contacts. |
| DOC-PTY-004 | The system shall support multiple contacts for an organization. |
| DOC-PTY-005 | The system shall support authorized signatories. |
| DOC-PTY-006 | The system shall support customer tax or registration details where relevant. |
| DOC-PTY-007 | The system shall prevent unnecessary duplicate customers. |
| DOC-PTY-008 | The system shall suggest likely duplicate parties. |
| DOC-PTY-009 | The system shall allow a one-time recipient subject to business policy. |
| DOC-PTY-010 | The system shall preserve the recipient details used on an issued document. |
| DOC-PTY-011 | Later party updates shall not silently rewrite issued documents. |
| DOC-PTY-012 | The system shall support consent and communication preferences. |
| DOC-PTY-013 | The system shall support customer and supplier statements. |
| DOC-PTY-014 | The system shall support customer credit and payment terms from shared records. |
| DOC-PTY-015 | The system shall restrict access to sensitive party data by role. |
| DOC-PTY-016 | The system shall support party merge through an auditable workflow. |
| DOC-PTY-017 | The system shall preserve transaction history after an approved merge. |
| DOC-PTY-018 | The system shall support party search by name, phone, email and identifier. |
| DOC-PTY-019 | The system shall allow importing approved customer and supplier lists. |
| DOC-PTY-020 | The system shall show related documents from the party record. |

### 16.8 Catalogue and line-item requirements

| ID | Requirement |
|---|---|
| DOC-LIN-001 | The system shall allow selecting products and services from the shared Catalogue. |
| DOC-LIN-002 | The system shall allow permitted custom line items. |
| DOC-LIN-003 | The system shall support quantity and unit of measure. |
| DOC-LIN-004 | The system shall support product or service descriptions. |
| DOC-LIN-005 | The system shall support variants. |
| DOC-LIN-006 | The system shall support line-specific pricing. |
| DOC-LIN-007 | The system shall support line-specific discounts. |
| DOC-LIN-008 | The system shall support line-specific tax configuration. |
| DOC-LIN-009 | The system shall support non-inventory items. |
| DOC-LIN-010 | The system shall support deposits and milestone lines. |
| DOC-LIN-011 | The system shall support fees, delivery and other approved charges. |
| DOC-LIN-012 | The system shall preserve line-item values at issue time. |
| DOC-LIN-013 | Catalogue price changes shall not silently alter issued documents. |
| DOC-LIN-014 | The system shall support custom ordering of line items. |
| DOC-LIN-015 | The system shall support line-item notes. |
| DOC-LIN-016 | The system shall support item codes and SKUs where available. |
| DOC-LIN-017 | The system shall support negative correction lines only through approved document types. |
| DOC-LIN-018 | The system shall validate quantity and monetary precision. |
| DOC-LIN-019 | The system shall support price-inclusive and price-exclusive tax display. |
| DOC-LIN-020 | The system shall support importing line items from related transactions. |

### 16.9 Calculation, tax, discount and currency requirements

| ID | Requirement |
|---|---|
| DOC-CAL-001 | The system shall calculate subtotals from document line items. |
| DOC-CAL-002 | The system shall support document-level discounts. |
| DOC-CAL-003 | The system shall support line-level discounts. |
| DOC-CAL-004 | The system shall support percentage and fixed discounts. |
| DOC-CAL-005 | The system shall support configured taxes and levies. |
| DOC-CAL-006 | The system shall support inclusive and exclusive tax modes. |
| DOC-CAL-007 | The system shall show tax breakdowns clearly. |
| DOC-CAL-008 | The system shall support additional approved charges. |
| DOC-CAL-009 | The system shall support rounding rules by currency and market. |
| DOC-CAL-010 | The system shall preserve calculation inputs and outputs at issue time. |
| DOC-CAL-011 | The system shall prevent unauthorized manual total overrides. |
| DOC-CAL-012 | The system shall support multi-currency documents where enabled. |
| DOC-CAL-013 | The system shall store the document currency explicitly. |
| DOC-CAL-014 | The system shall support exchange-rate reference information where configured. |
| DOC-CAL-015 | The system shall not imply statutory tax compliance without approved market configuration. |
| DOC-CAL-016 | The system shall support tax-exempt or zero-rated treatment where configured. |
| DOC-CAL-017 | The system shall support withholding information where approved. |
| DOC-CAL-018 | The system shall support discount-approval thresholds. |
| DOC-CAL-019 | The system shall recalculate totals immediately when inputs change. |
| DOC-CAL-020 | The system shall test calculations consistently across web, mobile and generated PDFs. |

### 16.10 Document numbering and identity requirements

| ID | Requirement |
|---|---|
| DOC-NUM-001 | Every issued document shall receive a unique business-aware number. |
| DOC-NUM-002 | Drafts may use temporary identifiers. |
| DOC-NUM-003 | The system shall support document-type prefixes. |
| DOC-NUM-004 | The system shall support location-specific numbering where approved. |
| DOC-NUM-005 | The system shall support configurable starting values. |
| DOC-NUM-006 | The system shall prevent duplicate issued numbers. |
| DOC-NUM-007 | The system shall preserve numbering gaps where a draft is cancelled if required by configuration. |
| DOC-NUM-008 | The system shall not silently reuse cancelled issued numbers. |
| DOC-NUM-009 | The system shall support market-specific numbering rules. |
| DOC-NUM-010 | The system shall record the numbering rule used. |
| DOC-NUM-011 | The system shall support human-readable and system identifiers. |
| DOC-NUM-012 | External references shall not replace internal document identity. |
| DOC-NUM-013 | Related documents shall preserve their own unique numbers. |
| DOC-NUM-014 | The system shall show source and converted document numbers. |
| DOC-NUM-015 | Numbering changes shall require authorized access and audit history. |

### 16.11 Template and branding requirements

| ID | Requirement |
|---|---|
| DOC-TPL-001 | The system shall provide standard mobile-readable document templates. |
| DOC-TPL-002 | The system shall support business logo placement. |
| DOC-TPL-003 | The system shall support approved brand colours. |
| DOC-TPL-004 | The system shall support business contact and payment details. |
| DOC-TPL-005 | The system shall support signature and stamp images where permitted. |
| DOC-TPL-006 | The system shall support standard footer notes. |
| DOC-TPL-007 | The system shall support reusable terms and conditions. |
| DOC-TPL-008 | The system shall support document-type templates. |
| DOC-TPL-009 | The system shall support location-specific templates. |
| DOC-TPL-010 | The system shall preview templates before issue. |
| DOC-TPL-011 | The system shall preserve the rendered template version for issued documents. |
| DOC-TPL-012 | The system shall support premium templates through entitlements. |
| DOC-TPL-013 | The system shall support AscendSME branding removal through approved packages. |
| DOC-TPL-014 | The system shall support institutional co-branding. |
| DOC-TPL-015 | Co-branding shall not obscure the merchant as issuer. |
| DOC-TPL-016 | Templates shall remain legible on mobile screens and printed pages. |
| DOC-TPL-017 | Templates shall meet accessibility and contrast standards. |
| DOC-TPL-018 | The system shall support market-specific paper sizes. |
| DOC-TPL-019 | The system shall prevent unauthorized template-code injection. |
| DOC-TPL-020 | The system shall maintain template version history. |

### 16.12 Lifecycle and status requirements

| ID | Requirement |
|---|---|
| DOC-LIF-001 | Every document shall have a defined lifecycle. |
| DOC-LIF-002 | Draft documents shall remain editable by authorized users. |
| DOC-LIF-003 | Pending-approval documents shall restrict unauthorized issue. |
| DOC-LIF-004 | Approved documents shall retain approval history. |
| DOC-LIF-005 | Issued documents shall become immutable except through controlled correction. |
| DOC-LIF-006 | Sent status shall record the selected delivery channel. |
| DOC-LIF-007 | Delivered status shall be used only when supported by the channel. |
| DOC-LIF-008 | Viewed status shall be used only when a secure link is opened or equivalent evidence exists. |
| DOC-LIF-009 | Accepted and rejected statuses shall preserve customer action evidence. |
| DOC-LIF-010 | Change-requested status shall preserve customer comments. |
| DOC-LIF-011 | Payment-bearing documents shall support unpaid, partially paid and paid states. |
| DOC-LIF-012 | Overdue status shall follow the due date and configured grace rules. |
| DOC-LIF-013 | Cancelled status shall require a reason. |
| DOC-LIF-014 | Superseded status shall identify the replacement document. |
| DOC-LIF-015 | Credited status shall identify the related credit note. |
| DOC-LIF-016 | Refunded status shall identify the related payment reversal. |
| DOC-LIF-017 | Expired status shall apply to time-limited documents. |
| DOC-LIF-018 | Archived status shall not delete the record. |
| DOC-LIF-019 | Status transitions shall be validated by document type. |
| DOC-LIF-020 | Every status transition shall be auditable. |

### 16.13 Quotation, estimate and proforma requirements

| ID | Requirement |
|---|---|
| DOC-QTE-001 | The system shall support quotations. |
| DOC-QTE-002 | The system shall support estimates where market language requires distinction. |
| DOC-QTE-003 | The system shall support proforma invoices. |
| DOC-QTE-004 | A quotation shall support an expiry date. |
| DOC-QTE-005 | A quotation shall support customer acceptance. |
| DOC-QTE-006 | A quotation shall support customer rejection. |
| DOC-QTE-007 | A quotation shall support a change request. |
| DOC-QTE-008 | The system shall preserve each issued quotation version. |
| DOC-QTE-009 | A revised quotation shall reference the prior version. |
| DOC-QTE-010 | An accepted quotation shall be convertible to a proforma or invoice. |
| DOC-QTE-011 | The system shall prevent conversion from an expired quotation without authorized override. |
| DOC-QTE-012 | A proforma shall be clearly distinguished from a tax or final invoice. |
| DOC-QTE-013 | The system shall allow deposits to be requested from an accepted quotation. |
| DOC-QTE-014 | The system shall support service scope and deliverable notes. |
| DOC-QTE-015 | The system shall support milestone pricing. |
| DOC-QTE-016 | The system shall support optional and alternative line items where enabled. |
| DOC-QTE-017 | The system shall show acceptance date and actor. |
| DOC-QTE-018 | The system shall generate an evidence event for customer acceptance. |
| DOC-QTE-019 | The system shall allow internal approval before issue. |
| DOC-QTE-020 | The system shall report quotation acceptance and conversion rates. |

### 16.14 Invoice and payment-request requirements

| ID | Requirement |
|---|---|
| DOC-INV-001 | The system shall support standard invoices. |
| DOC-INV-002 | The system shall support deposit invoices or payment requests. |
| DOC-INV-003 | The system shall support milestone invoices. |
| DOC-INV-004 | The system shall support final-balance invoices. |
| DOC-INV-005 | The system shall support credit-sale invoices. |
| DOC-INV-006 | The system shall support due dates. |
| DOC-INV-007 | The system shall support payment terms. |
| DOC-INV-008 | The system shall support part payments. |
| DOC-INV-009 | The system shall support instalment schedules where enabled. |
| DOC-INV-010 | The system shall support recurring invoice schedules in a later release. |
| DOC-INV-011 | The system shall prevent recurring duplication through idempotent generation. |
| DOC-INV-012 | The system shall show amount due, amount paid and balance. |
| DOC-INV-013 | The system shall show approved payment methods. |
| DOC-INV-014 | The system shall support payment links. |
| DOC-INV-015 | The system shall support manual payment recording with evidence and permission. |
| DOC-INV-016 | The system shall support invoice cancellation through controlled rules. |
| DOC-INV-017 | The system shall support credit-note correction. |
| DOC-INV-018 | The system shall not silently reduce an issued invoice total. |
| DOC-INV-019 | The system shall generate receivable and financial events. |
| DOC-INV-020 | The system shall report overdue and collection performance. |

### 16.15 Receipt requirements

| ID | Requirement |
|---|---|
| DOC-RCT-001 | The system shall support receipts generated from verified payments. |
| DOC-RCT-002 | The system shall support receipts for cash payments. |
| DOC-RCT-003 | The system shall support receipts for Mobile Money, card, bank transfer and approved methods. |
| DOC-RCT-004 | The receipt shall identify the related invoice or transaction where applicable. |
| DOC-RCT-005 | The receipt shall show payment date, amount and method. |
| DOC-RCT-006 | The receipt shall show allocated and unallocated amounts where relevant. |
| DOC-RCT-007 | The system shall support one receipt covering several permitted obligations. |
| DOC-RCT-008 | The system shall support several receipts against one invoice. |
| DOC-RCT-009 | The system shall prevent duplicate receipts for one payment allocation. |
| DOC-RCT-010 | The system shall support POS print receipts. |
| DOC-RCT-011 | The system shall support digital receipts. |
| DOC-RCT-012 | The system shall support reprint with visible copy status where configured. |
| DOC-RCT-013 | The system shall preserve the original receipt number. |
| DOC-RCT-014 | Receipt corrections shall use reversal or replacement workflows. |
| DOC-RCT-015 | The system shall show payment verification confidence. |
| DOC-RCT-016 | The system shall not present unverified merchant claims as verified digital payment. |
| DOC-RCT-017 | The system shall support customer receipt history. |
| DOC-RCT-018 | The system shall emit payment and receipt evidence events. |
| DOC-RCT-019 | The system shall support receipt export. |
| DOC-RCT-020 | The system shall support location and cashier attribution. |

### 16.16 Credit note, refund and reversal requirements

| ID | Requirement |
|---|---|
| DOC-CRE-001 | The system shall support credit notes. |
| DOC-CRE-002 | A credit note shall reference the original invoice or transaction. |
| DOC-CRE-003 | A credit note shall require a reason. |
| DOC-CRE-004 | The system shall support full and partial credit. |
| DOC-CRE-005 | The system shall support refund records. |
| DOC-CRE-006 | A refund record shall reference the original payment. |
| DOC-CRE-007 | The system shall distinguish credit from cash refund. |
| DOC-CRE-008 | The system shall prevent credit beyond the eligible amount without authorized override. |
| DOC-CRE-009 | The system shall update customer balances after credit. |
| DOC-CRE-010 | The system shall update financial and evidence events after credit or refund. |
| DOC-CRE-011 | The system shall preserve the original issued document. |
| DOC-CRE-012 | The system shall support return-related credit from POS and Shop. |
| DOC-CRE-013 | The system shall support service-adjustment credit. |
| DOC-CRE-014 | The system shall support approval thresholds. |
| DOC-CRE-015 | The system shall show refund method and status. |
| DOC-CRE-016 | The system shall support failed and reversed refund states. |
| DOC-CRE-017 | The system shall prevent duplicate refund records. |
| DOC-CRE-018 | The system shall support customer notification. |
| DOC-CRE-019 | The system shall preserve operator and approver identity. |
| DOC-CRE-020 | The system shall report credit and refund volume. |

### 16.17 Purchase and supplier-document requirements

| ID | Requirement |
|---|---|
| DOC-PUR-001 | The system shall support purchase orders. |
| DOC-PUR-002 | Purchase orders shall use shared supplier records. |
| DOC-PUR-003 | Purchase orders shall support products, services and custom lines. |
| DOC-PUR-004 | Purchase orders shall support delivery locations. |
| DOC-PUR-005 | Purchase orders shall support approval before issue. |
| DOC-PUR-006 | Purchase orders shall support supplier acknowledgement where enabled. |
| DOC-PUR-007 | Purchase orders shall support partial receipt. |
| DOC-PUR-008 | Purchase orders shall connect to goods or service receipt records. |
| DOC-PUR-009 | Goods receipt shall update shared Inventory when applicable. |
| DOC-PUR-010 | Supplier invoices may be attached or recorded through approved workflows. |
| DOC-PUR-011 | Supplier payments shall use shared payment and financial records. |
| DOC-PUR-012 | The system shall preserve request, approval, order, receipt and payment relationships. |
| DOC-PUR-013 | The system shall support cancellation with reason. |
| DOC-PUR-014 | The system shall support purchase-order amendments through controlled versions. |
| DOC-PUR-015 | The system shall support delivery-date tracking. |
| DOC-PUR-016 | The system shall support supplier notes. |
| DOC-PUR-017 | The system shall support Office procurement integration. |
| DOC-PUR-018 | The system shall support supplier statements in a later release. |
| DOC-PUR-019 | The system shall emit procurement evidence events. |
| DOC-PUR-020 | The system shall report purchase commitments and outstanding receipts. |

### 16.18 Service, job and delivery-document requirements

| ID | Requirement |
|---|---|
| DOC-SRV-001 | The system shall support job cards. |
| DOC-SRV-002 | The system shall support service agreements. |
| DOC-SRV-003 | The system shall support delivery notes. |
| DOC-SRV-004 | The system shall support completion records. |
| DOC-SRV-005 | The system shall support handover records. |
| DOC-SRV-006 | Job cards shall reference the customer and service request. |
| DOC-SRV-007 | Job cards shall support assigned staff. |
| DOC-SRV-008 | Job cards shall support customer assets or equipment where applicable. |
| DOC-SRV-009 | Job cards shall support work notes and parts used. |
| DOC-SRV-010 | Delivery notes shall reference the related order or invoice. |
| DOC-SRV-011 | Delivery notes shall support partial delivery. |
| DOC-SRV-012 | Delivery notes shall support recipient confirmation. |
| DOC-SRV-013 | Completion records shall support customer confirmation. |
| DOC-SRV-014 | The system shall protect private staff notes from customer documents. |
| DOC-SRV-015 | The system shall support photo or file evidence where permitted. |
| DOC-SRV-016 | The system shall support field-service mobile completion. |
| DOC-SRV-017 | The system shall support offline capture for controlled field actions. |
| DOC-SRV-018 | The system shall emit delivery and completion evidence events. |
| DOC-SRV-019 | The system shall preserve the relationship to payments and final invoices. |
| DOC-SRV-020 | The system shall report incomplete and unconfirmed work. |

### 16.19 Agreement, acceptance and electronic-signature requirements

| ID | Requirement |
|---|---|
| DOC-AGR-001 | The system shall support reusable agreement templates. |
| DOC-AGR-002 | The system shall support customer acceptance through secure links. |
| DOC-AGR-003 | The system shall support rejection. |
| DOC-AGR-004 | The system shall support change requests. |
| DOC-AGR-005 | The system shall support simple electronic signature where legally and technically appropriate. |
| DOC-AGR-006 | The system shall record signer identity and available verification data. |
| DOC-AGR-007 | The system shall record signature timestamp. |
| DOC-AGR-008 | The system shall preserve the signed version. |
| DOC-AGR-009 | The system shall prevent modification after signature. |
| DOC-AGR-010 | Any amendment shall create a controlled new version. |
| DOC-AGR-011 | The system shall support multi-party signatures in a later release. |
| DOC-AGR-012 | The system shall support business countersignature. |
| DOC-AGR-013 | The system shall support expiry of unsigned agreements. |
| DOC-AGR-014 | The system shall show signature status. |
| DOC-AGR-015 | The system shall support third-party signature providers through approved integrations. |
| DOC-AGR-016 | The system shall not present a signature method as legally sufficient in every market without approved policy. |
| DOC-AGR-017 | The system shall maintain signature audit history. |
| DOC-AGR-018 | The system shall support customer download of the signed document. |
| DOC-AGR-019 | The system shall generate acceptance and signature evidence events. |
| DOC-AGR-020 | Electronic-signature actions may consume Ascend Balance or package entitlements. |

### 16.20 Conversion and document-relationship requirements

| ID | Requirement |
|---|---|
| DOC-CNV-001 | The system shall support controlled conversion between compatible document types. |
| DOC-CNV-002 | A quotation may convert to proforma or invoice. |
| DOC-CNV-003 | A proforma may convert to invoice. |
| DOC-CNV-004 | An invoice payment may generate a receipt. |
| DOC-CNV-005 | An invoice may generate a credit note. |
| DOC-CNV-006 | A Shop order may generate an invoice, receipt or delivery note. |
| DOC-CNV-007 | A POS sale may generate a receipt or invoice. |
| DOC-CNV-008 | A Services request may generate a quotation, agreement, invoice or job card. |
| DOC-CNV-009 | An Office approval may generate a purchase order. |
| DOC-CNV-010 | A project may generate milestone invoices. |
| DOC-CNV-011 | Conversion shall preserve the source document. |
| DOC-CNV-012 | Conversion shall copy only approved fields. |
| DOC-CNV-013 | The target document shall receive its own identity and number. |
| DOC-CNV-014 | The system shall prevent repeated duplicate conversion. |
| DOC-CNV-015 | The system shall show the relationship graph. |
| DOC-CNV-016 | The system shall support one-to-many relationships where valid. |
| DOC-CNV-017 | The system shall support many payments against one document. |
| DOC-CNV-018 | The system shall preserve correction and reversal relationships. |
| DOC-CNV-019 | The system shall expose related documents to authorized customer users. |
| DOC-CNV-020 | The relationship graph shall be available to audit and evidence processes. |

### 16.21 Sending, sharing and delivery-tracking requirements

| ID | Requirement |
|---|---|
| DOC-SND-001 | The system shall support WhatsApp sharing. |
| DOC-SND-002 | The system shall support email delivery. |
| DOC-SND-003 | The system shall support secure links. |
| DOC-SND-004 | The system shall support PDF download. |
| DOC-SND-005 | The system shall support printing. |
| DOC-SND-006 | The system shall support SMS links where enabled. |
| DOC-SND-007 | The system shall use the shared Messaging service. |
| DOC-SND-008 | The system shall preserve the document version sent. |
| DOC-SND-009 | The system shall record sender, channel and timestamp. |
| DOC-SND-010 | The system shall record delivery status where supported. |
| DOC-SND-011 | The system shall record secure-link views. |
| DOC-SND-012 | The system shall prevent public guessing of secure document links. |
| DOC-SND-013 | The system shall support link expiry and revocation. |
| DOC-SND-014 | The system shall support customer authentication for sensitive documents. |
| DOC-SND-015 | The system shall support resending without duplicating the document. |
| DOC-SND-016 | The system shall show failed-delivery status. |
| DOC-SND-017 | The system shall support approved message templates. |
| DOC-SND-018 | The system shall enforce consent and opt-out rules. |
| DOC-SND-019 | Variable-cost delivery may use Ascend Balance. |
| DOC-SND-020 | The system shall prevent staff from sharing documents they cannot access. |

### 16.22 Payment, deposit and reconciliation requirements

| ID | Requirement |
|---|---|
| DOC-PAY-001 | Payment-bearing documents shall connect to the shared Payments service. |
| DOC-PAY-002 | The system shall support cash, Mobile Money, card, bank transfer and approved methods. |
| DOC-PAY-003 | The system shall support integrated payment links. |
| DOC-PAY-004 | The system shall support manual payment recording with permission. |
| DOC-PAY-005 | Manual payment recording shall capture method, reference, date and evidence where required. |
| DOC-PAY-006 | The system shall distinguish pending, verified, failed, reversed and refunded payments. |
| DOC-PAY-007 | The system shall support deposits. |
| DOC-PAY-008 | The system shall support part payments. |
| DOC-PAY-009 | The system shall support payment allocation across permitted documents. |
| DOC-PAY-010 | The system shall prevent over-allocation without authorized handling. |
| DOC-PAY-011 | The system shall show unallocated customer credit where supported. |
| DOC-PAY-012 | The system shall update document balance after payment allocation. |
| DOC-PAY-013 | The system shall generate a receipt after eligible payment confirmation. |
| DOC-PAY-014 | The system shall support payment reconciliation. |
| DOC-PAY-015 | The system shall preserve payment-provider references. |
| DOC-PAY-016 | The system shall not expose sensitive payment credentials. |
| DOC-PAY-017 | The system shall update financial and evidence records. |
| DOC-PAY-018 | The system shall support location and staff attribution. |
| DOC-PAY-019 | The system shall support failed payment retry. |
| DOC-PAY-020 | The system shall report collection method and verification confidence. |

### 16.23 Receivables, reminders and collections requirements

| ID | Requirement |
|---|---|
| DOC-REC-001 | The system shall maintain receivable balances for eligible invoices. |
| DOC-REC-002 | The system shall show due and overdue documents. |
| DOC-REC-003 | The system shall support customer-level receivable summaries. |
| DOC-REC-004 | The system shall support aging buckets. |
| DOC-REC-005 | The system shall support manual reminders. |
| DOC-REC-006 | The system shall support automated reminders through paid or entitled automation. |
| DOC-REC-007 | The system shall support reminder schedules relative to due dates. |
| DOC-REC-008 | The system shall support WhatsApp, email, SMS and in-app channels where configured. |
| DOC-REC-009 | The system shall prevent reminders after full payment. |
| DOC-REC-010 | The system shall stop reminders after cancellation or approved dispute. |
| DOC-REC-011 | The system shall support reminder pause. |
| DOC-REC-012 | The system shall support staff assignment for collection follow-up. |
| DOC-REC-013 | The system shall record reminder delivery and response. |
| DOC-REC-014 | The system shall support customer payment promises as a later capability. |
| DOC-REC-015 | The system shall support statements. |
| DOC-REC-016 | Statements shall show opening balance, charges, credits, payments and closing balance. |
| DOC-REC-017 | The system shall support date-range statements. |
| DOC-REC-018 | The system shall support statement download and secure sharing. |
| DOC-REC-019 | The system shall report days to payment and overdue rates. |
| DOC-REC-020 | The system shall avoid abusive or excessive reminder frequency. |

### 16.24 Customer Web and Mobile requirements

| ID | Requirement |
|---|---|
| DOC-CUS-001 | Customers shall be able to open a document through a secure link. |
| DOC-CUS-002 | Customers shall not be required to install an app to view a document. |
| DOC-CUS-003 | Customers shall be able to download permitted documents. |
| DOC-CUS-004 | Customers shall be able to accept eligible documents. |
| DOC-CUS-005 | Customers shall be able to reject eligible documents. |
| DOC-CUS-006 | Customers shall be able to request changes. |
| DOC-CUS-007 | Customers shall be able to pay eligible documents. |
| DOC-CUS-008 | Customers shall be able to sign eligible agreements. |
| DOC-CUS-009 | Customers shall be able to view payment status. |
| DOC-CUS-010 | Customers shall be able to view related receipts. |
| DOC-CUS-011 | Customers shall be able to view permitted related documents. |
| DOC-CUS-012 | Customers shall be able to contact the merchant. |
| DOC-CUS-013 | Customer Mobile shall support cross-business document history for signed-in users. |
| DOC-CUS-014 | Customer Mobile shall support reminders and notification preferences. |
| DOC-CUS-015 | Customer Web shall remain mobile-first. |
| DOC-CUS-016 | Sensitive documents shall require appropriate authentication. |
| DOC-CUS-017 | Customer access shall respect business and customer consent. |
| DOC-CUS-018 | The system shall allow document access revocation where policy permits. |
| DOC-CUS-019 | The system shall preserve customer-action evidence. |
| DOC-CUS-020 | The system shall not expose internal notes, approvals or private evidence. |

### 16.25 My Briefcase and supporting-document requirements

| ID | Requirement |
|---|---|
| DOC-BRF-001 | Ascend Documents shall integrate with My Briefcase. |
| DOC-BRF-002 | Generated commercial documents shall remain distinct from uploaded supporting documents. |
| DOC-BRF-003 | The system shall allow authorized users to attach supporting documents. |
| DOC-BRF-004 | Supporting documents may include registration, licence, insurance, bank, supplier and project records. |
| DOC-BRF-005 | The system shall support expiry dates for eligible uploaded documents. |
| DOC-BRF-006 | The system shall support expiry alerts. |
| DOC-BRF-007 | The system shall support document categories. |
| DOC-BRF-008 | The system shall preserve source and uploader identity. |
| DOC-BRF-009 | The system shall support file-version history. |
| DOC-BRF-010 | The system shall support access restrictions. |
| DOC-BRF-011 | The system shall support consented use in Readiness. |
| DOC-BRF-012 | The system shall not treat an upload as verified without a verification process. |
| DOC-BRF-013 | The system shall support verification status. |
| DOC-BRF-014 | The system shall support linking supporting evidence to a transaction or report. |
| DOC-BRF-015 | The system shall support secure preview and download. |
| DOC-BRF-016 | The system shall scan uploads for malware. |
| DOC-BRF-017 | The system shall enforce file-size and format rules. |
| DOC-BRF-018 | The system shall support mobile camera capture. |
| DOC-BRF-019 | The system shall support institution-requested document checklists. |
| DOC-BRF-020 | The system shall preserve retention and deletion policies. |

### 16.26 Collaboration, approvals and accountant-access requirements

| ID | Requirement |
|---|---|
| DOC-COL-001 | The system shall support owner, manager, staff, finance and approver roles. |
| DOC-COL-002 | The system shall support document-type permissions. |
| DOC-COL-003 | The system shall support amount-based approval thresholds. |
| DOC-COL-004 | The system shall support location-based permissions. |
| DOC-COL-005 | The system shall support maker-checker workflows. |
| DOC-COL-006 | The system shall support draft submission for approval. |
| DOC-COL-007 | Approvers shall be able to approve, reject or request changes. |
| DOC-COL-008 | Approval decisions shall require comments where configured. |
| DOC-COL-009 | The system shall preserve approval history. |
| DOC-COL-010 | The system shall support temporary delegated approval. |
| DOC-COL-011 | The system shall support external accountant access. |
| DOC-COL-012 | External access shall be time-bound and revocable. |
| DOC-COL-013 | External accountants shall see only permitted businesses, locations and document classes. |
| DOC-COL-014 | The system shall support read-only accountant access. |
| DOC-COL-015 | The system shall support approved export access. |
| DOC-COL-016 | The system shall notify relevant users of pending approvals. |
| DOC-COL-017 | The system shall prevent self-approval where maker-checker is required. |
| DOC-COL-018 | The system shall prevent issue before required approval. |
| DOC-COL-019 | The system shall support bulk approval only for permitted low-risk cases. |
| DOC-COL-020 | The system shall audit every access and approval action. |

### 16.27 Version, correction, audit and retention requirements

| ID | Requirement |
|---|---|
| DOC-AUD-001 | Issued documents shall be immutable. |
| DOC-AUD-002 | The system shall preserve every issued version. |
| DOC-AUD-003 | Draft history shall be retained according to policy. |
| DOC-AUD-004 | Corrections shall use revision, replacement, cancellation, credit or reversal flows. |
| DOC-AUD-005 | The system shall require a correction reason. |
| DOC-AUD-006 | The system shall record the user and timestamp for every correction. |
| DOC-AUD-007 | The system shall preserve before-and-after values. |
| DOC-AUD-008 | The system shall show superseded status. |
| DOC-AUD-009 | The system shall link replacement documents. |
| DOC-AUD-010 | The system shall prevent deletion of records required for audit or retention. |
| DOC-AUD-011 | The system shall support archive without deletion. |
| DOC-AUD-012 | The system shall support retention rules by country and document type. |
| DOC-AUD-013 | The system shall support legal hold where required. |
| DOC-AUD-014 | The system shall support customer data deletion without corrupting required transaction records. |
| DOC-AUD-015 | The system shall support anonymisation where legally appropriate. |
| DOC-AUD-016 | The system shall preserve event and evidence history. |
| DOC-AUD-017 | The system shall record print and download actions where required. |
| DOC-AUD-018 | The system shall record internal administrative access. |
| DOC-AUD-019 | The system shall support audit export. |
| DOC-AUD-020 | The system shall protect audit history from unauthorized alteration. |

### 16.28 Offline, synchronization and recovery requirements

| ID | Requirement |
|---|---|
| DOC-OFF-001 | Business Mobile shall support offline draft creation for approved document types. |
| DOC-OFF-002 | POS Terminal Mode shall support offline receipt generation for eligible offline sales. |
| DOC-OFF-003 | The system shall show offline status. |
| DOC-OFF-004 | The system shall queue offline documents for synchronization. |
| DOC-OFF-005 | The system shall assign safe temporary identifiers offline. |
| DOC-OFF-006 | Final issue numbers shall be resolved without duplication. |
| DOC-OFF-007 | The system shall prevent repeated synchronization from creating duplicate documents. |
| DOC-OFF-008 | The system shall preserve local draft data through temporary connectivity loss. |
| DOC-OFF-009 | The system shall encrypt offline data. |
| DOC-OFF-010 | The system shall support retry and recovery. |
| DOC-OFF-011 | The system shall show synchronization failures. |
| DOC-OFF-012 | The system shall prevent false payment verification while offline. |
| DOC-OFF-013 | The system shall mark manually recorded offline payments according to confidence. |
| DOC-OFF-014 | The system shall reconcile status after reconnection. |
| DOC-OFF-015 | The system shall preserve the original action timestamp and synchronization timestamp. |
| DOC-OFF-016 | The system shall resolve conflicting draft edits through a controlled workflow. |
| DOC-OFF-017 | Issued-document conflicts shall not be silently merged. |
| DOC-OFF-018 | The system shall support device revocation. |
| DOC-OFF-019 | The system shall remove protected local data after authorized logout or revocation. |
| DOC-OFF-020 | The system shall monitor offline and synchronization failure rates. |

### 16.29 Search, organization and reporting requirements

| ID | Requirement |
|---|---|
| DOC-SRH-001 | The system shall support search by document number. |
| DOC-SRH-002 | The system shall support search by customer or supplier. |
| DOC-SRH-003 | The system shall support search by amount. |
| DOC-SRH-004 | The system shall support search by product or service. |
| DOC-SRH-005 | The system shall support search by payment reference. |
| DOC-SRH-006 | The system shall support date filtering. |
| DOC-SRH-007 | The system shall support status filtering. |
| DOC-SRH-008 | The system shall support location filtering. |
| DOC-SRH-009 | The system shall support document-type filtering. |
| DOC-SRH-010 | The system shall support tags or categories where appropriate. |
| DOC-SRH-011 | The system shall support recent and frequently used documents. |
| DOC-SRH-012 | The system shall support reports for issued documents. |
| DOC-SRH-013 | The system shall support quotation conversion reports. |
| DOC-SRH-014 | The system shall support receivables and aging reports. |
| DOC-SRH-015 | The system shall support payment and collection reports. |
| DOC-SRH-016 | The system shall support credit-note and refund reports. |
| DOC-SRH-017 | The system shall support customer and supplier statements. |
| DOC-SRH-018 | The system shall support location and staff attribution. |
| DOC-SRH-019 | The system shall support approved export formats. |
| DOC-SRH-020 | Reports shall state data freshness and scope. |

### 16.30 Business Evidence Ledger and Readiness requirements

| ID | Requirement |
|---|---|
| DOC-EVD-001 | Ascend Documents shall emit governed events to the Business Event Engine. |
| DOC-EVD-002 | Eligible events shall include draft created, document issued, sent, viewed, accepted, rejected, paid, delivered, corrected and cancelled. |
| DOC-EVD-003 | Document creation alone shall not automatically improve the Sustainability Score. |
| DOC-EVD-004 | Evidence strength shall increase when documents connect to verified payments, fulfilment or customer acceptance. |
| DOC-EVD-005 | The evidence event shall include business, location, actor, channel and related transaction. |
| DOC-EVD-006 | The evidence event shall include document type and identifier. |
| DOC-EVD-007 | The evidence event shall include verification and confidence level. |
| DOC-EVD-008 | The system shall reverse or amend evidence after cancellation, credit or refund. |
| DOC-EVD-009 | The system shall preserve the distinction between merchant-declared and system-verified activity. |
| DOC-EVD-010 | The system shall avoid double-counting one commercial outcome across several related documents. |
| DOC-EVD-011 | The system shall support business-archetype treatment. |
| DOC-EVD-012 | The system shall support evidence correction and appeal. |
| DOC-EVD-013 | Private document content shall not be exposed publicly through Readiness. |
| DOC-EVD-014 | Businesses shall control partner sharing through consent. |
| DOC-EVD-015 | The system shall support verified business reports. |
| DOC-EVD-016 | The system shall support evidence-linked receivables and payment summaries. |
| DOC-EVD-017 | The system shall support expired or outdated evidence treatment. |
| DOC-EVD-018 | Purchasing document features shall not improve score directly. |
| DOC-EVD-019 | The system shall preserve append-only evidence history. |
| DOC-EVD-020 | The system shall support institutional access only to approved reports and fields. |

### 16.31 Monetization and Ascend Balance requirements

| ID | Requirement |
|---|---|
| DOC-MON-001 | Basic quotations, invoices and receipts shall remain free or highly accessible. |
| DOC-MON-002 | AscendSME shall not rely primarily on compulsory monthly Documents subscriptions. |
| DOC-MON-003 | Paid value shall focus on branding, automation, signatures, payments, advanced collaboration, verification and reporting. |
| DOC-MON-004 | Variable-cost actions may use Ascend Balance. |
| DOC-MON-005 | Ascend Balance shall use one-to-one local-currency purchasing value. |
| DOC-MON-006 | The system shall show the cost before a paid action. |
| DOC-MON-007 | The system shall not create opaque document credits. |
| DOC-MON-008 | The system shall support a one-time Business Branding Pack. |
| DOC-MON-009 | The Branding Pack may include logo, colours, templates, footer, signature and numbering configuration. |
| DOC-MON-010 | The system shall support paid electronic signatures. |
| DOC-MON-011 | The system shall support paid automated reminders. |
| DOC-MON-012 | The system shall support paid SMS or WhatsApp delivery where variable costs apply. |
| DOC-MON-013 | The system shall support paid verified reports. |
| DOC-MON-014 | The system shall support payment-processing revenue where AscendSME participates lawfully. |
| DOC-MON-015 | The system shall support sponsored entitlements. |
| DOC-MON-016 | The system shall support institutional packages. |
| DOC-MON-017 | The system shall not charge for fixing a failed AscendSME process. |
| DOC-MON-018 | The system shall not charge businesses to access or export their historical records. |
| DOC-MON-019 | The system shall not sell a better readiness score. |
| DOC-MON-020 | All commercial actions shall use the shared Entitlement and Ascend Balance services. |

### 16.32 Bundles and entitlement requirements

| ID | Requirement |
|---|---|
| DOC-ENT-001 | Documents shall be available as a standalone entry product. |
| DOC-ENT-002 | Basic Documents shall be embedded in POS. |
| DOC-ENT-003 | Basic Documents shall be embedded in Shop. |
| DOC-ENT-004 | Basic Documents shall be embedded in Services. |
| DOC-ENT-005 | Basic Documents shall be available to Office workflows. |
| DOC-ENT-006 | The entitlement engine shall define document types and advanced capabilities. |
| DOC-ENT-007 | The system shall avoid charging a business twice for the same shared capability. |
| DOC-ENT-008 | The system shall support user, location and volume entitlements. |
| DOC-ENT-009 | The system shall support template entitlements. |
| DOC-ENT-010 | The system shall support signature entitlements. |
| DOC-ENT-011 | The system shall support automation entitlements. |
| DOC-ENT-012 | The system shall support accountant-access entitlements. |
| DOC-ENT-013 | The system shall support institutional sponsorship. |
| DOC-ENT-014 | The system shall support grace periods. |
| DOC-ENT-015 | The system shall preserve read and export access after entitlement expiry. |
| DOC-ENT-016 | The system shall not delete historical documents after Assurance expiry. |
| DOC-ENT-017 | The system shall show the reason a capability is unavailable. |
| DOC-ENT-018 | The system shall show the appropriate upgrade path. |
| DOC-ENT-019 | The system shall support country-specific packaging. |
| DOC-ENT-020 | The system shall maintain entitlement audit history. |

### 16.33 Institutional and sponsored-deployment requirements

| ID | Requirement |
|---|---|
| DOC-INS-001 | The system shall support institution-sponsored merchant access. |
| DOC-INS-002 | Institutions shall fund approved capabilities without owning merchant data. |
| DOC-INS-003 | Merchants shall consent to programme participation. |
| DOC-INS-004 | The system shall support programme-specific templates. |
| DOC-INS-005 | The system shall support sponsor co-branding. |
| DOC-INS-006 | Sponsor branding shall not replace merchant identity. |
| DOC-INS-007 | The system shall support programme document checklists. |
| DOC-INS-008 | The system shall support cohort reporting. |
| DOC-INS-009 | Cohort reports shall exclude unrelated merchant data. |
| DOC-INS-010 | The system shall support consented verified reports. |
| DOC-INS-011 | The system shall support programme dates and entitlement expiry. |
| DOC-INS-012 | The system shall support transition to merchant-funded access. |
| DOC-INS-013 | The system shall preserve merchant records after programme end. |
| DOC-INS-014 | The system shall support sponsored Ascend Balance. |
| DOC-INS-015 | Sponsored Balance shall have approved usage rules. |
| DOC-INS-016 | The system shall support partner APIs subject to consent and contract. |
| DOC-INS-017 | The system shall audit institutional access. |
| DOC-INS-018 | The system shall support revocation of institutional access. |
| DOC-INS-019 | The system shall support data-minimised exports. |
| DOC-INS-020 | The system shall prevent institutions from changing private readiness scores. |

### 16.34 Messaging and notification requirements

| ID | Requirement |
|---|---|
| DOC-MSG-001 | Ascend Documents shall use the shared Messaging service. |
| DOC-MSG-002 | The system shall notify customers when a document is issued. |
| DOC-MSG-003 | The system shall notify merchants when a customer views an eligible document. |
| DOC-MSG-004 | The system shall notify merchants of acceptance, rejection or change request. |
| DOC-MSG-005 | The system shall notify customers of payment confirmation. |
| DOC-MSG-006 | The system shall notify merchants of payment. |
| DOC-MSG-007 | The system shall support due-date reminders. |
| DOC-MSG-008 | The system shall support overdue reminders. |
| DOC-MSG-009 | The system shall support approval notifications. |
| DOC-MSG-010 | The system shall support correction and cancellation notifications. |
| DOC-MSG-011 | The system shall support in-app, email, WhatsApp and SMS according to configuration. |
| DOC-MSG-012 | The system shall distinguish transactional and marketing messages. |
| DOC-MSG-013 | The system shall enforce consent and opt-out. |
| DOC-MSG-014 | The system shall support message templates. |
| DOC-MSG-015 | The system shall preserve message-template versions. |
| DOC-MSG-016 | The system shall show delivery status. |
| DOC-MSG-017 | The system shall prevent duplicate notifications. |
| DOC-MSG-018 | The system shall support quiet hours and market timing. |
| DOC-MSG-019 | Variable-cost messages may use Ascend Balance. |
| DOC-MSG-020 | The system shall protect document content in notification previews. |

### 16.35 API, webhook and integration requirements

| ID | Requirement |
|---|---|
| DOC-API-001 | Ascend Documents shall expose approved internal APIs. |
| DOC-API-002 | APIs shall use shared identifiers. |
| DOC-API-003 | APIs shall enforce tenancy and permissions. |
| DOC-API-004 | APIs shall support document creation from approved product sets. |
| DOC-API-005 | APIs shall support status retrieval. |
| DOC-API-006 | APIs shall support payment allocation through shared services. |
| DOC-API-007 | APIs shall support customer-action callbacks. |
| DOC-API-008 | APIs shall support webhooks for issue, view, acceptance, payment and correction events. |
| DOC-API-009 | APIs shall be idempotent for creation and payment operations. |
| DOC-API-010 | APIs shall version breaking changes. |
| DOC-API-011 | APIs shall log access and failures. |
| DOC-API-012 | APIs shall apply rate limits. |
| DOC-API-013 | APIs shall not expose private document data publicly. |
| DOC-API-014 | The system shall support approved payment providers. |
| DOC-API-015 | The system shall support approved e-signature providers. |
| DOC-API-016 | The system shall support approved email and messaging providers. |
| DOC-API-017 | The system shall support accounting exports or integrations where approved. |
| DOC-API-018 | The system shall support partner reports subject to consent. |
| DOC-API-019 | The system shall support secure file-storage integration. |
| DOC-API-020 | The system shall emit canonical events to the Event Engine. |

### 16.36 Security, privacy, fraud and compliance requirements

| ID | Requirement |
|---|---|
| DOC-SEC-001 | The system shall enforce business tenancy isolation. |
| DOC-SEC-002 | The system shall enforce role-based permissions. |
| DOC-SEC-003 | The system shall enforce location scope. |
| DOC-SEC-004 | The system shall encrypt sensitive data in transit and at rest. |
| DOC-SEC-005 | The system shall protect secure links against guessing. |
| DOC-SEC-006 | The system shall support link expiry and revocation. |
| DOC-SEC-007 | The system shall support stronger authentication for high-risk actions. |
| DOC-SEC-008 | The system shall detect suspicious document creation and payment patterns. |
| DOC-SEC-009 | The system shall prevent unauthorized issued-document alteration. |
| DOC-SEC-010 | The system shall protect payment credentials. |
| DOC-SEC-011 | The system shall scan uploaded files for malware. |
| DOC-SEC-012 | The system shall restrict internal staff access by responsibility. |
| DOC-SEC-013 | The system shall log administrative access. |
| DOC-SEC-014 | The system shall support incident response. |
| DOC-SEC-015 | The system shall support data-retention rules. |
| DOC-SEC-016 | The system shall support data-access and correction requests. |
| DOC-SEC-017 | The system shall support deletion or anonymisation where legally appropriate. |
| DOC-SEC-018 | The system shall preserve required transaction and audit records. |
| DOC-SEC-019 | The system shall not publicly expose private financial or readiness data. |
| DOC-SEC-020 | Tax and compliance labels shall follow approved market configuration. |

### 16.37 Performance, accessibility and non-functional requirements

| ID | Requirement |
|---|---|
| DOC-NFR-001 | Business Web shall support common modern desktop browsers. |
| DOC-NFR-002 | Business Mobile shall support common low-cost Android devices. |
| DOC-NFR-003 | Customer Web shall be mobile-first. |
| DOC-NFR-004 | Core pages shall remain usable on low-bandwidth connections. |
| DOC-NFR-005 | The system shall optimize generated PDFs. |
| DOC-NFR-006 | The system shall support scalable document rendering. |
| DOC-NFR-007 | The system shall maintain calculation consistency under load. |
| DOC-NFR-008 | The system shall provide data-freshness indicators. |
| DOC-NFR-009 | The system shall support graceful degradation when secondary services fail. |
| DOC-NFR-010 | Document records shall remain available during temporary messaging outages. |
| DOC-NFR-011 | The system shall support disaster recovery. |
| DOC-NFR-012 | The system shall support observability for creation, rendering, payment and delivery. |
| DOC-NFR-013 | The system shall support keyboard navigation. |
| DOC-NFR-014 | The system shall support screen readers for core flows. |
| DOC-NFR-015 | The system shall meet approved colour-contrast requirements. |
| DOC-NFR-016 | The system shall support local date, currency and number formats. |
| DOC-NFR-017 | The system shall support future language localisation. |
| DOC-NFR-018 | The system shall preserve consistent identifiers across channels. |
| DOC-NFR-019 | The system shall support controlled feature rollout. |
| DOC-NFR-020 | The system shall provide useful error messages without exposing technical details. |

### 16.38 Administration, support and merchant-success requirements

| ID | Requirement |
|---|---|
| DOC-ADM-001 | Authorized operators shall manage document types. |
| DOC-ADM-002 | Authorized operators shall manage templates. |
| DOC-ADM-003 | Authorized operators shall manage market-specific settings. |
| DOC-ADM-004 | Authorized operators shall manage entitlements. |
| DOC-ADM-005 | Authorized operators shall manage sponsored programmes. |
| DOC-ADM-006 | Authorized operators shall manage approved tax configuration. |
| DOC-ADM-007 | Authorized operators shall manage rendering and messaging incidents. |
| DOC-ADM-008 | The system shall support merchant support notes. |
| DOC-ADM-009 | The system shall support assisted template setup. |
| DOC-ADM-010 | The system shall support assisted customer and supplier import. |
| DOC-ADM-011 | The system shall support document migration review. |
| DOC-ADM-012 | The system shall support issue diagnostics. |
| DOC-ADM-013 | The system shall support resend and link-revocation operations. |
| DOC-ADM-014 | High-risk administrative actions shall require maker-checker approval. |
| DOC-ADM-015 | The system shall audit administrative changes. |
| DOC-ADM-016 | Support users shall not alter issued documents. |
| DOC-ADM-017 | The system shall support Account Manager merchant health views. |
| DOC-ADM-018 | The system shall support onboarding checklists. |
| DOC-ADM-019 | The system shall support training mode or sample documents. |
| DOC-ADM-020 | The system shall support market and cohort-level operational reporting. |

### 16.39 Migration and interoperability requirements

| ID | Requirement |
|---|---|
| DOC-MIG-001 | Existing AscendSME documents shall be evaluated for migration. |
| DOC-MIG-002 | The migration shall preserve document identifiers where practical. |
| DOC-MIG-003 | The migration shall preserve issued files and status. |
| DOC-MIG-004 | The migration shall preserve customer relationships. |
| DOC-MIG-005 | The migration shall preserve payment relationships. |
| DOC-MIG-006 | The migration shall avoid duplicate business, customer and document records. |
| DOC-MIG-007 | The migration shall identify conflicting numbering. |
| DOC-MIG-008 | The migration shall distinguish drafts from issued documents. |
| DOC-MIG-009 | The migration shall preserve available audit history. |
| DOC-MIG-010 | The migration shall preserve attachments. |
| DOC-MIG-011 | The migration shall not infer verification without evidence. |
| DOC-MIG-012 | The migration shall create an audit record. |
| DOC-MIG-013 | The migration shall support batch validation. |
| DOC-MIG-014 | The migration shall support rollback of failed batches. |
| DOC-MIG-015 | The migration shall report unresolved conflicts. |
| DOC-MIG-016 | The system shall support CSV import for approved document classes. |
| DOC-MIG-017 | The system shall support export of merchant-owned records. |
| DOC-MIG-018 | The system shall preserve source-system references. |
| DOC-MIG-019 | The migration shall protect private data. |
| DOC-MIG-020 | The migration shall be tested against representative merchant histories. |

### 16.40 Product analytics and success-metric requirements

| ID | Requirement |
|---|---|
| DOC-ANL-001 | The platform shall measure businesses creating at least one document. |
| DOC-ANL-002 | The platform shall measure first-document completion time. |
| DOC-ANL-003 | The platform shall measure document issue rate. |
| DOC-ANL-004 | The platform shall measure quotation acceptance. |
| DOC-ANL-005 | The platform shall measure quotation-to-invoice conversion. |
| DOC-ANL-006 | The platform shall measure invoice payment rate. |
| DOC-ANL-007 | The platform shall measure days to payment. |
| DOC-ANL-008 | The platform shall measure overdue receivables. |
| DOC-ANL-009 | The platform shall measure payment-method mix. |
| DOC-ANL-010 | The platform shall measure document creation by channel. |
| DOC-ANL-011 | The platform shall measure documents generated from POS, Shop, Services and Office. |
| DOC-ANL-012 | The platform shall measure digital versus print delivery. |
| DOC-ANL-013 | The platform shall measure customer views and actions. |
| DOC-ANL-014 | The platform shall measure reminder usage and impact. |
| DOC-ANL-015 | The platform shall measure paid branding, automation and signature adoption. |
| DOC-ANL-016 | The platform shall measure Ascend Balance spend. |
| DOC-ANL-017 | The platform shall measure correction and cancellation rates. |
| DOC-ANL-018 | The platform shall measure support and rendering failures. |
| DOC-ANL-019 | The platform shall measure connected evidence events. |
| DOC-ANL-020 | Analytics shall protect personal and commercial confidentiality. |

### 16.41 Quality assurance requirements

| ID | Requirement |
|---|---|
| DOC-QA-001 | Testing shall verify calculations across document types. |
| DOC-QA-002 | Testing shall verify wide and mobile builder consistency. |
| DOC-QA-003 | Testing shall verify document numbering uniqueness. |
| DOC-QA-004 | Testing shall verify issued-document immutability. |
| DOC-QA-005 | Testing shall verify correction and supersession history. |
| DOC-QA-006 | Testing shall verify POS-generated receipts. |
| DOC-QA-007 | Testing shall verify Shop-generated invoices and receipts. |
| DOC-QA-008 | Testing shall verify Services quotations and agreements. |
| DOC-QA-009 | Testing shall verify Office purchase orders. |
| DOC-QA-010 | Testing shall verify payment allocation. |
| DOC-QA-011 | Testing shall verify part payments and balances. |
| DOC-QA-012 | Testing shall verify customer secure-link access. |
| DOC-QA-013 | Testing shall verify link expiry and revocation. |
| DOC-QA-014 | Testing shall verify acceptance and signature flows. |
| DOC-QA-015 | Testing shall verify offline drafts and synchronization. |
| DOC-QA-016 | Testing shall verify tenant and role isolation. |
| DOC-QA-017 | Testing shall verify Ascend Balance deductions. |
| DOC-QA-018 | Testing shall verify institutional access controls. |
| DOC-QA-019 | Testing shall verify Business Evidence events and reversals. |
| DOC-QA-020 | Testing shall verify export and retention behavior. |

# 17. Monetization Architecture

Ascend Documents belongs across all four commercial stages.

## Start

Free or highly accessible:

- Basic quotations
- Basic invoices
- Basic receipts
- Basic customer records
- PDF download
- Manual payment recording
- Basic document history
- Basic evidence generation

## Run

Paid operating value:

- Business Branding Pack
- Advanced numbering
- Additional users and approval workflows
- Accountant access
- Advanced templates
- Purchase and supplier workflows
- Additional storage
- Assisted setup and migration

## Grow

Paid commercial value:

- Payment links
- Automated reminders
- WhatsApp and SMS delivery
- Recurring documents
- Customer portals
- Workflow automation
- Integrations

## Prove

Paid credibility value:

- Verified statements
- Verified Business Evidence Reports
- Bank-ready packs
- Accountant-reviewed outputs
- Institutional reporting
- Compliance and funding preparation

## Assurance

Periodic infrastructure value may include:

- Cloud synchronization
- Secure backups
- Mobile access
- updates
- security
- standard support
- document rendering
- remote assistance
- evidence processing

Historical records and export access must not disappear when Assurance expires.

---

# 18. Recommended Initial Commercial Offers

## Free Documents

- Basic quotations
- Basic invoices
- Basic receipts
- Basic customer records
- Basic PDF and WhatsApp sharing
- Manual payment recording
- Basic evidence history

## Business Branding Pack

One-time purchase that may include:

- Logo and colours
- Branded templates
- Signature and stamp
- Payment instructions
- Custom footer
- Approved numbering configuration

Illustrative Ghana pilot range:

**GHS 50 to GHS 150**

## Automation Pack

Paid through entitlement or Ascend Balance:

- Automated reminders
- Recurring invoices
- Bulk generation
- Customer statements
- Advanced delivery tracking
- workflow automation

## Credibility Pack

- Verified statements
- Business Evidence Report
- Bank-ready document pack
- Accountant review
- Opportunity preparation

---

# 19. Rollout Plan

## Phase 1: Connected Documents foundation

- Business Web
- Business Mobile
- Customer secure web
- Quotations
- Proformas
- Invoices
- Receipts
- Credit notes
- Customer and catalogue reuse
- POS, Shop and Services generation
- Manual and integrated payment recording
- PDF, print, WhatsApp and email
- Issued-version preservation
- Basic reports
- Evidence events

## Phase 2: Commercial progression

- Customer acceptance
- Payment links
- automated reminders
- statements
- accountant access
- purchase orders
- delivery notes
- job cards
- agreements
- signature
- Office integration
- Customer Mobile history

## Phase 3: Credibility and institutional scale

- Verified reports
- institutional templates
- sponsored programmes
- advanced automation
- country-specific integrations
- partner APIs
- advanced document intelligence
- sector libraries

---

# 20. Key Success Metrics

## Headline product metric

**Percentage of active businesses that complete a document-to-outcome journey within the measurement period.**

A document-to-outcome journey includes:

- Quotation accepted
- Invoice paid
- Deposit collected
- Delivery confirmed
- Agreement signed
- Purchase order received
- Receipt linked to verified payment

## Supporting metrics

- First-document completion rate
- Time to first issued document
- Quotation acceptance rate
- Quotation-to-invoice conversion
- Invoice payment rate
- Median days to payment
- Overdue receivables rate
- Digital delivery rate
- Customer view rate
- Reminder effectiveness
- Cross-set document generation
- Paid branding adoption
- Automation adoption
- Signature adoption
- Verified-report adoption
- Evidence confidence
- Support cost per active business

---

# 21. Shared Data Model

Core entities include:

- Business
- Location
- Person
- Business Membership
- Customer
- Supplier
- Commercial Party
- Catalogue Item
- Document
- Document Version
- Document Line
- Document Number Rule
- Template
- Approval
- Customer Action
- Payment Obligation
- Payment
- Payment Allocation
- Receipt
- Credit Note
- Refund
- Statement
- Attachment
- Secure Link
- Signature
- Reminder
- Message
- Related Transaction
- Evidence Event
- Entitlement
- Ascend Balance Transaction
- Institutional Programme

---

# 22. Canonical Events

Examples:

- document.draft_created
- document.approval_requested
- document.approved
- document.issued
- document.sent
- document.delivered
- document.viewed
- document.accepted
- document.rejected
- document.change_requested
- document.expired
- document.cancelled
- document.superseded
- quotation.converted
- invoice.payment_requested
- payment.recorded
- payment.verified
- payment.allocated
- receipt.issued
- credit_note.issued
- refund.recorded
- agreement.signed
- delivery.confirmed
- job.completed
- statement.generated
- reminder.sent
- secure_link.revoked
- evidence.recorded
- evidence.reversed

---

# 23. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Product becomes a complex accounting suite | Maintain transaction-facing scope and plain language |
| Each product set creates its own documents | Enforce one shared document engine and identifiers |
| Basic documents are over-monetized | Keep basic quotations, invoices and receipts accessible |
| Issued records are altered silently | Immutable issued versions and controlled corrections |
| Merchants distrust digital documents | Strong branding, print, WhatsApp and customer web access |
| Payment claims are treated as verified | Use payment confidence and verification states |
| Documents increase scores unfairly | Score outcomes and evidence quality, not volume |
| Tax outputs are misunderstood | Market configuration, clear wording and approved advice |
| Customers refuse app installation | Keep secure Customer Web as the default |
| Reminder automation becomes abusive | Consent, frequency controls and pause rules |
| External accountants see too much | Time-bound, scoped and revocable access |
| Institutional partners request all data | Consent, data minimisation and approved reports |
| Offline numbering causes duplicates | Temporary identifiers and conflict-safe final numbering |
| Rendering failures affect trust | Monitoring, retry, tested templates and support tools |
| Too many document types confuse users | Contextual recommendations and progressive disclosure |

---

# 24. Dependencies, Assumptions and Constraints

## Dependencies

- Shared identity and tenancy
- Customers and commercial parties
- Catalogue
- Payments
- Financial foundation
- Messaging
- Entitlements and Ascend Balance
- Business Event Engine
- Business Evidence Ledger
- File storage
- PDF rendering
- Business Web and Mobile shells
- Customer Web and Mobile
- POS, Shop, Services and Office integrations

## Assumptions

- Ghana remains the first commercial market.
- WhatsApp remains an important delivery channel.
- Mobile Money and cash remain important payment methods.
- Many businesses need assisted setup.
- Customer Web will acquire more users than Customer Mobile initially.
- Basic documents drive evidence and should remain accessible.
- Country-specific tax and regulatory configuration will require local validation.

## Constraints

- Weak connectivity
- Low-cost Android devices
- varying printer quality
- limited merchant accounting knowledge
- payment-provider differences
- country-specific retention and tax rules
- variable messaging costs
- operational cost of template and migration support

---

# 25. Out of Scope

The MVP excludes:

- Full statutory accounting
- Legal advice
- Guaranteed legal enforceability
- Universal multi-country fiscal compliance
- Advanced contract negotiation
- General-purpose document collaboration
- Complex enterprise records management
- Payroll processing
- Banking or lending decisions
- Public financial disclosure
- Unrestricted customer-document aggregation
- Every sector-specific form
- Advanced OCR-driven bookkeeping

---

# 26. Open Decisions

- Final Ghana free allowances
- Final Branding Pack price
- Supported initial agreement templates
- electronic-signature provider strategy
- default document numbering pattern
- default secure-link expiry
- customer account incentives
- invoice reminder frequency
- recurring document release timing
- exact accountant-access packages
- tax and fiscal integration priorities
- Customer Mobile document-wallet timing
- document retention by market
- institution-sponsored report formats
- treatment of external manual payment evidence
- verified-statement criteria
- support boundaries for custom templates
- bulk generation limits
- sector-specific template priorities
- integration sequence with Office procurement

---

# 27. Future Enhancements

- AI-assisted document drafting
- AI-assisted line-item extraction
- Voice-based mobile invoice creation
- contract-clause assistance subject to legal boundaries
- advanced customer payment plans
- advanced collections workflows
- sector-specific packs
- supplier portal
- cross-business document wallet
- public document verification
- digital seals
- tax authority integrations
- e-invoicing integrations
- advanced accounting integrations
- document anomaly detection
- multilingual templates
- advanced institutional APIs

---

# 28. Master Acceptance Scenarios

## Scenario 1: Standalone invoice

Given a business with no other active Ascend product set, when the owner creates and issues an invoice, then the invoice uses the shared business and customer records and can be sent, paid and reported without requiring POS, Shop, Services or Office.

## Scenario 2: POS receipt

Given a completed POS sale, when payment completes, then one receipt is generated from the shared transaction and can be printed or sent digitally without creating a duplicate payment.

## Scenario 3: Shop order invoice

Given a Shop order, when the merchant issues an invoice, then customer, order, items, payment and fulfilment remain linked.

## Scenario 4: Services quotation

Given a service request, when the merchant creates a quotation, then the customer can accept, reject or request changes through secure Customer Web.

## Scenario 5: Quote conversion

Given an accepted quotation, when the merchant converts it to an invoice, then the original quotation remains available and the invoice receives a new number.

## Scenario 6: Part payment

Given an invoice with a balance, when a part payment is recorded, then the invoice becomes partially paid, the remaining balance updates and a receipt is generated for the payment.

## Scenario 7: Credit note

Given an issued invoice requiring a reduction, when an authorised user issues a credit note, then the original invoice is preserved and the balance and financial records update.

## Scenario 8: Mobile creation

Given an owner using Business Mobile, when the owner creates a simple invoice, then the flow is sequential, touch-friendly and produces the same totals and record as Business Web.

## Scenario 9: Wide-screen builder

Given a user on Business Web, when creating a quotation, then the user can edit fields and view the customer-facing preview in a split layout.

## Scenario 10: Customer without app

Given a customer receives a secure link, when the customer opens it, then the customer can view, download and complete permitted actions without installing Customer Mobile.

## Scenario 11: Issued immutability

Given an issued invoice, when a staff user attempts direct editing, then the system blocks the change and offers authorized correction workflows.

## Scenario 12: Automated reminder

Given an overdue invoice with reminder automation enabled, when the scheduled time arrives, then the system sends the permitted message, records delivery and avoids duplicate reminders.

## Scenario 13: Offline POS receipt

Given an eligible offline cash POS sale, when the sale completes, then a receipt can be printed with a safe temporary record and synchronizes without duplication after reconnection.

## Scenario 14: Unverified payment

Given a merchant manually records a Mobile Money reference without verification, when a receipt is viewed, then the payment confidence is not misrepresented as provider-verified.

## Scenario 15: Accountant access

Given an external accountant receives time-bound access, when the accountant signs in, then only the permitted business, location and document classes are visible.

## Scenario 16: Institutional programme

Given an institution sponsors branded templates for a merchant cohort, when merchants issue documents, then merchant identity remains primary and the institution sees only approved cohort reports.

## Scenario 17: Evidence integrity

Given a merchant issues many unpaid invoices, when Readiness evaluates evidence, then document volume alone does not improve the score.

## Scenario 18: Refunded payment

Given a paid invoice is later refunded, when the refund completes, then the receipt, invoice, financial ledger and evidence history receive linked reversal information.

## Scenario 19: Secure-link revocation

Given a sensitive document link is revoked, when a customer opens the old link, then access is denied without deleting the underlying document.

## Scenario 20: Assurance expiry

Given a business does not renew Assurance, when the access period ends, then historical documents remain readable and exportable while selected live services may enter limited mode.

## Scenario 21: Office purchase order

Given an approved purchase request, when a purchase order is issued, then it remains linked to the approval, supplier, goods receipt and payment.

## Scenario 22: Customer Mobile history

Given a signed-in customer has documents from several Ascend businesses, when the customer opens Customer Mobile, then permitted documents are grouped without exposing one merchant's private information to another.

## Scenario 23: Duplicate creation retry

Given a network retry occurs during document issue, when the request repeats, then the system returns the original issued document instead of creating a duplicate.

## Scenario 24: Business-profile change

Given a business changes its address after issuing an invoice, when the old invoice is opened, then it preserves the issuer details used at issue time.

## Scenario 25: Customer merge

Given two duplicate customer records are merged through an authorized workflow, when related documents are reviewed, then history remains intact and audit records identify the merge.

---

# Appendix A. Priority Definitions

| Priority | Meaning |
|---|---|
| MVP | Required for the controlled connected-Documents release |
| Next | Required for first commercial expansion |
| Later | Strategically valuable after foundational validation |

# Appendix B. Evidence Confidence Examples

| Evidence source | Example confidence |
|---|---|
| Merchant-created draft | Low |
| Issued system document | Moderate |
| Customer viewed secure link | Moderate |
| Customer accepted quotation | Strong |
| Integrated payment verified | Strong |
| Delivery confirmed by customer | Strong |
| Institution-verified supporting document | Strong |
| Manually recorded payment without evidence | Merchant-declared |

# Appendix C. Commercial Guardrails

- Do not charge heavily for basic document creation.
- Do not charge for merchant-owned historical access or export.
- Do not charge for correcting an AscendSME failure.
- Do not link payment to score improvement.
- Do not charge twice for shared document capability.
- Show the exact local-currency price before paid action.
- Use Ascend Balance for variable-cost actions.
- Preserve access when an entitlement or Assurance period ends.
- Separate verification from branding and promotion.

# Appendix D. Final Product Definition

Ascend Documents is:

> **The shared commercial-document, payment-progression and business-evidence layer of AscendSME.**

It gives businesses a practical way to formalise sales, service engagements, purchases and payment obligations.

It gives customers a clear way to review, approve, sign and pay.

It gives the AscendSME platform one reliable document history across POS, Shop, Services, Office, Business Web, Business Mobile, Customer Web and Customer Mobile.

The final promise is:

> **Create the document. Move the transaction forward. Preserve the evidence.**
