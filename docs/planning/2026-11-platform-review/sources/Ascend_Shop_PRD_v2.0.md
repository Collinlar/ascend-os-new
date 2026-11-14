# AscendSME

## Ascend Shop Product Requirements Document

*The connected commerce, conversion and business evidence product for African sellers*

> **Product thesis**
>
> Turn product interest into structured orders and revenue. Let merchants start with the product photos they already have, reach customers through Shop and Discover, and build a verifiable operating record through normal commerce.

| **Field** | **Value** |
|---|---|
| Document owner | Bold Vision MultiTech / AscendSME Product |
| Version | 2.0 |
| Status | Authoritative Ascend Shop product requirements baseline |
| Inherits | AscendSME Connected Platform Master PRD v2.0 |
| Primary market | Ghana |
| Expansion markets | Nigeria, Kenya, South Africa and other African markets |
| Date | 24 July 2026 |
| Supersedes | Ascend Shop PRD v1.1 where this document introduces a conflicting architecture, channel, Discover, packaging or monetization decision |

> **CONFIDENTIAL PRODUCT DOCUMENT**

# Document Control

This PRD defines Ascend Shop within the new connected AscendSME deployment. It is subordinate to the Master PRD for shared identity, zero-silo architecture, evidence governance, channel strategy, entitlements, payments, security and monetization. Product-specific detail in this PRD takes precedence over older Shop documents where it does not conflict with the Master PRD.

## Revision History

| **Version** | **Date** | **Change** | **Owner** |
|---|---|---|---|
| 1.0 | July 2026 | Initial complete Ascend Shop PRD. | AscendSME Product |
| 1.1 | 12 July 2026 | Added catalogue-first, photo-led onboarding and AI-assisted catalogue creation. | AscendSME Product |
| 2.0 | 24 July 2026 | Rebuilt Shop for the connected platform, Business and Customer web/mobile experiences, Ascend Discover, zero-silo rules, free-to-growth monetization and first-year commercial targets. | AscendSME Product |

## Approval Roles

| **Role** | **Approval responsibility** |
|---|---|
| Founder / CEO | Product vision, market positioning, investment thesis and commercial direction |
| Product Lead | Scope, prioritisation, backlog quality and release acceptance |
| CTO / Engineering Lead | Architecture, security, data integrity and delivery feasibility |
| Design Lead | Merchant and customer experience, responsive quality and accessibility |
| Commercial Lead | Pricing, Discover offers, bundles and unit-economics validation |
| Data and Evidence Lead | Event governance, evidence confidence and score integrity |
| Operations Lead | Merchant onboarding, Account Managers, support and institutional delivery |

## Requirement Interpretation

- **MVP** requirements are required for the controlled connected-Shop release unless formally deferred.
- **Next** requirements support the first commercial expansion and first-year targets.
- **Later** requirements preserve architectural extensibility and must not distort MVP delivery.
- All prices, allowances and targets remain commercial hypotheses until approved through Ghana pricing and unit-economics validation.
- Requirements use “must” in narrative and acceptance intent even where table wording begins with an imperative verb.

# Table of Contents

- 1. Executive Summary
- 2. First Deployment Learning and Strategic Opportunity
- 3. Relationship to the Connected Platform Master PRD
- 4. Product Definition and Positioning
- 5. Vision, Promise and Desired Outcomes
- 6. Goals, Non-Goals and Product Principles
- 7. Target Business Archetypes
- 8. Personas and Roles
- 9. Product Scope and Release Model
- 10. End-to-End Merchant and Customer Journey
- 11. Information Architecture and Navigation
- 12. Connected Platform and Zero-Silo Requirements
- 13. Channel and Experience Architecture
- 14. Merchant Business Web and Mobile Experience
- 15. Customer Web and Mobile Experience
- 16. Catalogue-First Merchant Onboarding
- 17. Business Identity and Shop Profile
- 18. Catalogue, AI and Product Management
- 19. Inventory and Cross-Set Stock Sharing
- 20. Storefront, Themes and Business Website
- 21. Social Commerce and Shareable Selling
- 22. Storefront Discovery and Merchandising
- 23. Cart and Checkout
- 24. Payments and Payment Confirmation
- 25. Orders and Order Lifecycle
- 26. Fulfilment, Delivery and Pickup
- 27. Returns, Refunds and Cancellations
- 28. Customers, CRM and Consent
- 29. Merchant Promotions and Offers
- 30. Ascend Discover and Promote with Ascend
- 31. Merchant Operations and Action Management
- 32. Reporting and Business Insights
- 33. Messaging and Notifications
- 34. Roles, Permissions and Multi-User Operations
- 35. Business Evidence Ledger and Readiness
- 36. Monetization, Ascend Balance and Commercial Rules
- 37. Bundles, Entitlements and Cross-Set Packaging
- 38. Connectivity Resilience and Synchronisation
- 39. Performance, SEO and Discoverability
- 40. Security, Privacy, Fraud and Trust
- 41. Account Manager, Support and Merchant Success
- 42. Institutional and Sponsored Deployment
- 43. APIs and External Integrations
- 44. Migration from the First Deployment
- 45. Product Analytics and Success Metrics
- 46. Rollout and First-Year Commercial Plan
- 47. Quality Assurance and Release Acceptance
- 48. Shared Data Model
- 49. State Machines and Canonical Events
- 50. Dependencies, Assumptions and Constraints
- 51. Risks and Mitigations
- 52. Out of Scope
- 53. Open Decisions
- 54. Future Enhancements
- 55. Master Acceptance Scenarios
- Appendices

# 1. Executive Summary

Ascend Shop is the connected online-commerce and conversion product of AscendSME. It is built for businesses that already attract customers through WhatsApp, Instagram, TikTok, Facebook, referrals and physical relationships but struggle to convert that attention into organised orders, recognised revenue and a reusable customer history.

The product starts with the asset merchants already have: product photographs. A merchant uploads or captures images, receives editable AI-assisted catalogue suggestions, adds prices, previews a credible mobile storefront and completes only the minimum information required to begin trading. The business can then share one Shop link, receive structured orders, collect or confirm payment, fulfil customers and monitor performance through Ascend Business Web and Mobile.

Ascend Discover extends the value proposition beyond storefront creation. Eligible merchants receive organic discovery and can pay through Ascend Balance to promote products, collections or their Shop. AscendSME does not initially become the seller of record or fulfilment owner. It gives merchants reach, attribution and structured commerce while the merchant owns the customer relationship and delivery responsibility.

Every order, payment, fulfilment action, customer interaction, stock movement, receipt and correction uses the same shared platform records and generates governed business events. These events contribute to the Business Evidence Ledger, MOT, Sustainability Score, Trust Level and Funding Readiness according to evidence quality, not the amount the merchant pays.

> **Master product decision**
>
> Ascend Shop will be the fastest route from social selling to an organised, discoverable and verifiable business. It will operate as one connected product across Business Web, Business Mobile, Customer Web and Customer Mobile, without duplicating customers, products, inventory, payments, documents, staff or evidence.

## 1.1 First-year objectives

- Reach at least **1,000 activated Shop businesses**, subject to approved onboarding and support capacity.
- Achieve a **50% revenue activation rate**, defined through at least one recognised revenue event within the approved cohort window.
- Achieve **40% Ascend Discover promotion adoption**, with merchant-paid and sponsored activity reported separately.
- Reduce time from first image upload to Shop activation and first recognised revenue.
- Prove that Shop, Discover and the shared Evidence Engine create a stronger merchant value and revenue model than conventional compulsory monthly SaaS.

# 2. First Deployment Learning and Strategic Opportunity

The first AscendSME deployment demonstrated that SMEs value structure, records and business readiness, but it also revealed that formalization cannot be the first message. Businesses adopt tools because they need to sell, win customers, receive money and stay organised. Formalization becomes sustainable when it is produced by those useful daily activities.

For online and social sellers, the daily challenge is not simply “having a website.” It is converting interest into a clear purchase path. Products are repeatedly posted on social media, customers ask the same questions in private messages, payment claims are difficult to track, orders become buried in chats and fulfilment records remain incomplete.

Ascend Shop responds by combining three opportunities:

1. **Conversion:** move customers from social interest to a structured product, cart, checkout and order journey.
2. **Growth:** let merchants reach customers beyond their own followers through Ascend Discover and promotion.
3. **Credibility:** turn commerce activity into connected, verifiable operating evidence.

# 3. Relationship to the Connected Platform Master PRD

| **Shared platform capability** | **Platform responsibility** | **Ascend Shop responsibility** |
|---|---|---|
| Business identity and tenancy | Maintain one canonical business, membership and location model. | Present the customer-facing Shop identity and collect only commerce-required fields. |
| People and permissions | Maintain shared staff identity, roles, location scope and delegated authority. | Expose Shop-specific owner, manager, catalogue, fulfilment and support permissions. |
| Customers | Maintain one customer identity and consent history across product sets. | Create and update commerce interactions with Shop source attribution. |
| Catalogue | Maintain canonical products, variants, media and services. | Provide online presentation, categories, collections and Shop availability. |
| Inventory | Maintain one auditable location-aware movement ledger. | Reserve, release and fulfil stock through Shop order events. |
| Payments and financial foundation | Maintain payment attempts, verification, refunds and ledger events. | Present payment options and coordinate order payment state. |
| Documents | Maintain numbering, versions and commercial document rules. | Issue order confirmations, invoices, receipts, refunds and delivery documents. |
| Office and Work | Maintain staff, tasks, assignments and approvals. | Create fulfilment work and use advanced Office capability when enabled. |
| Messaging | Maintain templates, consent, delivery state and variable-cost rules. | Send operationally truthful order, payment, fulfilment and promotion messages. |
| Evidence and Readiness | Maintain event governance, Business Evidence Ledger and score models. | Emit traceable Shop commerce evidence without rewarding product purchase. |
| Entitlements and monetization | Maintain product, bundle, capacity, Balance, Assurance and sponsorship access. | Enforce Shop limits and contextual commercial offers consistently. |

# 4. Product Definition and Positioning

Ascend Shop is a mobile-first commerce product that helps African businesses create a credible online storefront, convert customer interest into structured orders, receive or verify payment, fulfil reliably and build a reusable business record.

It is positioned between informal social selling and complex e-commerce software. It is more structured than taking every order through chat, but easier to activate and operate than a general-purpose website builder or enterprise commerce platform.

> **Positioning statement**
>
> Turn your product photos into a Shop customers can actually buy from. Reach more people through Ascend Discover and keep every order, payment and customer connected to your business.

# 5. Vision, Promise and Desired Outcomes

## 5.1 Vision

Every African business should be able to convert customer attention into organised commerce and a trusted operating history without needing technical expertise or several disconnected tools.

## 5.2 Product promise

A merchant can upload product photos, approve an assisted catalogue, preview and activate a Shop within minutes, share one link everywhere, receive structured orders and use Discover to reach more customers. AscendSME quietly connects the resulting customers, payments, fulfilment, stock, documents and evidence.

## 5.3 Desired outcomes

- Faster movement from product photograph to live Shop.
- Higher conversion from social interest to structured order and recognised revenue.
- Fewer missed orders, ambiguous payments and fulfilment errors.
- More customer continuity and repeat purchasing.
- Natural merchant willingness to pay for reach, transactions, automation and credibility.
- Stronger, explainable business evidence from normal commerce.
- Seamless movement into POS, Office, Documents, Services and Readiness.

# 6. Goals, Non-Goals and Product Principles

## 6.1 Goals

1. Let a non-technical merchant create and activate a credible mobile storefront with minimal friction.
2. Provide a customer journey that is clearer and more convertible than direct-message ordering.
3. Give merchants an understandable paid growth path through Ascend Discover.
4. Use shared customer, catalogue, inventory, payment, document, staff and evidence infrastructure.
5. Build revenue through clear value moments rather than compulsory monthly software rent.
6. Support self-service, Account Manager assisted and institution-sponsored deployment.
7. Produce reliable commerce evidence without distorting scores through product purchase or promotion spend.

## 6.2 Non-goals for the initial release

- Becoming the seller of record for all merchant transactions.
- Operating a fully managed marketplace with central inventory and fulfilment responsibility.
- Competing with enterprise e-commerce platforms on unrestricted theme and code customisation.
- Holding customer funds or operating as an unlicensed payment institution.
- Building a complete logistics fleet-management platform.
- Supporting every international tax, subscription-commerce or digital-rights scenario.
- Forcing customers to install Ascend Customer Mobile to purchase or track an order.

## 6.3 Product principles

- **Create value before requesting completeness.**
- **Customer conversion before feature density.**
- **Web for depth, mobile for action.**
- **One shared record, many connected experiences.**
- **Payment state must always be truthful.**
- **Organic opportunity must coexist with paid promotion.**
- **The merchant remains seller and customer owner.**
- **Charge for reach, automation, infrastructure and proof, not basic evidence capture.**
- **Evidence is earned through behaviour, not purchased.**
- **Assisted onboarding must strengthen ownership, not create dependency.**
- **Design for weak connectivity, mobile use and local payment behaviour.**

# 7. Target Business Archetypes

| **Archetype** | **Examples** | **Primary need** |
|---|---|---|
| Social seller | Fashion, beauty, food, home products, accessories | Turn posts and chats into a persistent catalogue and structured orders. |
| Home-based product business | Baker, caterer, cosmetics maker, craft producer | Present products, manage made-to-order expectations and receive deposits or payment. |
| Online-first retailer | Electronics, groceries, pharmacy, fashion | Manage a broader catalogue, stock, payment and fulfilment. |
| Physical retailer adding online commerce | Boutique, minimart, pharmacy, spare-parts shop | Share POS products and stock with an online channel. |
| Wholesaler or distributor | Consumer goods, provisions, agro-inputs | Present catalogue, collect enquiries or orders and coordinate fulfilment. |
| Institution-supported merchant | Women-led, youth-led, sector or regional cohort | Receive assisted setup, sponsored capabilities and programme reporting. |

# 8. Personas and Roles

| **Role** | **Primary goals** | **Primary channel** |
|---|---|---|
| Business owner | Launch, monitor conversion, control payment and fulfilment, grow reach. | Business Web and Mobile |
| Shop manager | Operate catalogue, orders, customers and staff within authority. | Business Web and Mobile |
| Catalogue staff | Capture images, maintain products and availability. | Business Mobile and Web |
| Fulfilment staff | Prepare, dispatch, hand over or complete assigned orders. | Business Mobile |
| Customer | Find products, understand the merchant, order, pay and track. | Customer Web, optional Customer Mobile |
| Account Manager | Assist setup, training, recovery and merchant success. | Authorised support workspace |
| Institutional programme officer | Monitor consented cohort activation and outcomes. | Partner or institutional workspace |
| Ascend operations administrator | Moderate, support, reconcile and manage promotions within authority. | Internal administration |

# 9. Product Scope and Release Model

## 9.1 MVP

- Catalogue-first onboarding and AI-assisted drafts.
- Basic storefront, catalogue, cart, checkout and order tracking.
- Merchant Business Web and Mobile operations.
- Customer Web purchasing without forced account or app installation.
- Cash, manual Mobile Money and approved integrated payment options.
- Basic fulfilment, pickup, delivery, receipt and customer records.
- Organic Discover eligibility and fixed-price promotion pilots.
- Shared platform, events, evidence, entitlements and Ascend Balance.

## 9.2 Next

- Customer Mobile continuity, advanced team operations and Office integration.
- Advanced promotion, attribution, automation and customer recovery.
- Multi-location, advanced inventory, domains and institutional programmes.
- Verified reports and deeper Readiness interpretation.

## 9.3 Later

- Outcome-based Discover advertising, broader recommendation systems and partner logistics.
- Advanced omnichannel, wholesale, loyalty and cross-border capabilities.

# 10. End-to-End Merchant and Customer Journey

1. Merchant opens **Create My Shop** from Business Web, Business Mobile or a campaign link.
2. Merchant verifies a phone number or email so the draft can be saved and recovered.
3. Merchant captures or uploads product photographs.
4. Ascend Shop produces editable product suggestions.
5. Merchant reviews names, descriptions and categories, then adds prices and stock or made-to-order rules.
6. Ascend Shop generates a private mobile storefront preview.
7. Merchant adds the minimum Shop, contact, payment and fulfilment information.
8. Merchant activates the Shop and receives a public link, QR code and sharing actions.
9. Eligible products can appear organically in Ascend Discover.
10. Merchant can top up Ascend Balance and purchase a clearly defined promotion.
11. Customer opens the Shop or Discover listing through Customer Web or Mobile.
12. Customer browses, adds products, checks out and selects payment and fulfilment.
13. AscendSME creates the order and records the exact payment state.
14. Merchant confirms, prepares, dispatches or makes the order ready for pickup.
15. Customer receives truthful updates and the applicable receipt or invoice.
16. Shared customer, inventory, financial, document, work and evidence records update.
17. The merchant sees revenue, fulfilment, promotion and readiness insight across Business Web and Mobile.

# 11. Information Architecture and Navigation

## 11.1 Business Web

- Overview
- Orders
- Products and Collections
- Customers
- Payments
- Promotions and Discover
- Reports
- Shop Appearance
- Settings

## 11.2 Business Mobile

- Home
- Orders
- Products
- Promote
- More

## 11.3 Customer Web and Mobile

- Discover or merchant Shop home
- Search and categories
- Product detail
- Cart
- Checkout
- Order confirmation and tracking
- Receipts and documents
- Saved businesses and products, where authenticated

# 12. Connected Platform and Zero-Silo Requirements

Ascend Shop is a focused commerce experience on the shared AscendSME platform. It must never become a separate business, customer, catalogue, inventory, payment, document, staff or evidence system.

## Connected Platform and Zero-Silo Requirements Requirements: PLT

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-PLT-001 | Use the canonical AscendSME business identity, location, membership and entitlement records. | MVP | Activating Shop for an existing business creates no duplicate business, location or membership. |
| SHOP-PLT-002 | Use the shared customer, catalogue, inventory, payment, document, work and evidence services through approved domain interfaces. | MVP | Architecture review finds no Shop-owned duplicate source of truth for a shared capability. |
| SHOP-PLT-003 | Keep channel-specific presentation data separate from canonical business records. | MVP | A Shop title, banner or online description can change without corrupting legal identity or shared catalogue data. |
| SHOP-PLT-004 | Allow Shop to operate as a standalone entry product while retaining immediate compatibility with POS, Services, Office and Documents. | MVP | A Shop-only business can trade, and later activation of another set requires no record migration. |
| SHOP-PLT-005 | Expose shared capability ownership and dependencies in the product backlog and technical design. | MVP | Every Shop epic names its owning platform domain and affected channels. |
| SHOP-PLT-006 | Use one transaction identity across order, payment, document, inventory and evidence records. | MVP | Authorised users can trace a completed order across all related records from one reference. |
| SHOP-PLT-007 | Use server-authoritative state transitions for orders, payments, fulfilment and refunds. | MVP | Invalid or stale client transitions are rejected without partial downstream updates. |
| SHOP-PLT-008 | Support country configuration for currency, payment providers, address formats, taxes, messaging and commercial offers. | Next | Launching in another configured country does not require a fork of the Shop domain model. |
| SHOP-PLT-009 | Keep merchant-owned records readable and exportable after Shop access, Assurance or a paid enhancement expires. | MVP | Expiry limits live services but does not remove historical orders, products, customers or documents. |
| SHOP-PLT-010 | Prevent product purchase, promotion spend or sponsored access from directly increasing MOT, Sustainability Score or Funding Readiness. | MVP | Score inputs reference verified behaviour and evidence, not entitlement or spend. |
| SHOP-PLT-011 | Publish Shop capability changes through versioned contracts consumed by web, mobile and partner integrations. | Next | A breaking contract change cannot deploy without versioning and migration approval. |
| SHOP-PLT-012 | Provide feature flags and cohort controls for high-risk Shop releases. | MVP | The team can enable, pause or roll back a release for selected merchants without data loss. |

# 13. Channel and Experience Architecture

Shop is delivered through role-aware channels. Business Web provides depth, Business Mobile provides action and monitoring, Customer Web removes installation friction, and Customer Mobile creates optional cross-business continuity.

## Channel and Experience Architecture Requirements: EXP

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-EXP-001 | Provide Ascend Shop through Ascend Business Web for configuration, bulk operations, deep reporting and administration. | MVP | An authorised owner can complete all setup and advanced management tasks on supported web browsers. |
| SHOP-EXP-002 | Provide daily Shop operations through Ascend Business Mobile without reproducing the complete web administration surface. | MVP | The merchant can add products, manage orders, confirm permitted payments and fulfil work from mobile. |
| SHOP-EXP-003 | Provide a public mobile-first Customer Web experience that does not require an application installation or account for standard purchasing. | MVP | A guest buyer can browse, order and receive confirmation from a shared link. |
| SHOP-EXP-004 | Provide optional cross-business Shop activity in Ascend Customer Mobile. | Next | An authenticated customer can access saved businesses, orders, receipts and recommendations across participating merchants. |
| SHOP-EXP-005 | Use the same Shop records across Business Web, Business Mobile, Customer Web and Customer Mobile. | MVP | A change accepted in one channel is reflected in every other channel after normal sync and cache expiry. |
| SHOP-EXP-006 | Adapt navigation and actions by role, device class, business configuration and entitlement. | MVP | A staff fulfilment user does not see owner-level settings or commercial reports. |
| SHOP-EXP-007 | Use web for complex setup and analysis, and mobile for capture, monitoring, approvals and exceptions. | MVP | The supported task matrix identifies one primary channel and any reduced mobile equivalent for each task. |
| SHOP-EXP-008 | Allow a merchant to move between web and mobile without restarting onboarding or order work. | MVP | The latest saved state appears after authentication on another supported device. |
| SHOP-EXP-009 | Deep-link notifications to the exact order, product, promotion, payment or setup action. | MVP | Opening a supported notification lands on an authorised actionable detail view. |
| SHOP-EXP-010 | Show freshness and sync status where mobile data may be cached or incomplete. | MVP | The merchant can distinguish current server data from cached or pending information. |
| SHOP-EXP-011 | Keep customer-facing business information separate from private owner, staff, financial and readiness data. | MVP | Public APIs and pages cannot expose private fields without explicit controlled publication. |
| SHOP-EXP-012 | Support Account Manager assisted operation through the same merchant-owned records and permissions. | MVP | Assistance is attributed and can be revoked without transferring data ownership. |
| SHOP-EXP-013 | Provide graceful unsupported-device messaging instead of a broken Shop experience. | MVP | Unsupported browsers or device capabilities receive a clear recovery path. |
| SHOP-EXP-014 | Maintain consistent product terminology and status language across all Shop channels. | MVP | Design QA confirms the same state is not labelled inconsistently across merchant and customer surfaces. |

# 14. Merchant Business Web and Mobile Experience

The merchant sees one Shop across web and mobile. Web supports configuration and analysis. Mobile supports product capture, order action, payment review, fulfilment, alerts and daily control.

## Merchant Business Web and Mobile Experience Requirements: BIZ

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-BIZ-001 | Provide a Business Web Shop overview with orders requiring action, payment exceptions, fulfilment risk, revenue and stock alerts. | MVP | The first viewport prioritises actionable exceptions rather than vanity totals. |
| SHOP-BIZ-002 | Provide product and collection management with bulk editing, import, export and publication controls on Business Web. | MVP | An authorised merchant can manage a large catalogue without editing every product individually. |
| SHOP-BIZ-003 | Provide order workspaces with payment, fulfilment, customer, document, communication and audit context. | MVP | The merchant can understand and progress an order without opening unrelated modules. |
| SHOP-BIZ-004 | Provide Shop settings for identity presentation, payments, fulfilment, policies, notifications, domains and Discover eligibility. | MVP | Settings changes validate dependencies and show their customer-facing effect. |
| SHOP-BIZ-005 | Provide a Business Mobile home focused on new orders, payments needing review, fulfilment actions, stock exceptions and promotion results. | MVP | A merchant can identify the next Shop action within one mobile screen. |
| SHOP-BIZ-006 | Allow mobile photo capture and rapid product creation using AI suggestions and merchant review. | MVP | A merchant can publish a valid product from a supported phone without using Business Web. |
| SHOP-BIZ-007 | Allow mobile order confirmation, preparation, readiness, dispatch, pickup and completion actions subject to permissions. | MVP | Each action validates the current server state and records actor and time. |
| SHOP-BIZ-008 | Allow mobile contact actions through approved WhatsApp, phone, SMS or email channels with consent and audit controls. | MVP | Contact uses the shared communication rules and does not expose customer data to unauthorised staff. |
| SHOP-BIZ-009 | Allow owners to monitor Shop performance, payment status, staff action and fulfilment from Ascend Business Mobile. | MVP | The owner sees role-appropriate Shop monitoring alongside other installed sets. |
| SHOP-BIZ-010 | Allow staff to see only assigned orders, tasks, locations and customer information required for fulfilment. | Next | Role and assignment tests prevent access to unassigned or restricted work. |
| SHOP-BIZ-011 | Support merchant notes and internal handovers without exposing them to customers. | Next | Internal notes are separately classified and excluded from public responses and documents. |
| SHOP-BIZ-012 | Provide clear empty, loading, partial, failure and offline states for every core merchant surface. | MVP | No core screen relies on a blank area or indefinite spinner to communicate state. |
| SHOP-BIZ-013 | Provide contextual upgrade prompts only when a merchant reaches a relevant need or limit. | MVP | Upgrade prompts explain the outcome, price and current limitation without blocking unrelated work. |
| SHOP-BIZ-014 | Suppress repeated commercial prompts after dismissal according to frequency rules. | MVP | A merchant is not repeatedly interrupted by the same offer during routine operations. |
| SHOP-BIZ-015 | Support multiple Shop locations where fulfilment, stock or pickup rules differ. | Next | The owner can view and operate the permitted location without mixing stock or orders. |
| SHOP-BIZ-016 | Provide an owner-level portfolio view for multiple businesses only through approved future entitlement. | Later | Business contexts remain isolated and switching is explicit and audited. |

# 15. Customer Web and Mobile Experience

The public customer journey must convert social and search interest into structured orders without forcing application installation. Customer Mobile is an optional retention and cross-business convenience layer.

## Customer Web and Mobile Experience Requirements: CUS

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-CUS-001 | Make Customer Web the default low-friction buying surface for shared Shop links, QR codes, social traffic and search results. | MVP | A first-time buyer can browse and place an order without installing an app. |
| SHOP-CUS-002 | Allow guest checkout where merchant risk rules permit. | MVP | The buyer can order with the minimum contact and fulfilment information required. |
| SHOP-CUS-003 | Allow optional customer authentication by phone, email or approved identity method. | Next | Authentication recovers eligible orders and preferences without creating duplicate customers. |
| SHOP-CUS-004 | Present merchant identity, contact, fulfilment expectations, payment state, policies and applicable trust indicators before purchase. | MVP | The buyer can understand who is selling and what to expect before committing. |
| SHOP-CUS-005 | Provide mobile-first category, search, product, cart, checkout, confirmation and order-status experiences. | MVP | Core customer pages meet responsive and performance acceptance criteria on supported phones. |
| SHOP-CUS-006 | Preserve cart and checkout progress through refresh, interruption and recoverable payment failure. | MVP | A buyer can resume without duplicating an order or losing selected items within retention rules. |
| SHOP-CUS-007 | Display exact payment confidence language and never present customer-reported or initiated payment as verified. | MVP | Customer and merchant surfaces show consistent payment states. |
| SHOP-CUS-008 | Allow a buyer to contact the merchant through approved channels without exposing private staff contact details. | MVP | Contact routes use configured business contacts or controlled messaging. |
| SHOP-CUS-009 | Provide accessible order tracking through a secure link. | MVP | The link exposes only the relevant order and requires additional verification for sensitive changes. |
| SHOP-CUS-010 | Allow a buyer to request cancellation, return, refund or support according to merchant policy. | Next | The request creates a traceable workflow and does not silently change financial records. |
| SHOP-CUS-011 | Provide digital receipts, invoices and payment confirmations from the shared Documents capability. | MVP | The document total and status reconcile to the order and payment records. |
| SHOP-CUS-012 | Allow Customer Mobile users to save businesses, products and service providers across AscendSME. | Next | Saved items remain user-controlled and do not imply marketing consent. |
| SHOP-CUS-013 | Allow Customer Mobile users to view cross-business orders, bookings, receipts and messages in one customer account. | Next | Data remains partitioned by merchant and consent while presented in a unified customer history. |
| SHOP-CUS-014 | Use Customer Mobile recommendations only when sufficient consent and data quality exist. | Later | The user can understand and control recommendation and marketing preferences. |
| SHOP-CUS-015 | Never require Customer Mobile for payment, order tracking, receipt access or support. | MVP | Equivalent essential customer functions remain available through secure web links. |
| SHOP-CUS-016 | Provide clear merchant-responsibility language for Discover and Shop transactions. | MVP | Customers understand that the merchant is the seller and fulfils the order unless another arrangement is explicitly stated. |
| SHOP-CUS-017 | Support customer language, accessibility and low-bandwidth preferences where configured. | Next | The customer can use an approved localised and reduced-data experience. |
| SHOP-CUS-018 | Provide customer data access, correction and deletion request routes subject to legal and transaction-retention requirements. | Next | Requests are logged, verified and completed according to policy. |

# 16. Catalogue-First Merchant Onboarding

Create value before requesting completeness. The merchant starts with product photographs, sees a credible Shop preview and completes only the minimum information required to activate trading.

## Catalogue-First Merchant Onboarding Requirements: ONB

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-ONB-001 | Provide a direct Create My Shop entry that does not require the merchant to understand the wider AscendSME tool catalogue. | MVP | The entry opens the Shop builder and keeps unrelated platform diagnostics out of the critical path. |
| SHOP-ONB-002 | Allow the merchant to begin catalogue creation before completing a full business profile. | MVP | The merchant can upload images and create draft products without entering registration, TIN, employee or funding-readiness information. |
| SHOP-ONB-003 | Request a phone number or email only when needed to save, protect and recover the draft. | MVP | The reason is explained in plain language and the verified contact can resume the same draft. |
| SHOP-ONB-004 | Support OTP, magic-link or another low-friction verification method approved by the platform. | MVP | Verification creates or secures one onboarding identity without forcing password creation in the first value step. |
| SHOP-ONB-005 | Support product capture from phone camera, gallery and file upload. | MVP | Images from each supported source can be previewed, removed and retried. |
| SHOP-ONB-006 | Support multiple image uploads and allow the merchant to identify images that show the same product. | MVP | The merchant can group or separate images before product drafts are finalised. |
| SHOP-ONB-007 | Automatically create editable draft products from uploaded images through an approved AI-assisted process. | MVP | Each successfully processed product returns a draft card without publishing it. |
| SHOP-ONB-008 | Show clear processing states for uploading, analysing, ready, needs review and failed. | MVP | The merchant always knows which products are usable and what action is required. |
| SHOP-ONB-009 | Present generated products in a visual review interface with image, title, description, category, price and optional stock. | MVP | The merchant can edit required fields directly without opening a long advanced form. |
| SHOP-ONB-010 | Provide batch price entry and rapid review for first-session products. | MVP | The merchant can price multiple products from one screen and validation identifies missing prices. |
| SHOP-ONB-011 | Require only image, product name and selling price for a standard product to be publication-ready. | MVP | Non-critical catalogue fields do not block first publication. |
| SHOP-ONB-012 | Allow made-to-order selection instead of requiring stock quantity. | MVP | A made-to-order product can publish with a merchant-confirmed lead-time rule or approved default. |
| SHOP-ONB-013 | Generate a storefront preview immediately after the merchant has at least one publication-ready product. | MVP | Preview uses the current draft catalogue and remains private until activation. |
| SHOP-ONB-014 | Collect only the minimum activation fields: shop name, verified customer contact, fulfilment option, at least one payment option and required terms or privacy consent. | MVP | A merchant can activate without completing readiness or compliance questions that are not required for trading. |
| SHOP-ONB-015 | Collect conditional information only when the selected option requires it. | MVP | Pickup requires a pickup location; merchant delivery requires delivery settings; made-to-order requires fulfilment expectations. |
| SHOP-ONB-016 | Move detailed business identity, registration, TIN, staffing, bank-account and readiness questions into progressive post-activation setup. | MVP | Skipping these fields does not block publication and the platform can request them later with a clear benefit. |
| SHOP-ONB-017 | Save progress after every meaningful merchant action. | MVP | Closing the browser or app does not remove uploaded images, accepted edits or entered prices. |
| SHOP-ONB-018 | Provide a secure recovery link that returns the merchant to the last completed step. | MVP | Recovery restores the correct draft and does not expose another merchant’s content. |
| SHOP-ONB-019 | Notify the merchant when a generated catalogue is ready, when setup remains incomplete and before an inactive draft expires. | MVP | Notifications follow consent, frequency and suppression rules and stop after activation. |
| SHOP-ONB-020 | Define and communicate a draft-retention period with warning before deletion. | MVP | The merchant can see the retention rule and abandoned media is deleted according to policy. |
| SHOP-ONB-021 | Support self-service, Account Manager assisted and institutional onboarding using the same catalogue-first model. | MVP | Each path creates equivalent merchant-owned records with source and assisting-user attribution. |
| SHOP-ONB-022 | Generate a unique shop link during activation and allow eligible editing before publication. | MVP | The final slug is unique, validated and reserved atomically. |
| SHOP-ONB-023 | Make activation idempotent and recoverable. | MVP | A retry after interruption cannot create duplicate businesses, shops or products. |
| SHOP-ONB-024 | Provide manual entry and retry when AI analysis fails or confidence is too low. | MVP | The merchant can continue without re-uploading a usable image. |
| SHOP-ONB-025 | Label all generated content as a suggestion until the merchant approves it. | MVP | No AI-generated title, description, category or attribute is published without merchant review. |
| SHOP-ONB-026 | Never infer price, stock, regulatory approval, authenticity, warranty or unsupported product claims from an image. | MVP | These values remain blank or explicitly merchant-entered. |
| SHOP-ONB-027 | Provide a post-publication launch checklist focused on sharing, testing payment and preparing for the first order. | MVP | The first next action is Share Shop, not a full business diagnostic. |
| SHOP-ONB-028 | Record onboarding source, generated-draft counts, assisting user, activation timestamp and recovery outcomes. | MVP | Authorised teams can evaluate funnel quality without treating analytics as business evidence. |

# 17. Business Identity and Shop Profile

The Shop is the customer-facing commerce presentation of the canonical business identity. Trading presentation can be flexible while verified business identity remains controlled and traceable.

## Business Identity and Shop Profile Requirements: ID

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-ID-001 | Collect the customer-facing shop name during activation and allow legal or registered identity to be completed later. | MVP | The public trading name and later verified business identity remain distinct but linked. |
| SHOP-ID-002 | Prefill contact information from the verified onboarding identity and allow the merchant to choose the public phone or WhatsApp number. | MVP | The merchant can correct the public contact without losing account ownership. |
| SHOP-ID-003 | Support optional logo, cover image, short description, email and social links after activation. | MVP | Missing brand fields do not block the first Shop launch. |
| SHOP-ID-004 | Collect Ghana Post GPS, textual location, delivery area or pickup instructions only when relevant to the fulfilment choice. | MVP | The buyer sees only merchant-approved public location information. |
| SHOP-ID-005 | Allow store operating status to be Open, Temporarily Paused or Closed. | MVP | Paused stores remain viewable but cannot accept new orders. |
| SHOP-ID-006 | Display business verification, MOT or Trust signals only according to approved platform rules. | MVP | No unverified or misleading trust badge can be manually enabled. |
| SHOP-ID-007 | Support business policies for delivery, returns, refunds, privacy and terms using clear defaults and progressive editing. | MVP | Required policies are available before checkout and versioned when changed. |
| SHOP-ID-008 | Allow the merchant to configure expected response time. | Next | The public value and actual performance reporting remain distinct. |
| SHOP-ID-009 | Maintain an audit history for identity, contact and payment-detail changes. | MVP | Authorised users can see who changed sensitive fields and when. |
| SHOP-ID-010 | Request registration, TIN, business account and readiness details only when they unlock a clearly explained benefit or are legally required. | MVP | The request identifies the benefit and does not retroactively hide an otherwise valid Shop. |

# 18. Catalogue, AI and Product Management

The shared catalogue serves Shop, POS, Documents and Inventory. AI reduces setup effort but never becomes the authority for price, stock, authenticity, safety or merchant claims.

## Catalogue, AI and Product Management Requirements: CAT

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-CAT-001 | Create products as draft, active, hidden or archived. | MVP | Only active products appear publicly and archived products remain in historical orders. |
| SHOP-CAT-002 | Use product image, merchant-approved name and selling price as the minimum first-session publication fields. | MVP | Validation identifies exactly which minimum field is missing. |
| SHOP-CAT-003 | Support multiple product images, image reordering, cover selection and merchant-confirmed grouping of images for the same product. | MVP | The selected image order and grouping are reflected in the draft and storefront. |
| SHOP-CAT-004 | Generate suggested title, short description, category and visible attributes from product images. | MVP | Successful analysis returns structured, editable suggestions for each draft product. |
| SHOP-CAT-005 | Clearly label generated catalogue content as suggested and allow direct merchant correction. | MVP | The merchant can replace every generated field before publication. |
| SHOP-CAT-006 | Prohibit AI inference of price, stock, dimensions, material certainty, brand certainty, authenticity, warranty, ingredients, health claims or regulatory approval without reliable merchant-provided evidence. | MVP | Restricted fields remain blank, qualified or merchant-entered. |
| SHOP-CAT-007 | Store confidence and needs-review status for generated fields without showing technical scoring that confuses the merchant. | MVP | Low-confidence products receive a clear review prompt and cannot silently publish. |
| SHOP-CAT-008 | Provide retry, regenerate and manual-entry fallback for failed or unsuitable generated content. | MVP | A processing failure never forces the merchant to discard a valid image. |
| SHOP-CAT-009 | Provide a visual batch-review and batch-price workflow for newly generated products. | MVP | The merchant can approve, edit, remove and price multiple products efficiently. |
| SHOP-CAT-010 | Support descriptions in short and full forms, with the short form prioritised during onboarding. | MVP | Short description appears in cards and full description on product detail when available. |
| SHOP-CAT-011 | Support variants such as size, colour, style, pack or merchant-defined options after the simple product draft is created. | MVP | Variant setup is progressive and does not obstruct a simple first product. |
| SHOP-CAT-012 | Support category and collection assignment, including AI-suggested categories that require merchant approval. | MVP | Products can appear in multiple curated collections without duplication. |
| SHOP-CAT-013 | Support standard price, sale price and optional compare-at price. | MVP | Checkout uses the valid active price and stores the price snapshot. |
| SHOP-CAT-014 | Support product-level stock tracking on or off. | MVP | Non-stocked items can sell without quantity enforcement when allowed. |
| SHOP-CAT-015 | Support made-to-order products and optional lead time. | MVP | Made-to-order status is clear to the buyer and does not require stock quantity. |
| SHOP-CAT-016 | Support low-stock threshold and sold-out behaviour. | MVP | The merchant is alerted and the storefront follows configured sold-out rules. |
| SHOP-CAT-017 | Support weight or delivery-class fields for future fulfilment calculation. | Next | Configured values are available to delivery integrations. |
| SHOP-CAT-018 | Support product duplication to accelerate catalogue creation. | MVP | The duplicate is created as a draft with a new identity. |
| SHOP-CAT-019 | Support bulk price, status, category and stock actions. | Next | Bulk updates are validated and recorded in the audit trail. |
| SHOP-CAT-020 | Optimise uploaded images, generate responsive storefront sizes and preserve protected originals according to policy. | MVP | Images remain visually usable on target mobile networks. |
| SHOP-CAT-021 | Support catalogue import and export for merchants who already have structured product data. | Next | Exports contain stable identifiers and re-import does not create unintended duplicates. |
| SHOP-CAT-022 | Prevent deletion of a product referenced by historical orders. | MVP | The product can be archived but historical order lines remain intact. |
| SHOP-CAT-023 | Record the AI model version, processing timestamp and original generated output for quality review and audit. | MVP | Authorised teams can trace generation without exposing provider secrets. |
| SHOP-CAT-024 | Treat merchant-approved catalogue content as the publishable source of truth. | MVP | Later AI regeneration cannot overwrite merchant edits without explicit confirmation. |

## Catalogue, AI and Product Management Requirements: AI

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-AI-001 | Use AI to suggest product names, descriptions, categories and visible attributes from merchant-provided images and context. | MVP | Suggestions remain editable drafts and are not published automatically. |
| SHOP-AI-002 | Require merchant entry or confirmation for price, stock, authenticity, regulatory status, warranty and other unsupported claims. | MVP | The system never fabricates these fields from images. |
| SHOP-AI-003 | Show field-level confidence or review emphasis when the approved model supports it. | Next | Low-confidence suggestions are visibly prioritised for merchant review. |
| SHOP-AI-004 | Allow merchants to regenerate, shorten, expand or change the tone of supported catalogue text. | Next | Generated versions are traceable and the merchant chooses the final content. |
| SHOP-AI-005 | Support batch creation while preserving the ability to group several images under one product. | MVP | The merchant can correct image grouping before final product creation. |
| SHOP-AI-006 | Use approved product context, business category and merchant corrections to improve subsequent suggestions within policy. | Next | Personalisation is consented, bounded to the business and can be reset. |
| SHOP-AI-007 | Prevent generation of prohibited, unsafe, misleading or discriminatory catalogue content. | MVP | Blocked or flagged output follows moderation and merchant recovery rules. |
| SHOP-AI-008 | Provide manual continuation when an AI provider is unavailable, slow or uncertain. | MVP | AI failure never blocks catalogue creation or publication. |
| SHOP-AI-009 | Deduct Ascend Balance only for clearly priced paid AI actions outside included allowances. | MVP | The merchant confirms the cost before the variable-cost action begins. |
| SHOP-AI-010 | Do not deduct balance for provider failure, duplicate processing or an unusable result caused by the system. | MVP | Failed eligible actions are not charged or are automatically reversed. |
| SHOP-AI-011 | Track AI suggestion acceptance and merchant correction without treating it as business-performance evidence. | MVP | Product analytics and the Evidence Ledger remain separate. |
| SHOP-AI-012 | Retain source media and generated metadata according to merchant controls and retention policy. | MVP | Deletion or replacement updates references without orphaning active products. |
| SHOP-AI-013 | Allow institutional programmes to sponsor AI allowances without changing merchant ownership of the catalogue. | Next | Sponsor-funded usage is attributed and expires independently of merchant records. |
| SHOP-AI-014 | Version AI providers, prompts and output schemas for audit and safe migration. | Next | The team can identify which configuration produced a draft without exposing protected prompt internals. |
| SHOP-AI-015 | Provide human-assisted catalogue services as a paid or sponsored implementation option. | Next | Assisted output uses the same draft, review and ownership rules as self-service creation. |
| SHOP-AI-016 | Require evaluation against Ghanaian and target-market product language, naming and imagery before major model changes. | Next | Release evidence demonstrates acceptable quality for defined merchant cohorts. |

# 19. Inventory and Cross-Set Stock Sharing

Shop and POS must consume one location-aware inventory ledger. Reservations, fulfilment, returns and corrections are movements rather than uncontrolled quantity overwrites.

## Inventory and Cross-Set Stock Sharing Requirements: INV

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-INV-001 | Use the shared catalogue and inventory identity across Shop and POS. | MVP | The same product and variant identifiers are used by both sets. |
| SHOP-INV-002 | Reserve stock when the platform creates an order according to the configured payment and reservation policy. | MVP | Available stock is reduced by a valid reservation without changing physical stock until fulfilment. |
| SHOP-INV-003 | Release reservations when an order expires, is cancelled or payment fails. | MVP | Stock becomes available once and duplicate release is prevented. |
| SHOP-INV-004 | Create an inventory movement when an order is fulfilled or collected. | MVP | The movement references the order and cannot be duplicated. |
| SHOP-INV-005 | Prevent checkout when requested quantity exceeds available stock, unless pre-order is enabled. | MVP | The buyer receives a clear availability message and cannot submit an invalid order. |
| SHOP-INV-006 | Support an oversell safety buffer for merchants with uncertain stock. | Next | The configured buffer is applied consistently across sales channels. |
| SHOP-INV-007 | Provide stock conflict alerts when offline POS activity causes online availability differences. | Next | The merchant receives a resolution task and no historical sale is silently removed. |
| SHOP-INV-008 | Support stock tracking by location in the expansion release. | Later | Orders can be allocated to an eligible fulfilment location. |
| SHOP-INV-009 | Expose inventory health to reports and evidence without rewarding artificial stock adjustments. | MVP | Evidence distinguishes sales, restocks, corrections and reversals. |

# 20. Storefront, Themes and Business Website

Merchants receive a polished, constrained and credible presentation system rather than a complex website builder. The one-page business site remains a view of shared business and catalogue data.

## Storefront, Themes and Business Website Requirements: STORE

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-STORE-001 | Provide mobile-first storefront templates with consistent accessibility and checkout behaviour. | MVP | All templates pass the same functional and performance tests. |
| SHOP-STORE-002 | Allow logo, cover image, brand colour and approved type style selection. | MVP | Changes preview before publication and maintain contrast requirements. |
| SHOP-STORE-003 | Provide a store home with featured products, categories, collections and business summary. | MVP | The merchant can control content order within supported limits. |
| SHOP-STORE-004 | Provide product cards with image, name, current price, availability and sale state. | MVP | Cards remain readable across supported screen sizes. |
| SHOP-STORE-005 | Provide product detail with gallery, description, variants, quantity, fulfilment information and add-to-cart. | MVP | Variant and price changes update before addition to cart. |
| SHOP-STORE-006 | Show AscendSME branding according to the merchant’s entitlement. | MVP | Brand removal cannot be enabled without the required capability. |
| SHOP-STORE-007 | Support announcement banner and store notice. | Next | Notices can be scheduled and disabled without code changes. |
| SHOP-STORE-008 | Support custom pages for About, Contact and policies. | MVP | Pages are editable and publicly reachable. |
| SHOP-STORE-009 | Provide store preview for common phone widths. | MVP | The preview uses current draft content and indicates unpublished changes. |

## Storefront, Themes and Business Website Requirements: HOME

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-HOME-001 | Make New Orders and actions requiring attention the primary merchant home content. | MVP | A merchant can reach the next operational action in one tap. |
| SHOP-HOME-002 | Show today’s paid sales, order count, pending payment, preparing orders and low-stock count. | MVP | Metrics use clear definitions and current business timezone. |
| SHOP-HOME-003 | Show connectivity and data freshness when information may be stale. | MVP | The merchant can distinguish current server data from cached data. |
| SHOP-HOME-004 | Provide quick actions for Add Product, Share Store, View Store and Create Order. | MVP | Each quick action is permission-aware. |
| SHOP-HOME-005 | Avoid exposing broad AscendSME tools on the main Shop home. | MVP | Other sets are available through contextual navigation or More. |
| SHOP-HOME-006 | Provide onboarding and adoption prompts until essential setup is complete. | MVP | Prompts disappear when their conditions are satisfied. |
| SHOP-HOME-007 | Provide an operational calendar or schedule only when relevant capabilities are installed. | Later | The Shop experience remains uncluttered for merchants who do not need it. |

## Storefront, Themes and Business Website Requirements: WEB

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-WEB-001 | Allow eligible merchants to activate a one-page business site connected to the store. | Next | Activation creates no duplicate catalogue or business profile. |
| SHOP-WEB-002 | Provide sections for hero, business story, featured products, trust indicators, contact and social links. | Next | The merchant can enable, disable and reorder supported sections. |
| SHOP-WEB-003 | Embed live products and collections from Ascend Shop. | Next | Price and availability changes update without manual website editing. |
| SHOP-WEB-004 | Support a platform subdomain and optional custom domain. | Next | Domain connection includes ownership verification and secure HTTPS. |
| SHOP-WEB-005 | Provide basic SEO fields and generated metadata. | Next | Page title, description, canonical URL and social preview render correctly. |
| SHOP-WEB-006 | Support lead or enquiry capture when a visitor is not ready to buy. | Next | Consented enquiries create shared CRM records with source attribution. |

# 21. Social Commerce and Shareable Selling

Ascend Shop complements WhatsApp, Instagram, TikTok and Facebook. Social platforms create attention, while Shop provides a persistent catalogue, checkout, order record and customer history.

## Social Commerce and Shareable Selling Requirements: SOC

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-SOC-001 | Provide a persistent store link and product-specific share links. | MVP | Links open the correct store or product and preserve attribution parameters. |
| SHOP-SOC-002 | Provide native share actions for WhatsApp and browser-supported channels. | MVP | The shared message includes a useful title and link. |
| SHOP-SOC-003 | Generate social preview metadata and product images for link unfurling. | MVP | Supported platforms display a recognisable preview after cache refresh. |
| SHOP-SOC-004 | Allow a merchant to copy catalogue and checkout links easily. | MVP | Copy confirmation is visible and keyboard accessible. |
| SHOP-SOC-005 | Support WhatsApp enquiry from a product page with product context. | MVP | The generated message identifies the selected product and store. |
| SHOP-SOC-006 | Capture source and campaign parameters where available. | MVP | Orders and visits can be attributed without exposing personal data improperly. |
| SHOP-SOC-007 | Support shareable collection links. | Next | The link displays only the selected collection with store context. |
| SHOP-SOC-008 | Support quick order creation from a merchant-assisted WhatsApp conversation. | Next | The merchant can create a draft order and send a secure review or payment link. |
| SHOP-SOC-009 | Avoid dependence on unofficial scraping or automated posting methods that violate external platform rules. | MVP | No restricted automation is required for core commerce operation. |

# 22. Storefront Discovery and Merchandising

Each merchant Shop must help customers find relevant products through search, categories, collections, featured content and honest availability.

## Storefront Discovery and Merchandising Requirements: DISC

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-DISC-001 | Provide keyword search over product name, description, SKU and category. | MVP | Relevant active products are returned within the performance target. |
| SHOP-DISC-002 | Provide category and collection browsing. | MVP | Navigation state persists when returning from product detail. |
| SHOP-DISC-003 | Support sorting by relevance, newest, price and popularity where data is sufficient. | Next | Sorting is deterministic and does not expose hidden products. |
| SHOP-DISC-004 | Allow the merchant to feature products and collections. | MVP | Featured content appears in the configured storefront positions. |
| SHOP-DISC-005 | Provide related products using category or merchant-curated relationships. | Next | Recommendations exclude inactive and unavailable products as configured. |
| SHOP-DISC-006 | Support sold-out visibility rules. | MVP | The merchant can hide, show or collect interest according to capability. |
| SHOP-DISC-007 | Provide structured product data for search engines where appropriate. | Next | Generated markup reflects actual price and availability. |

# 23. Cart and Checkout

Checkout must be brief, transparent, interruption-tolerant and precise about order, payment and fulfilment states.

## Cart and Checkout Requirements: CHK

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-CHK-001 | Maintain a cart for the current store and device session. | MVP | A buyer can leave a product page and return to the same valid cart. |
| SHOP-CHK-002 | Prevent products from different stores from sharing one cart. | MVP | Adding from another store prompts a clear cart replacement decision. |
| SHOP-CHK-003 | Validate price, availability and promotion eligibility before order submission. | MVP | The buyer sees changes and must confirm the current total. |
| SHOP-CHK-004 | Collect only necessary buyer fields based on fulfilment and payment choices. | MVP | Pickup does not require delivery-only fields. |
| SHOP-CHK-005 | Support guest checkout. | MVP | An account is not required to place a standard order. |
| SHOP-CHK-006 | Support phone number as the primary contact field with country-code handling. | MVP | Valid Ghana and configured regional numbers are normalised. |
| SHOP-CHK-007 | Show item subtotal, discount, delivery charge, payment fee if permitted, and total before submission. | MVP | The displayed and stored totals match the order calculation. |
| SHOP-CHK-008 | Require explicit acceptance of applicable policies. | MVP | The order stores the policy version accepted by the buyer. |
| SHOP-CHK-009 | Prevent duplicate order submission from repeated taps or network retries. | MVP | One idempotency key creates at most one accepted order. |
| SHOP-CHK-010 | Provide a recovery path after interrupted payment or checkout. | MVP | The buyer can safely resume or start a new payment without duplicate paid orders. |
| SHOP-CHK-011 | Support merchant-defined optional order notes. | MVP | Notes are visible in order operations and protected from unsafe rendering. |
| SHOP-CHK-012 | Support discount codes in the commercial release. | Next | Codes validate scope, dates, limits and usage atomically. |

# 24. Payments and Payment Confirmation

Ascend Shop supports Ghanaian and African payment behaviour while clearly separating provider-confirmed, merchant-confirmed, customer-reported and unverified payment.

## Payments and Payment Confirmation Requirements: PAY

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-PAY-001 | Support cash on pickup or delivery when enabled by the merchant. | MVP | The order remains unpaid until authorised collection confirmation. |
| SHOP-PAY-002 | Support merchant-provided Mobile Money payment instructions. | MVP | Instructions display safely and payment remains unverified until confirmation. |
| SHOP-PAY-003 | Support integrated payment links through approved providers where available. | MVP | Provider callback or verification determines the confirmed state. |
| SHOP-PAY-004 | Create a unique payment attempt for each initiated payment. | MVP | Multiple attempts can exist without duplicating the order or paid amount. |
| SHOP-PAY-005 | Store provider reference, amount, currency, status and verification timestamp. | MVP | Authorised users can reconcile payment evidence to the order. |
| SHOP-PAY-006 | Prevent fulfilment automation from treating customer-reported payment as provider-confirmed. | MVP | Rules use explicit payment confidence states. |
| SHOP-PAY-007 | Allow an authorised merchant to confirm a manual payment with reference or evidence. | MVP | The confirmation records actor, time, method and supporting reference. |
| SHOP-PAY-008 | Support partial payment or deposit in the commercial release. | Next | Outstanding balance and fulfilment rules calculate correctly. |
| SHOP-PAY-009 | Support payment expiry and retry. | MVP | Expired attempts cannot later mark the order paid without new verification. |
| SHOP-PAY-010 | Generate a receipt only for an amount recorded as paid. | MVP | Receipt totals equal confirmed collected amounts. |
| SHOP-PAY-011 | Create ledger and evidence events only after the applicable payment state transition. | MVP | Duplicate callbacks do not duplicate finance or evidence entries. |
| SHOP-PAY-012 | Support refunds through provider integration or recorded external refund. | Next | Refund state, amount and method are linked to original payment. |
| SHOP-PAY-013 | Do not store sensitive card credentials in AscendSME. | MVP | Card entry, when offered, is handled by an approved provider surface. |

# 25. Orders and Order Lifecycle

Orders are the operational centre of Shop. Their states must represent real business events and coordinate with payments, stock, documents, fulfilment and evidence.

## Orders and Order Lifecycle Requirements: ORD

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-ORD-001 | Generate a human-readable order reference and immutable internal identifier. | MVP | References are unique within the business and internal IDs remain globally unique. |
| SHOP-ORD-002 | Create orders with line-item snapshots of product name, variant, quantity, price and tax or fee treatment. | MVP | Historical orders do not change when the catalogue changes. |
| SHOP-ORD-003 | Support order states: Pending Payment, Payment Review, Confirmed, Preparing, Ready, Out for Delivery, Fulfilled, Cancelled, Returned and Refunded as applicable. | MVP | Only valid transitions are permitted. |
| SHOP-ORD-004 | Separate order state from payment state and fulfilment state. | MVP | A paid order can still be preparing and an unpaid cash order can be confirmed under policy. |
| SHOP-ORD-005 | Show merchants an action-focused queue ordered by urgency. | MVP | New and overdue actions are visible without opening each order. |
| SHOP-ORD-006 | Allow authorised staff to add internal notes and buyer-visible updates separately. | MVP | Internal notes are never shown publicly. |
| SHOP-ORD-007 | Record every status change with actor, timestamp and source. | MVP | The audit timeline is complete and immutable to normal users. |
| SHOP-ORD-008 | Allow print or downloadable order summary. | MVP | The summary contains current fulfilment and payment state. |
| SHOP-ORD-009 | Allow merchant-assisted order creation. | Next | The buyer can review or receive confirmation before payment where required. |
| SHOP-ORD-010 | Support order search by reference, customer, phone and product. | MVP | Results are limited to the current business and authorised locations. |
| SHOP-ORD-011 | Support order filtering by state, date, payment and fulfilment method. | MVP | Counts and result sets remain consistent. |
| SHOP-ORD-012 | Provide bulk operational actions only where transitions are safe. | Next | Unsafe mixed-state orders are excluded or require individual review. |

# 26. Fulfilment, Delivery and Pickup

The merchant remains responsible for fulfilment unless a specific partner programme states otherwise. AscendSME structures the workflow and evidence without pretending to own every delivery.

## Fulfilment, Delivery and Pickup Requirements: FUL

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-FUL-001 | Support pickup, merchant-arranged delivery and integrated delivery as separate fulfilment modes. | MVP | The merchant can enable one or more modes with clear buyer selection. |
| SHOP-FUL-002 | Collect delivery address, landmark, phone and optional Ghana Post GPS when delivery is selected. | MVP | Required fields adapt to the configured delivery mode. |
| SHOP-FUL-003 | Support fixed, area-based or manually confirmed delivery fee in the initial commercial model. | MVP | The buyer knows whether the fee is final before placing the order. |
| SHOP-FUL-004 | Allow the merchant to define service areas and excluded areas. | MVP | Checkout blocks unsupported destinations with a clear message. |
| SHOP-FUL-005 | Provide expected preparation and fulfilment times. | MVP | Expectations appear before checkout and in confirmation. |
| SHOP-FUL-006 | Allow the merchant to mark an order Ready, Collected, Out for Delivery or Delivered. | MVP | Each transition creates a fulfilment event and appropriate notification. |
| SHOP-FUL-007 | Capture delivery provider, rider reference and proof where integrated. | Next | Evidence is linked to the order without exposing sensitive rider data publicly. |
| SHOP-FUL-008 | Support customer pickup code or confirmation in the commercial release. | Next | The code cannot be reused and does not replace staff authorisation. |
| SHOP-FUL-009 | Support partial fulfilment only in a later release. | Later | Line-level fulfilment maintains correct stock and payment accounting. |

# 27. Returns, Refunds and Cancellations

Corrections must preserve financial and operational history. Refund, return and cancellation are related but distinct events.

## Returns, Refunds and Cancellations Requirements: RET

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-RET-001 | Allow cancellation before fulfilment according to merchant policy and payment state. | MVP | The system explains whether automatic cancellation is available or review is required. |
| SHOP-RET-002 | Require a reason for merchant cancellation. | MVP | The reason is recorded for operations and evidence quality. |
| SHOP-RET-003 | Release inventory reservations exactly once after valid cancellation. | MVP | Repeated actions do not increase available stock incorrectly. |
| SHOP-RET-004 | Support full return and refund in the commercial release. | Next | Returned quantity, condition, refund amount and stock treatment are captured. |
| SHOP-RET-005 | Support partial return and refund later. | Later | Line-level financial and inventory adjustments reconcile to the original order. |
| SHOP-RET-006 | Create reversal events rather than deleting original commerce evidence. | MVP | Original events remain auditable and net reporting is correct. |
| SHOP-RET-007 | Allow dispute and refund notes with supporting files. | Next | Files follow access and retention rules. |
| SHOP-RET-008 | Exclude cancelled unpaid orders from recognised revenue. | MVP | Financial reports and MOT inputs use valid paid or recognised activity only. |

# 28. Customers, CRM and Consent

Shop interactions enrich the shared customer record while respecting consent, purpose limitation and merchant boundaries.

## Customers, CRM and Consent Requirements: CRM

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-CRM-001 | Create or match a shared customer profile from checkout using normalised contact data. | MVP | The system avoids obvious duplicates and records match confidence. |
| SHOP-CRM-002 | Store order history, total paid, fulfilment outcomes and source attribution. | MVP | Authorised merchant users can view business-relevant history. |
| SHOP-CRM-003 | Separate transactional communication permission from marketing consent. | MVP | A buyer can receive order updates without being automatically subscribed to marketing. |
| SHOP-CRM-004 | Provide opt-in and opt-out capture with timestamp and source. | MVP | Marketing actions exclude opted-out customers. |
| SHOP-CRM-005 | Allow the merchant to add tags and notes. | Next | Notes are internal and role-restricted. |
| SHOP-CRM-006 | Support customer export under business and privacy rules. | Next | Exports are logged and limited to authorised roles. |
| SHOP-CRM-007 | Provide repeat-customer and retention metrics. | Next | Metrics use matched profiles and explain data limitations. |
| SHOP-CRM-008 | Allow customer-requested correction or deletion subject to legal retention requirements. | Next | The process preserves required financial records while handling personal data appropriately. |

# 29. Merchant Promotions and Offers

Merchant-defined discounts and recovery offers support conversion inside the Shop. They are distinct from paid placement through Ascend Discover.

## Merchant Promotions and Offers Requirements: PROMO

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-PROMO-001 | Support product sale prices with start and end times. | MVP | The active price changes automatically and historical order prices remain fixed. |
| SHOP-PROMO-002 | Support promotion codes by percentage or fixed amount. | Next | Eligibility, minimum order, expiry and usage limits are enforced atomically. |
| SHOP-PROMO-003 | Support merchant-defined maximum discount. | Next | The final discount cannot exceed configured or commercial limits. |
| SHOP-PROMO-004 | Support collection or product restrictions. | Next | Ineligible cart lines are excluded or the code is rejected with explanation. |
| SHOP-PROMO-005 | Track promotion performance and net revenue. | Next | Reports distinguish gross sales, discounts and net collected amount. |
| SHOP-PROMO-006 | Prevent stacking unless explicitly configured. | Next | Checkout applies the permitted combination deterministically. |
| SHOP-PROMO-007 | Support abandoned-cart recovery messaging only with appropriate consent and capability. | Next | Messages are rate-limited, logged and suppressible. |

# 30. Ascend Discover and Promote with Ascend

Ascend Discover gives merchants an understandable growth path. Businesses receive organic eligibility and can pay to increase visibility while remaining the seller and fulfilment owner.

## Ascend Discover and Promote with Ascend Requirements: ADX

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-ADX-001 | Integrate eligible Shop products and merchant profiles into Ascend Discover without duplicating the catalogue or business identity. | MVP | Discover references canonical Shop and business records. |
| SHOP-ADX-002 | Provide an organic listing path for eligible active businesses and products. | MVP | A merchant can receive basic Discover visibility without purchasing promotion. |
| SHOP-ADX-003 | Define eligibility using publication quality, fulfilment capability, policy compliance, trust signals and moderation status. | MVP | Eligibility decisions are explainable and cannot be purchased. |
| SHOP-ADX-004 | Keep Sponsored, Verified, Trusted and Ascend Pick labels visually and logically distinct. | MVP | A paid placement cannot appear verified solely because it is sponsored. |
| SHOP-ADX-005 | Allow merchants to promote a product, collection, Shop or approved campaign through Promote with Ascend. | MVP | The merchant selects the objective, asset, audience scope, duration and price before payment. |
| SHOP-ADX-006 | Support fixed-price pilot promotion products such as Product Boost, Shop Boost and Spotlight. | MVP | Each promotion has a clear duration, included placement and reporting definition. |
| SHOP-ADX-007 | Support country, city, locality, category, collection and seasonal targeting where audience size permits. | Next | The system prevents targeting that is unsupported, misleading or too narrow to deliver. |
| SHOP-ADX-008 | Use Ascend Balance as the default prepaid payment method for self-service promotion. | MVP | The promotion cannot begin without sufficient confirmed balance or approved sponsor funding. |
| SHOP-ADX-009 | Allow sponsor-funded and institution-funded campaigns with separate attribution and reporting. | Next | Merchant, sponsor and Ascend-funded spend are distinguishable. |
| SHOP-ADX-010 | Rank organic and sponsored content through documented rules that protect relevance, safety and merchant diversity. | MVP | Paid content cannot bypass prohibited-item, quality or trust controls. |
| SHOP-ADX-011 | Label all paid placement clearly on every customer surface. | MVP | Sponsored content is recognisable without opening a detail page. |
| SHOP-ADX-012 | Provide campaign preview before launch. | MVP | The merchant sees the promoted asset, audience scope, duration, price and expected placement. |
| SHOP-ADX-013 | Provide campaign states for draft, scheduled, under review, active, paused, completed, rejected and refunded. | MVP | Every state change is traceable and customer-facing delivery occurs only when active. |
| SHOP-ADX-014 | Provide merchant reporting for impressions, product or Shop visits, add-to-cart, orders and attributable revenue where data is sufficient. | MVP | Reports separate observed attribution from inferred or unavailable results. |
| SHOP-ADX-015 | Use defined attribution windows and prevent duplicate conversion credit. | MVP | One order is not counted repeatedly across the same campaign objective. |
| SHOP-ADX-016 | Allow social media or editorial amplification as a separately defined Spotlight service. | Next | The merchant understands that placement is reviewed and not an automatic result of payment. |
| SHOP-ADX-017 | Provide curated collections for seasonal, sector, location, sponsor and editorial themes. | Next | Collection inclusion rules, duration and sponsorship are visible to authorised teams. |
| SHOP-ADX-018 | Allow merchants to pause eligible promotions and preserve unused value according to the offer terms. | Next | Pause and refund logic is clear before purchase and applied consistently. |
| SHOP-ADX-019 | Reject or remove misleading, unsafe, counterfeit, prohibited or materially inaccurate promotions. | MVP | Moderation actions preserve audit history and follow appeal rules. |
| SHOP-ADX-020 | Provide a merchant appeal route for Discover eligibility and promotion moderation decisions. | Next | Appeals are reviewed independently and do not guarantee reinstatement. |
| SHOP-ADX-021 | Protect smaller merchants from permanent exclusion by large-spend advertisers through diversity and frequency controls. | Next | Ranking tests monitor concentration and repeated exposure. |
| SHOP-ADX-022 | Allow customer feedback and reporting of Discover listings without publishing unverified allegations. | Next | Reports enter moderation workflows and do not automatically change trust status. |
| SHOP-ADX-023 | Keep Discover as a discovery and promotion layer rather than making AscendSME the seller of record in the initial release. | MVP | Merchant terms and customer pages identify the merchant as seller and fulfilment owner. |
| SHOP-ADX-024 | Do not automatically guarantee delivery, product quality, refund or merchant performance unless a specific programme states otherwise. | MVP | Customer communication accurately describes AscendSME's role. |
| SHOP-ADX-025 | Provide admin tools for inventory review, campaign approval, featured collections, refunds, credits and placement audits. | MVP | Authorised staff can review delivery and financial records without editing merchant source data improperly. |
| SHOP-ADX-026 | Track Discover adoption, paid promotion conversion and merchant repeat purchase separately. | MVP | The commercial team can measure the first-year 40% promotion-adoption target using a documented denominator. |
| SHOP-ADX-027 | Support future auction, click-based or outcome-based promotion only behind separate commercial and fraud controls. | Later | Fixed-price promotions remain unaffected until the new model is validated. |
| SHOP-ADX-028 | Prevent promotion spend from affecting Business Evidence, MOT, Sustainability Score or verification. | MVP | Evidence and scoring pipelines exclude paid-placement entitlement and spend. |
| SHOP-ADX-029 | Allow Discover to surface service providers and other Ascend sets through shared discovery contracts in later releases. | Later | The Shop implementation does not hard-code Discover as product-only infrastructure. |
| SHOP-ADX-030 | Publish promotion pricing and country configuration through the central commercial catalogue. | MVP | A price update applies consistently across merchant channels and preserves purchased campaign terms. |

# 31. Merchant Operations and Action Management

The Shop operating experience should tell the merchant what requires action next, not simply display analytics.

## Merchant Operations and Action Management Requirements: OPS

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-OPS-001 | Provide a unified Shop action queue for new orders, payment review, fulfilment deadlines, customer requests, returns and stock exceptions. | MVP | The queue ranks actions by urgency and business impact and links to the owning record. |
| SHOP-OPS-002 | Separate order, payment and fulfilment states in the merchant interface while explaining their relationship. | MVP | A merchant cannot confuse paid, confirmed, prepared, dispatched and completed states. |
| SHOP-OPS-003 | Allow an owner to assign fulfilment work to a staff member through the shared Work capability. | Next | The assignment does not duplicate the order and is visible in Ascend Office when enabled. |
| SHOP-OPS-004 | Allow a merchant to print or share packing slips, invoices, receipts and delivery notes from the shared Documents capability. | Next | Documents reference the same order and customer identity. |
| SHOP-OPS-005 | Provide business-day and location filters for Shop operations and reporting. | MVP | The selected context is clear and totals do not mix unauthorised locations. |
| SHOP-OPS-006 | Provide order ageing and overdue fulfilment indicators. | MVP | Ageing uses auditable timestamps and configurable expectations. |
| SHOP-OPS-007 | Allow merchants to define operational cut-off times, preparation time and pickup readiness expectations. | Next | Customer promises and internal deadlines use the configured rules. |
| SHOP-OPS-008 | Support customer issue records linked to orders without turning Shop into a full support-ticket platform. | Next | The issue status and outcome remain traceable to the order. |
| SHOP-OPS-009 | Provide stock exception handling when ordered quantity cannot be fulfilled. | MVP | The merchant can substitute, partially fulfil, cancel or contact the customer according to policy. |
| SHOP-OPS-010 | Require reason capture for high-risk manual payment confirmations, cancellations, refunds and inventory corrections. | MVP | The audit record identifies actor, reason and affected amount or quantity. |
| SHOP-OPS-011 | Provide shift or working-context attribution when Shop orders are fulfilled through a POS location or Office team. | Next | Activity can be traced without creating a separate Shop shift system. |
| SHOP-OPS-012 | Provide manager escalation for orders or customer issues that exceed configured thresholds. | Next | Escalations use the shared approval and notification capabilities. |
| SHOP-OPS-013 | Allow merchants to configure automatic low-risk progression only where payment and fulfilment evidence is sufficient. | Later | Automation rules are explainable, reversible and do not bypass required approval. |
| SHOP-OPS-014 | Provide daily Shop summary notifications through Business Mobile and approved messaging channels. | Next | The summary distinguishes orders, collected revenue, pending payments, fulfilment risk and promotion results. |
| SHOP-OPS-015 | Provide operational exports for authorised merchant support and reconciliation. | Next | Exports are time-bounded, permission-controlled and include generation metadata. |
| SHOP-OPS-016 | Maintain an immutable audit trail for operational status changes and corrections. | MVP | History records prior state, new state, actor, source, reason and time. |

# 32. Reporting and Business Insights

Reports distinguish demand, orders, recognised revenue, payment collection, fulfilment and customer continuity. Plain-language recommendations must identify their data basis.

## Reporting and Business Insights Requirements: RPT

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-RPT-001 | Provide sales, collected payment, order and average-order-value summaries by period. | MVP | Definitions distinguish placed orders from paid or recognised sales. |
| SHOP-RPT-002 | Provide product performance by units, revenue and fulfilment outcome. | MVP | Cancelled and returned quantities are shown separately. |
| SHOP-RPT-003 | Provide payment-method breakdown and unconfirmed-payment queue. | MVP | Totals reconcile to payment records. |
| SHOP-RPT-004 | Provide order funnel metrics from placed to paid and fulfilled. | Next | Each stage has a documented event definition. |
| SHOP-RPT-005 | Provide customer metrics for new, repeat and top customers where identity matching is reliable. | Next | Reports disclose when guest or duplicate data reduces confidence. |
| SHOP-RPT-006 | Provide traffic and source metrics for store and product links. | Next | Bots and obvious internal views are filtered where possible. |
| SHOP-RPT-007 | Provide fulfilment-time and cancellation-rate metrics. | Next | Durations use auditable status timestamps. |
| SHOP-RPT-008 | Provide downloadable business reports subject to capability. | Next | Exports use the selected period and include report-generation metadata. |
| SHOP-RPT-009 | Provide plain-language recommendations linked to observable evidence. | Next | Recommendations identify the data basis and do not present speculation as fact. |

# 33. Messaging and Notifications

Messages communicate operational truth and use the shared consent, template, delivery and variable-cost infrastructure.

## Messaging and Notifications Requirements: MSG

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-MSG-001 | Notify the merchant of new orders, payment actions, cancellations and fulfilment deadlines. | MVP | Notifications reflect current state and deep-link to the correct order. |
| SHOP-MSG-002 | Notify the buyer when the order is placed, payment is confirmed, status changes materially and fulfilment completes. | MVP | Messages contain order reference and support contact. |
| SHOP-MSG-003 | Support in-app and email channels in the MVP, with WhatsApp or SMS through configured services. | MVP | Channel delivery status is recorded where the provider supports it. |
| SHOP-MSG-004 | Allow the merchant to enable or disable non-critical reminders. | MVP | Transactional integrity and mandatory security alerts cannot be disabled improperly. |
| SHOP-MSG-005 | Use approved templates with merchant branding variables. | MVP | Template rendering escapes unsafe content and handles missing variables. |
| SHOP-MSG-006 | Rate-limit reminders and promotional messaging. | Next | Repeated events do not trigger excessive duplicate messages. |
| SHOP-MSG-007 | Provide communication history on the order. | Next | Authorised users can view sent, delivered and failed states. |
| SHOP-MSG-008 | Fallback to another configured channel for critical failures where permitted. | Next | Fallback rules avoid duplicate successful delivery. |
| SHOP-MSG-009 | Send consented draft-recovery notifications when the catalogue is ready or activation remains incomplete. | MVP | The message opens the correct draft and is suppressed after activation. |
| SHOP-MSG-010 | Warn the merchant before an inactive catalogue draft reaches its deletion date. | MVP | The warning states the date and provides resume or delete options. |
| SHOP-MSG-011 | Rate-limit onboarding recovery messages and respect opt-out choices. | MVP | A merchant does not receive repeated reminders beyond the approved cadence. |

# 34. Roles, Permissions and Multi-User Operations

A solo merchant can operate simply, while growing teams receive least-privilege access, assignment and approval without duplicated staff records.

## Roles, Permissions and Multi-User Operations Requirements: RBAC

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-RBAC-001 | Use shared business roles and Shop capability permissions. | MVP | A role change applies consistently across relevant sets. |
| SHOP-RBAC-002 | Restrict payment-detail changes to owner or specifically authorised roles. | MVP | Unauthorised users cannot view full sensitive values or modify them. |
| SHOP-RBAC-003 | Restrict refunds, cancellations after payment and manual payment confirmation. | MVP | Actions require the configured role and create audit events. |
| SHOP-RBAC-004 | Support location scope in the expansion release. | Later | Users see only assigned orders, stock and reports where configured. |
| SHOP-RBAC-005 | Support temporary support access with business consent. | Next | Access has purpose, expiry and complete audit logging. |
| SHOP-RBAC-006 | Provide activity logs visible to the owner. | MVP | The owner can review sensitive operational actions. |

# 35. Business Evidence Ledger and Readiness

Shop is a strong evidence source because it captures demand, transaction, payment and fulfilment behaviour. Evidence confidence and score interpretation must remain independent of product purchase and promotion spend.

## Business Evidence Ledger and Readiness Requirements: EVD

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-EVD-001 | Publish standard events for store publication, product activation, order placement, payment confirmation, fulfilment, cancellation, return and refund. | MVP | Each accepted domain event produces at most one evidence event. |
| SHOP-EVD-002 | Attach evidence source, verification level, actor, device or channel and related record identifiers. | MVP | Evidence can be traced to the underlying authorised business record. |
| SHOP-EVD-003 | Distinguish provider-confirmed payment from merchant-confirmed and customer-reported payment. | MVP | Evidence confidence uses the correct verification level. |
| SHOP-EVD-004 | Record fulfilment reliability using valid order state history. | MVP | Cancelled fraud or test orders can be excluded under documented rules. |
| SHOP-EVD-005 | Measure revenue consistency using recognised and reversed commerce activity. | MVP | Refunds and cancellations affect the appropriate period without deleting history. |
| SHOP-EVD-006 | Measure customer continuity only from sufficiently matched customer identities. | Next | Low-confidence matches do not inflate repeat-customer evidence. |
| SHOP-EVD-007 | Measure inventory discipline from sales, restocks, stockouts and justified corrections. | Next | Manual stock edits are not treated as equivalent to verified movements. |
| SHOP-EVD-008 | Provide explainable Shop contributions to MOT and Funding Readiness. | Next | The business can see which behaviours improved or weakened the relevant indicator. |
| SHOP-EVD-009 | Version scoring interpretation independently from historical events. | MVP | A score can be recalculated under a new model without rewriting event history. |
| SHOP-EVD-010 | Never increase score solely because a paid add-on is installed. | MVP | Scoring inputs are behaviour and verified evidence, not entitlement flags. |

## Business Evidence Ledger and Readiness Requirements: EVT

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-EVT-001 | Publish versioned business events for onboarding, catalogue, storefront, orders, payments, fulfilment, returns, promotion and merchant operations. | MVP | Each event conforms to the approved event catalogue and schema version. |
| SHOP-EVT-002 | Include business, location, actor, role, channel, source product, related entity, timestamp and verification level where applicable. | MVP | Evidence consumers can trace every accepted event to its source context. |
| SHOP-EVT-003 | Use a transactional outbox or equivalent reliable pattern for events coupled to accepted domain changes. | MVP | A committed order or payment cannot be permanently missing its required event. |
| SHOP-EVT-004 | Use idempotency keys and deduplication for client retries, provider callbacks and event consumers. | MVP | Repeated delivery does not duplicate orders, payments, ledger or evidence entries. |
| SHOP-EVT-005 | Represent corrections and reversals as new events linked to the original event. | MVP | History remains append-only and current state can still be determined. |
| SHOP-EVT-006 | Separate product analytics events from auditable business and evidence events. | MVP | A page view, click or onboarding step cannot be treated as revenue evidence. |
| SHOP-EVT-007 | Classify merchant-declared, customer-reported, system-recorded, provider-confirmed and institution-verified evidence distinctly. | MVP | Evidence Confidence uses the correct source class. |
| SHOP-EVT-008 | Exclude test, duplicate, fraudulent or invalid transactions from recognised business evidence through controlled rules. | Next | Exclusion preserves source history and reason. |
| SHOP-EVT-009 | Provide event replay and score recalculation without rewriting historical source events. | Next | A model version can regenerate outputs from the immutable event history. |
| SHOP-EVT-010 | Protect events containing personal or sensitive information through minimisation and access controls. | MVP | Events carry identifiers or approved summaries rather than unnecessary raw content. |
| SHOP-EVT-011 | Monitor event lag, failure, duplication and consumer health. | MVP | Operational alerts exist for material event pipeline failure. |
| SHOP-EVT-012 | Publish promotion and Discover events without allowing spend to become evidence of operational quality. | MVP | Scoring consumers ignore commercial spend and entitlement events. |
| SHOP-EVT-013 | Provide business-visible evidence explanations linked to Shop activity. | Next | The owner can see which actual behaviours affected a readiness indicator. |
| SHOP-EVT-014 | Support consented institutional evidence exports through approved reports or APIs. | Next | The business authorises the recipient, scope and duration. |
| SHOP-EVT-015 | Version event retention and archival rules by legal, operational and evidence need. | Next | Deletion or archival does not silently invalidate reports or financial records. |
| SHOP-EVT-016 | Record channel and device class for operational interpretation without using it as a positive scoring factor. | MVP | Using mobile, web or paid hardware does not improve the score by itself. |
| SHOP-EVT-017 | Provide canonical event definitions for the first-year Shop and Discover success metrics. | MVP | Product and commercial teams calculate targets from the same event rules. |
| SHOP-EVT-018 | Require governance approval for any new Shop event used in MOT, Sustainability Score or Funding Readiness. | MVP | No engineering team can add a scoring signal without documented review. |

# 36. Monetization, Ascend Balance and Commercial Rules

Shop uses a free foundation and monetizes identifiable value through capacity, promotion, payments, AI, automation, branding, support and credibility services rather than compulsory monthly software rent.

## Monetization, Ascend Balance and Commercial Rules Requirements: MON

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-MON-001 | Provide a permanently useful free Shop foundation rather than a short compulsory trial. | MVP | A merchant can retain a basic active Shop within published limits without a monthly software payment. |
| SHOP-MON-002 | Include a configurable free active-product allowance sufficient to demonstrate real value. | MVP | The Ghana pilot can test 10, 15 or 20 active products without code changes. |
| SHOP-MON-003 | Include a configurable allowance of AI-assisted catalogue actions. | MVP | The merchant sees remaining included usage before a paid action. |
| SHOP-MON-004 | Allow one-time purchase of additional active-product capacity. | MVP | Purchased capacity is reflected by the entitlement engine and does not require a recurring plan. |
| SHOP-MON-005 | Monetize growth primarily through Discover promotion, payments, AI, automation, messaging, branding and support. | MVP | Commercial reporting can attribute revenue by value source. |
| SHOP-MON-006 | Use Ascend Balance for prepaid variable-cost and optional actions. | MVP | The merchant can top up and spend in local currency with a complete transaction history. |
| SHOP-MON-007 | Show the exact price and expected outcome before deducting Ascend Balance. | MVP | No paid action begins through an ambiguous or hidden charge. |
| SHOP-MON-008 | Support Mobile Money, card, bank transfer, partner voucher and institutional credit for Balance funding where configured. | Next | Only confirmed funding increases available balance. |
| SHOP-MON-009 | Do not charge for basic evidence-capture behaviours such as recording an order, customer, payment state, fulfilment or basic receipt. | MVP | Core record creation remains available within the free foundation. |
| SHOP-MON-010 | Do not charge for correcting inaccurate records, reversing errors or retrying system failures. | MVP | Eligible correction and recovery actions do not consume paid allowances. |
| SHOP-MON-011 | Allow optional Assurance for cloud continuity, support, advanced automation, custom domain management and premium business services. | Next | Assurance benefits and expiry effects are stated clearly and do not remove merchant-owned history. |
| SHOP-MON-012 | Support quarterly, six-month and annual operating or Assurance periods where commercially approved. | Next | The merchant is not forced into monthly auto-renewal. |
| SHOP-MON-013 | Provide Outcome Packs for Reach, Automation and Credibility rather than exposing many disconnected add-ons. | Next | Each pack communicates the business outcome, included capabilities, duration and price. |
| SHOP-MON-014 | Support payment-processing revenue only on transactions facilitated through approved Ascend integrations. | MVP | Ascend does not charge a transaction fee on cash or external payments it did not facilitate under the published terms. |
| SHOP-MON-015 | Support one-time branding, domain and assisted setup services. | Next | Service completion, ownership and renewal obligations are documented. |
| SHOP-MON-016 | Support sponsored merchant access, Balance and promotion without changing merchant data ownership. | Next | Sponsor-funded value is separately attributed and expiry is communicated. |
| SHOP-MON-017 | Preserve purchased campaign and capacity terms after future price changes. | MVP | Existing purchases are honoured for their defined scope and period. |
| SHOP-MON-018 | Provide country-specific price books in local currency. | MVP | Ghana, Nigeria, Kenya and South Africa pricing can be configured independently. |
| SHOP-MON-019 | Expose commercial limits through plain-language usage indicators and contextual prompts. | MVP | The merchant can understand current capacity and the next available expansion. |
| SHOP-MON-020 | Provide refunds or Balance reversals for eligible undelivered paid services. | MVP | Refund rules are published and ledger entries remain traceable. |
| SHOP-MON-021 | Separate merchant-paid, sponsor-funded, promotional and goodwill credits in commercial reporting. | Next | Revenue and subsidy metrics cannot be confused. |
| SHOP-MON-022 | Measure willingness to pay by observed purchase and renewal behaviour rather than survey responses alone. | Next | Pricing experiments record offer, cohort, choice and resulting usage. |
| SHOP-MON-023 | Prevent pricing experiments from changing active orders, customer totals or merchant-owned records. | MVP | Commercial experiments affect only eligible future purchases. |
| SHOP-MON-024 | Require unit-economics approval before launching any offer with material variable service or support cost. | Next | The offer has an approved cost, margin and operational ownership record. |

# 37. Bundles, Entitlements and Cross-Set Packaging

Bundles combine complete workflows. Shared capabilities are charged once, embedded essentials remain available, and advanced operations extend through Office, Inventory, Documents and Readiness.

## Bundles, Entitlements and Cross-Set Packaging Requirements: ENT

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-ENT-001 | Represent access through installed product, capabilities, add-ons and usage allowances. | MVP | The entitlement response does not require a legacy tier to determine every Shop action. |
| SHOP-ENT-002 | Allow Shop to operate independently of POS, Services and Office. | MVP | A Shop-only merchant can complete the full core commerce workflow. |
| SHOP-ENT-003 | Allow Shop and POS to share catalogue and inventory when both are installed. | MVP | No duplicate product migration is required. |
| SHOP-ENT-004 | Show locked enhancements contextually without obstructing core work. | MVP | The merchant can understand the benefit and price path without repeated interruption. |
| SHOP-ENT-005 | Preserve historical access and records after an add-on expires. | MVP | Paid historical orders and records remain readable under retention rules. |
| SHOP-ENT-006 | Support institution-funded capabilities with sponsor and expiry metadata. | Next | Sponsored access can be reported separately from merchant-paid access. |

## Bundles, Entitlements and Cross-Set Packaging Requirements: BND

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-BND-001 | Include Shop Essentials in the Shop entry product: storefront, basic catalogue, orders, customers, payments, fulfilment, documents and basic evidence. | MVP | A Shop-only merchant can complete a full core transaction without another product purchase. |
| SHOP-BND-002 | Include only the staff assignment and fulfilment essentials required to operate Shop. | MVP | The merchant can assign basic work without purchasing full Ascend Office. |
| SHOP-BND-003 | Use Ascend Office for advanced attendance, leave, team scheduling, projects, broader approvals and performance. | Next | Activating Office extends the same staff and work records. |
| SHOP-BND-004 | Use the shared Inventory capability for stock and expose advanced batch, expiry, multi-location or procurement functions through approved bundles. | Next | A merchant is not charged twice for the same inventory entitlement. |
| SHOP-BND-005 | Use Ascend Documents for basic receipts and invoices within Shop and advanced automation, signature, statements or portals as optional value. | MVP | Basic transaction documents remain available to Shop orders. |
| SHOP-BND-006 | Provide a Shop Growth bundle for online-first sellers with Shop, Documents, customer management, inventory essentials, Discover eligibility and basic readiness. | MVP | The commercial catalogue can activate the complete bundle atomically. |
| SHOP-BND-007 | Provide an Omnichannel Retail bundle with POS, Shop, Office, Documents, shared catalogue, shared inventory and Discover eligibility. | Next | The bundle reuses existing records and effective entitlements. |
| SHOP-BND-008 | Provide institution-sponsored Shop onboarding bundles without forking the core product. | Next | Programme differences are configuration, entitlement and support choices. |
| SHOP-BND-009 | Resolve effective access from product, bundle, capacity, Assurance, sponsorship, country and grace-period rules. | MVP | Every channel receives one consistent entitlement response. |
| SHOP-BND-010 | Prevent duplicate charging when two bundles include the same shared capability. | MVP | Checkout identifies existing access and charges only for incremental value. |
| SHOP-BND-011 | Allow a merchant to upgrade from free Shop to a bundle without recreating catalogue, orders or Shop URL. | MVP | Activation changes entitlements while preserving all records. |
| SHOP-BND-012 | Allow a merchant to downgrade or let an optional entitlement expire without losing historical data. | MVP | The system communicates which live actions become unavailable and preserves records. |
| SHOP-BND-013 | Support grace periods and recovery for expired live services where operational continuity requires them. | Next | The merchant receives clear notice and no hidden reactivation penalty. |
| SHOP-BND-014 | Display the recommended next product based on observed need without implying that purchase guarantees business success or score improvement. | Next | Recommendations cite the relevant business condition and remain dismissible. |
| SHOP-BND-015 | Keep bundle names and included outcomes simple enough for field sales and merchant self-service. | MVP | Commercial usability testing confirms merchants can distinguish the offers. |
| SHOP-BND-016 | Version bundle definitions and retain the effective terms used for each purchase. | MVP | Historical commercial records remain explainable after catalogue changes. |

# 38. Connectivity Resilience and Synchronisation

The public storefront is online-first, but merchant work must tolerate poor connectivity without inventing payment confirmation or corrupting order authority.

## Connectivity Resilience and Synchronisation Requirements: SYNC

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-SYNC-001 | Cache the merchant shell, recent orders and essential catalogue data on supported devices. | MVP | The merchant can open cached information with an explicit freshness indicator. |
| SHOP-SYNC-002 | Allow product drafts and selected non-sensitive edits to be queued offline. | Next | Queued changes sync with conflict detection and visible status. |
| SHOP-SYNC-003 | Do not allow offline merchant actions to mark an unverified digital payment provider-confirmed. | MVP | Confirmation requires server or approved provider verification. |
| SHOP-SYNC-004 | Allow safe operational status updates to queue offline only where state transition rules can be validated. | Next | Conflicts return a resolution task rather than silently overwriting server state. |
| SHOP-SYNC-005 | Use idempotency keys for retries of order, payment and evidence actions. | MVP | Network retries do not duplicate accepted records. |
| SHOP-SYNC-006 | Show Online, Limited, Offline and Sync Error states. | MVP | The status is visible and links to actionable details. |
| SHOP-SYNC-007 | Preserve unsynchronised drafts through app restart. | Next | Drafts remain available until synced or deliberately discarded. |
| SHOP-SYNC-008 | Provide manual retry and support diagnostics for failed synchronisation. | Next | Retry does not create duplicates and diagnostics exclude secrets. |
| SHOP-SYNC-009 | Preserve uploaded image references, processing jobs and catalogue edits through connection loss or app restart. | MVP | The merchant resumes without re-uploading completed assets. |
| SHOP-SYNC-010 | Retry failed image-analysis jobs safely and show partial results when some products are ready. | MVP | Retry cannot duplicate draft products and ready products remain editable. |

# 39. Performance, SEO and Discoverability

Fast mobile pages, strong sharing previews, structured metadata and stable links are core conversion infrastructure.

## Performance, SEO and Discoverability Requirements: SEO

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-SEO-001 | Render public stores and products in a search-engine accessible form. | MVP | Public content has meaningful HTML and metadata without requiring authenticated scripts. |
| SHOP-SEO-002 | Generate sitemap entries for published stores and active products. | MVP | Hidden, archived and disallowed pages are excluded. |
| SHOP-SEO-003 | Generate canonical URLs and social preview metadata. | MVP | Duplicate parameter URLs point to the canonical page. |
| SHOP-SEO-004 | Provide appropriate robots controls for merchant-selected visibility. | MVP | Private or paused content follows the configured indexing policy. |
| SHOP-SEO-005 | Optimise images, lazy loading and caching for mobile networks. | MVP | Core storefront pages meet documented performance budgets on target devices. |
| SHOP-SEO-006 | Support structured product and business data where accurate. | Next | Markup is valid and reflects current public content. |
| SHOP-SEO-007 | Redirect old slugs after approved changes. | MVP | Existing shared links continue to reach the correct store or product. |
| SHOP-SEO-008 | Protect storefront availability from expensive merchant-side analytics queries. | MVP | Public rendering remains isolated from slow dashboard operations. |

## Performance, SEO and Discoverability Requirements: NFR

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-NFR-001 | Public storefront availability target must be defined separately from merchant analytics services. | MVP | A slow report query cannot make public checkout unavailable. |
| SHOP-NFR-002 | Core buyer pages must meet documented mobile performance budgets on target network conditions. | MVP | Performance tests pass for store home, product and checkout. |
| SHOP-NFR-003 | Order and payment operations must be idempotent. | MVP | Repeated requests create one accepted business result. |
| SHOP-NFR-004 | Financial and evidence records must be auditable and recoverable. | MVP | Backups, logs and replay or reconciliation procedures are tested. |
| SHOP-NFR-005 | The product must support horizontal growth in stores, products, orders and public traffic. | MVP | Load tests meet the pilot and commercial capacity targets. |
| SHOP-NFR-006 | Personal and financial data must be encrypted in transit and protected at rest by platform controls. | MVP | Security review confirms configured protections. |
| SHOP-NFR-007 | Public and merchant interfaces must support current major mobile browsers and approved Android wrappers where used. | MVP | Compatibility tests pass on the supported device matrix. |
| SHOP-NFR-008 | The system must expose operational health, queue failures and integration errors to authorised teams. | MVP | Alerts and dashboards identify failures before merchants report them where possible. |
| SHOP-NFR-009 | Changes to scoring, payment and order rules must be versioned and reviewed. | MVP | Rule version is attached to derived outputs or transition decisions. |
| SHOP-NFR-010 | The codebase must preserve clear domain boundaries within a modular monolith. | MVP | Shop UI components do not become the source of truth for payment or inventory logic. |
| SHOP-NFR-011 | Catalogue analysis must be asynchronous and allow partial completion when some images process before others. | MVP | Ready products are available without waiting for failed or slow jobs. |
| SHOP-NFR-012 | AI and media-processing usage must have observable cost, latency and failure budgets. | MVP | Authorised teams can monitor cost per activated merchant and generation performance. |

# 40. Security, Privacy, Fraud and Trust

The Shop must protect merchant and customer data, payment integrity, public trust and promotion quality while preserving explainable moderation and corrections.

## Security, Privacy, Fraud and Trust Requirements: SEC

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-SEC-001 | Apply business-level row security to all merchant records. | MVP | Cross-business access tests fail for every protected entity. |
| SHOP-SEC-002 | Validate public order and checkout input on the server. | MVP | Tampered price, stock or merchant identifiers are rejected. |
| SHOP-SEC-003 | Verify payment callbacks and prevent replay. | MVP | Invalid signatures and duplicate events cannot confirm payment twice. |
| SHOP-SEC-004 | Mask sensitive payment and personal data according to role. | MVP | Unauthorised screens and logs do not expose full values. |
| SHOP-SEC-005 | Rate-limit public checkout, enquiry and authentication abuse. | MVP | Abusive requests are limited without blocking normal purchase flows unnecessarily. |
| SHOP-SEC-006 | Record security-sensitive changes in an immutable audit trail. | MVP | Payment details, role changes, refunds and manual confirmations are traceable. |
| SHOP-SEC-007 | Provide merchant and buyer reporting channels for suspected fraud. | Next | Reports create a review case with relevant order references. |
| SHOP-SEC-008 | Detect suspicious order, payment and refund patterns for review. | Next | Flags do not automatically accuse or penalise without documented rules. |
| SHOP-SEC-009 | Provide consent-based institutional access only. | MVP | No partner can view identifiable business data without valid authorisation. |
| SHOP-SEC-010 | Follow data retention and deletion policies while preserving required financial evidence. | MVP | Deletion workflows distinguish personal data from legally retained transaction records. |
| SHOP-SEC-011 | Keep onboarding images and storefront previews private until the merchant activates the Shop. | MVP | Unpublished draft media cannot be accessed through a public Shop URL. |
| SHOP-SEC-012 | Obtain clear consent for AI-assisted image processing and apply data-minimisation rules to provider requests. | MVP | Consent is recorded and only required media and instructions are sent. |
| SHOP-SEC-013 | Apply explicit retention and deletion rules to abandoned drafts, generated outputs and temporary media. | MVP | Expired drafts and media are deleted or anonymised according to policy, with required audit records retained. |
| SHOP-SEC-014 | Require approved contractual and technical controls for AI providers, including restrictions on unauthorised training or reuse of merchant content. | MVP | Provider configuration and agreements pass privacy and security review. |

# 41. Account Manager, Support and Merchant Success

Assisted onboarding and merchant success are product capabilities with permissions, cost and measurable outcomes, not unlimited informal labour.

## Account Manager, Support and Merchant Success Requirements: SUP

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-SUP-001 | Allow Account Managers to view merchant setup status within assigned scope. | MVP | They cannot access unrelated businesses. |
| SHOP-SUP-002 | Provide assisted catalogue import and quality review. | MVP | Actions are attributed to the assisting user. |
| SHOP-SUP-003 | Provide a merchant launch checklist and test-order workflow. | MVP | A store can be verified operational before public promotion. |
| SHOP-SUP-004 | Provide support diagnostics for store status, payment setup, delivery, domain and sync. | MVP | Diagnostics avoid exposing secrets and identify actionable causes. |
| SHOP-SUP-005 | Track training completion and follow-up tasks. | Next | Support teams can measure onboarding quality and unresolved needs. |
| SHOP-SUP-006 | Provide merchant-facing help in context. | MVP | Help opens from the relevant workflow without forcing a broad knowledge-base search. |
| SHOP-SUP-007 | Support service-level packages for managed catalogue, campaigns or reporting. | Later | Managed actions remain consented and audited. |
| SHOP-SUP-008 | Allow Account Managers to review and correct AI-generated drafts with merchant consent and full action attribution. | MVP | Assisted edits remain merchant-owned and the assisting user is recorded. |
| SHOP-SUP-009 | Provide support visibility into draft stage, failed processing jobs and recovery status without exposing private merchant credentials. | MVP | Support can resolve setup issues without taking over the merchant account. |

# 42. Institutional and Sponsored Deployment

Banks, development programmes and other institutions can sponsor Shop adoption through entitlements, cohorts and consented reporting without taking ownership of merchant records.

## Institutional and Sponsored Deployment Requirements: INST

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-INST-001 | Support programme cohorts with sponsor, programme and eligibility metadata. | Next | The same business can retain ownership when sponsored access ends. |
| SHOP-INST-002 | Support templated capability bundles for women-led, youth-led, sector or regional programmes. | Next | Templates install capabilities without forking the product codebase. |
| SHOP-INST-003 | Provide aggregated programme reporting on activation, products, orders, revenue evidence and readiness progress. | Next | Reports respect consent, minimum aggregation and privacy controls. |
| SHOP-INST-004 | Allow Account Managers or programme officers to monitor setup and adoption tasks. | Next | Operational access does not imply unrestricted financial-data access. |
| SHOP-INST-005 | Support programme-funded setup, domain, payment or support services. | Next | Funding source and merchant contribution are separately recorded. |
| SHOP-INST-006 | Allow consented business evidence export for approved funding workflows. | Later | The business can see and authorise what is shared. |

# 43. APIs and External Integrations

External systems access Shop through versioned, permissioned and idempotent interfaces rather than direct database coupling.

## APIs and External Integrations Requirements: API

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-API-001 | Use server-controlled credentials and secrets for every external integration. | MVP | No provider secret is included in the public client bundle. |
| SHOP-API-002 | Define timeout, retry and idempotency behaviour per provider. | MVP | Integration retries do not duplicate financial or order state. |
| SHOP-API-003 | Store external references and normalised internal status. | MVP | The system can reconcile provider and internal state. |
| SHOP-API-004 | Provide graceful fallback when an optional provider is unavailable. | MVP | Core store browsing and manual fulfilment remain available where safe. |
| SHOP-API-005 | Version partner APIs and consent scopes. | Later | Breaking changes do not silently alter existing institutional access. |
| SHOP-API-006 | Call AI providers only through server-controlled services and never expose provider credentials in the merchant client. | MVP | Network inspection confirms that the public client contains no AI secret. |
| SHOP-API-007 | Require structured response schemas and validate generated output before storing or showing it. | MVP | Malformed, unsafe or unsupported fields are rejected or converted to a review state. |
| SHOP-API-008 | Define timeout, retry, cost and concurrency controls for catalogue-analysis jobs. | MVP | Provider failures do not block manual catalogue creation or create uncontrolled duplicate costs. |
| SHOP-API-009 | Store provider, model version and processing reference for each generated draft. | MVP | Quality investigations can identify the exact generation context. |

# 44. Migration from the First Deployment

The new Shop must preserve valuable records from the first deployment while moving merchants into the connected architecture and new commercial model.

## Migration from the First Deployment Requirements: MIG

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-MIG-001 | Map first-deployment businesses, Shops, products, images, customers, orders, payments and documents to canonical v2 identities. | MVP | Migration produces no duplicate active Shop for a matched business. |
| SHOP-MIG-002 | Preserve existing public Shop URLs or provide permanent redirects. | MVP | Previously shared links continue to resolve to the correct merchant. |
| SHOP-MIG-003 | Preserve historical order, payment, refund, fulfilment and audit timestamps. | MVP | Historical reports reconcile before and after migration within approved tolerances. |
| SHOP-MIG-004 | Map legacy subscription and plan access to equivalent v2 capabilities, capacity or sponsored entitlements. | MVP | No merchant loses paid access without explicit commercial resolution. |
| SHOP-MIG-005 | Identify and resolve duplicate products, customers and business profiles through controlled merge rules. | MVP | The process preserves source references and requires review for ambiguous matches. |
| SHOP-MIG-006 | Reprocess only missing or invalid product metadata and never overwrite merchant-approved content silently. | MVP | AI enhancement creates suggestions or logged updates, not hidden replacements. |
| SHOP-MIG-007 | Validate image accessibility, ownership and storage references before cutover. | MVP | Active products have a valid primary image or a clearly flagged remediation task. |
| SHOP-MIG-008 | Run migration in repeatable batches with dry-run, reconciliation and rollback support. | MVP | A failed cohort can be restored without affecting completed cohorts. |
| SHOP-MIG-009 | Communicate significant customer-facing Shop changes before migration. | MVP | Merchants know the timeline, preserved data and any action required. |
| SHOP-MIG-010 | Provide Account Manager support for high-value or high-complexity merchant migrations. | Next | Assistance is tracked and does not alter ownership. |
| SHOP-MIG-011 | Retain legacy read access for a controlled period where financial or support reconciliation requires it. | Next | Legacy access is restricted, monitored and retired through an approved plan. |
| SHOP-MIG-012 | Measure migration completion, exception rate, merchant activation and post-migration revenue behaviour. | MVP | The team can distinguish migration defects from ordinary merchant inactivity. |
| SHOP-MIG-013 | Prevent migration events from being interpreted as new commerce or readiness evidence. | MVP | Imported history is labelled with original source and date. |
| SHOP-MIG-014 | Obtain formal data and product acceptance before decommissioning the legacy Shop experience. | MVP | Product, engineering, operations and commercial owners approve cutover evidence. |

# 45. Product Analytics and Success Metrics

Product analytics measures adoption and conversion. It is not the Business Evidence Ledger and cannot substitute clicks for real commerce.

## Product Analytics and Success Metrics Requirements: ANL

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-ANL-001 | Track Shop onboarding started with source, device class and assisted or self-service path. | MVP | Events exclude unnecessary personal data and distinguish Shop entry from general platform signup. |
| SHOP-ANL-002 | Track identity verification requested, completed and failed. | MVP | The funnel can identify contact-verification friction without storing OTP values. |
| SHOP-ANL-003 | Track image selected, uploaded, rejected and removed. | MVP | Events include count, source and error category without exposing the image itself. |
| SHOP-ANL-004 | Track catalogue analysis started, completed, partially completed and failed. | MVP | Latency and provider outcomes are measurable per job. |
| SHOP-ANL-005 | Track draft product generated, edited, regenerated, removed and approved. | MVP | The system can measure generated-content usefulness and merchant correction rates. |
| SHOP-ANL-006 | Track price entry completion and number of publication-ready products. | MVP | The funnel shows when merchants reach the minimum catalogue threshold. |
| SHOP-ANL-007 | Track storefront preview viewed, activation started, Shop published and activation failed. | MVP | Activation retries are deduplicated and failure reasons are classified. |
| SHOP-ANL-008 | Track onboarding abandoned, recovery message sent, draft resumed and recovered activation. | MVP | Recovery conversion can be measured by original session. |
| SHOP-ANL-009 | Track time to first image, first generated product, first publication-ready product, preview and activation. | MVP | Durations use consistent session definitions. |
| SHOP-ANL-010 | Track AI suggestion acceptance, edit and rejection rates by field type. | MVP | Metrics distinguish title, description, category and attribute usefulness. |
| SHOP-ANL-011 | Track error categories for image upload, analysis, draft saving and activation. | MVP | Errors are actionable and exclude secrets or personal content. |
| SHOP-ANL-012 | Track product shared, viewed, add-to-cart, checkout started, order placed and payment outcome. | MVP | Commerce funnel definitions are documented and deduplicated. |
| SHOP-ANL-013 | Provide cohort retention by activated merchant and transacting merchant. | Next | Definitions separate account access from meaningful commerce activity. |

# 46. Rollout and First-Year Commercial Plan

The first commercial year validates activation, revenue conversion, Discover adoption, support economics and the connected-platform advantage before geographic expansion.

## Rollout and First-Year Commercial Plan Requirements: REL

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-REL-001 | Release the connected Shop through controlled merchant cohorts before broad availability. | MVP | Cohort size expands only after defined quality and support thresholds are met. |
| SHOP-REL-002 | Use first-deployment merchants as a priority validation cohort while including new merchants to test fresh onboarding. | MVP | Research distinguishes migration experience from first-time adoption. |
| SHOP-REL-003 | Validate the catalogue-first journey with self-service, assisted and institutional merchant cohorts. | MVP | Activation and first-revenue metrics are reported by onboarding path. |
| SHOP-REL-004 | Target at least 1,000 activated Shop businesses in the first commercial year, subject to approved operating capacity. | Next | The metric uses the documented activated-Shop definition. |
| SHOP-REL-005 | Target a 50% revenue activation rate among activated Shops. | Next | Revenue activation is defined as at least one recognised revenue event within the approved cohort window. |
| SHOP-REL-006 | Target 40% promotion adoption through Ascend Discover. | Next | The denominator and merchant-paid versus sponsored activity are reported separately. |
| SHOP-REL-007 | Measure time to first publication-ready product, Shop activation, first qualified visit, first order and first recognised revenue. | MVP | Each duration uses a canonical starting event and cohort. |
| SHOP-REL-008 | Measure catalogue quality, payment completion, fulfilment completion, cancellation, refund and repeat customer behaviour. | MVP | Metrics use auditable order and payment states. |
| SHOP-REL-009 | Measure merchant retention by meaningful commerce activity rather than login alone. | Next | Retention reports distinguish active, revenue-active and promotion-active merchants. |
| SHOP-REL-010 | Measure support burden, Account Manager effort, messaging cost, payment cost and infrastructure cost per active merchant. | Next | Commercial decisions can use contribution-margin inputs. |
| SHOP-REL-011 | Require product, security, payments, evidence and operations sign-off before each major release stage. | MVP | Release evidence and unresolved exceptions are documented. |
| SHOP-REL-012 | Provide launch rollback and customer communication plans. | MVP | A critical defect can be contained without losing accepted orders or payments. |
| SHOP-REL-013 | Conduct merchant and customer research after each rollout cohort. | MVP | Findings translate into prioritised decisions rather than untracked feedback. |
| SHOP-REL-014 | Do not expand into additional countries before Ghana activation, support and unit economics meet approved thresholds. | Next | Country launch approval includes local payments, pricing, legal, language and support readiness. |
| SHOP-REL-015 | Publish a post-launch review comparing targets, actuals, learning and next decisions. | Next | Leadership receives an evidence-based commercial and product review. |

# 47. Quality Assurance and Release Acceptance

Release acceptance must cover merchant and customer journeys, business rules, payments, evidence, responsive behaviour, security and operational recovery.

## Quality Assurance and Release Acceptance Requirements: QA

| **ID** | **Requirement** | **Phase** | **Acceptance criteria** |
|---|---|---|---|
| SHOP-QA-001 | Provide test stores and sandbox payment flows isolated from production evidence. | MVP | Test activity cannot affect merchant readiness or production reporting. |
| SHOP-QA-002 | Run automated regression tests on every release candidate. | MVP | Critical failures block deployment. |
| SHOP-QA-003 | Perform a controlled merchant usability test before pilot release. | MVP | Observed failures are documented and prioritised. |
| SHOP-QA-004 | Test interrupted checkout and repeated payment callback scenarios. | MVP | No duplicate order, payment, receipt, ledger or evidence record is created. |
| SHOP-QA-005 | Test image-heavy catalogues on target mobile devices and networks. | MVP | Store remains usable within performance budgets. |
| SHOP-QA-006 | Test buyer flows without an account and with common browser privacy settings. | MVP | Core purchase works without third-party cookie dependence. |
| SHOP-QA-007 | Test catalogue-first onboarding with first-time merchants using real phone cameras and mixed-quality product images. | MVP | Observed merchants can publish at least three accurate products without hidden facilitator intervention. |
| SHOP-QA-008 | Test AI outputs across pilot categories for wrong identity, unsupported claims, brand uncertainty and sensitive content. | MVP | Unsafe or low-confidence outputs enter review or manual-entry states and do not auto-publish. |
| SHOP-QA-009 | Test interrupted upload, analysis and activation recovery. | MVP | The merchant resumes without duplicate products, repeated charges or lost edits. |

# 48. Shared Data Model

Ascend Shop uses shared platform entities and adds only Shop-specific presentation or commerce configuration.

| **Entity** | **Purpose** | **Ownership** |
|---|---|---|
| Business | Canonical merchant identity. | Shared Business Core |
| Shop | Commerce presentation and configuration for a business. | Ascend Shop |
| Person and Membership | Owners, staff, roles and permissions. | Shared Identity and People |
| Customer | Shared customer identity, contact and consent. | Customer Core |
| Catalogue Item and Variant | Canonical product identity and sellable options. | Catalogue Core |
| Shop Listing | Online title, description, media, visibility and merchandising. | Ascend Shop |
| Inventory Location and Movement | Available, reserved, fulfilled, returned and corrected stock. | Inventory Core |
| Cart | Customer selections before order creation. | Ascend Shop |
| Order and Order Line | Commercial commitment and item snapshot. | Commerce Core |
| Payment Attempt and Allocation | Initiated, reported, verified, failed, refunded and allocated money. | Payments Core |
| Fulfilment | Pickup, merchant delivery, partner delivery and status history. | Ascend Shop / Logistics contract |
| Document | Invoice, receipt, refund and delivery document. | Documents Core |
| Promotion Campaign | Merchant-funded or sponsored Discover placement. | Discover / Commercial Core |
| Ascend Balance Ledger | Prepaid funding, spend, reversal and sponsorship. | Commercial Core |
| Business Event | Versioned operational fact. | Event Platform |
| Evidence Record | Governed interpretation of source activity. | Business Evidence Ledger |

# 49. State Machines and Canonical Events

## 49.1 Order states

`Draft → Placed → Confirmed → Preparing → Ready for Pickup / Dispatched → Fulfilled`

Terminal states and controlled alternatives include `Cancelled`, `Partially Fulfilled`, `Returned` and `Closed with Refund`. Payment and fulfilment remain separate state machines.

## 49.2 Payment states

`Not Required / Pending → Initiated → Customer Reported / Merchant Confirmed / Provider Confirmed → Partially Refunded / Refunded / Failed / Expired / Disputed`

## 49.3 Promotion states

`Draft → Scheduled / Under Review → Active → Paused → Completed` with controlled `Rejected`, `Cancelled` and `Refunded` outcomes.

## 49.4 Canonical events

- `shop_onboarding.started`
- `shop_onboarding.images_uploaded`
- `shop_onboarding.catalogue_generated`
- `shop_onboarding.preview_viewed`
- `shop.activated`
- `shop.published`
- `catalog_item.activated`
- `cart.created`
- `checkout.started`
- `order.placed`
- `payment.initiated`
- `payment.customer_reported`
- `payment.merchant_confirmed`
- `payment.provider_confirmed`
- `order.confirmed`
- `order.preparing`
- `order.ready`
- `fulfilment.dispatched`
- `order.fulfilled`
- `order.cancelled`
- `return.received`
- `refund.completed`
- `inventory.reserved`
- `inventory.released`
- `inventory.fulfilled`
- `discover.eligible`
- `promotion.purchased`
- `promotion.activated`
- `promotion.completed`

# 50. Dependencies, Assumptions and Constraints

- Shared identity, catalogue, customer, payment, inventory, document, event, evidence and entitlement services are available through stable contracts.
- Ghana launch payments and messaging providers are commercially and technically approved.
- Merchants remain responsible for the legality, accuracy, ownership and fulfilment of their products.
- Customer Web is the compulsory low-friction path; Customer Mobile is optional.
- AI and messaging costs require allowances, Balance or sponsor funding.
- Discover requires sufficient customer traffic, merchant quality and operational moderation to create credible value.
- The 1,000 Shop, 50% revenue activation and 40% promotion-adoption objectives require funded acquisition, onboarding and merchant-success capacity.

# 51. Risks and Mitigations

| **Risk** | **Impact** | **Mitigation** |
|---|---|---|
| Merchants create Shops but do not share or transact. | Weak revenue activation. | Catalogue-first preview, launch checklist, sharing actions, Account Manager recovery and activation analytics. |
| Discover lacks enough customer traffic. | Promotion fails to deliver value. | Controlled campaigns, own social distribution, partnerships, local collections and transparent reporting. |
| Too many paid add-ons create confusion. | Low trust and conversion. | Ascend Balance, Outcome Packs and contextual offers tied to clear business needs. |
| Manual payment claims are treated as verified. | Fraud and misleading evidence. | Explicit payment confidence states and provider verification. |
| Shop and POS stock diverge. | Overselling and merchant distrust. | One inventory ledger, reservation rules, idempotency and reconciliation. |
| AI produces inaccurate catalogue content. | Merchant or customer harm. | Suggestions only, merchant approval, prohibited-claim controls and manual fallback. |
| Merchant fulfilment quality harms Discover trust. | Customer churn. | Eligibility, moderation, transparent responsibility, issue reporting and fulfilment evidence. |
| Support cost exceeds merchant revenue. | Unprofitable growth. | Assisted-service pricing, cohort operations, support analytics and unit-economics gates. |
| Promotion spend is confused with verification. | Trust damage. | Strict label separation and score exclusion. |
| Customer app is forced too early. | Checkout abandonment. | Web-first buying and optional Customer Mobile. |
| Institutional access becomes excessive. | Privacy and merchant distrust. | Consent, scoped reports, aggregation and audit. |
| Country expansion copies Ghana pricing blindly. | Commercial failure. | Local currency price books and country validation. |

# 52. Out of Scope

- AscendSME acting as universal seller of record or taking ownership of merchant inventory.
- Full managed logistics network and universal delivery guarantee.
- Unlimited storefront code or theme customisation.
- Native customer application as a prerequisite for commerce.
- Credit underwriting or lending decisions inside Shop.
- Payment of money to improve MOT, Sustainability Score, Trust Level or verification.
- Enterprise warehouse, manufacturing and international trade management in the first release.
- Auction-based Discover advertising in the first release.

# 53. Open Decisions

1. Final Ghana free active-product allowance: 10, 15 or 20.
2. Included AI generation allowance and paid unit price.
3. Exact first-year revenue-activation cohort window.
4. Merchant-paid versus sponsored definition within the 40% promotion target.
5. Discover pilot pricing and placement inventory.
6. Payment provider, settlement model and fee sharing.
7. Customer review and rating policy.
8. Domain ownership, renewal and transfer process.
9. Delivery partner integration sequence and liability language.
10. Country expansion readiness thresholds.

# 54. Future Enhancements

- Loyalty and cross-business rewards through Ascend Customer Mobile.
- Wholesale, request-for-quote and tiered pricing.
- Advanced abandoned-cart recovery and customer journeys.
- Partner logistics marketplace and shipment tracking.
- Outcome-based Discover advertising after fixed-price validation.
- Cross-border catalogue and payment localisation.
- Product authenticity, warranty and supplier evidence programmes.
- Conversational commerce integration through approved messaging channels.

# 55. Master Acceptance Scenarios

## Scenario 1: Catalogue-first activation

A new merchant uploads five images, approves AI drafts, adds prices, previews and activates the Shop without completing a readiness questionnaire.

## Scenario 2: Mobile merchant operation

The merchant receives and progresses an order entirely through Ascend Business Mobile.

## Scenario 3: Customer web checkout

A first-time customer opens a WhatsApp link, orders and tracks without installing an app.

## Scenario 4: Manual Mobile Money

A customer reports payment, the system shows it as unverified, and only an authorised merchant confirmation changes the state.

## Scenario 5: Provider-confirmed payment

A duplicate provider callback does not duplicate payment, revenue, receipt or evidence.

## Scenario 6: Shared stock

A POS sale reduces the same stock used by Shop and prevents an unavailable online order according to policy.

## Scenario 7: Discover organic listing

An eligible product appears organically without a paid promotion.

## Scenario 8: Paid promotion

A merchant tops up Balance, purchases a clearly labelled Product Boost and receives attributable reporting.

## Scenario 9: Promotion and trust separation

A sponsored product is labelled Sponsored and does not automatically display Verified or improve the merchant score.

## Scenario 10: Office connection

A Shop order creates an assigned fulfilment task visible in Office without duplicating the order.

## Scenario 11: Documents connection

A paid order produces a receipt whose amount reconciles to the confirmed payment.

## Scenario 12: Offline merchant recovery

A merchant loses connectivity during product editing and resumes without losing completed draft work.

## Scenario 13: Return and refund

A fulfilled order is returned and refunded through linked, non-destructive records.

## Scenario 14: Entitlement upgrade

A free merchant buys additional catalogue capacity without changing the Shop URL or recreating products.

## Scenario 15: Entitlement expiry

A paid enhancement expires; historical orders and records remain readable and exportable.

## Scenario 16: Institution-sponsored Shop

A sponsored merchant retains Shop ownership when the programme ends.

## Scenario 17: Evidence integrity

The same real order does not create duplicate evidence through retries or multiple channels.

## Scenario 18: Migration

A first-deployment merchant retains products, images, URL, orders and commercial access after migration.

## Scenario 19: Customer privacy

A public customer page does not expose owner reports, staff details or private readiness information.

## Scenario 20: First-year metric calculation

The analytics system calculates activated Shops, revenue activation and Discover adoption using approved definitions.

# Appendices

## Appendix A: Requirement Summary

- Total detailed requirements: **519**
- Unique requirement identifiers: **519**
- MVP: **377**
- Next: **129**
- Later: **13**

## Appendix B: Core Success Metric Definitions

| **Metric** | **Definition** |
|---|---|
| Activated Shop | A merchant-owned Shop that meets activation requirements and is publicly reachable. |
| Revenue-active Shop | An activated Shop with at least one recognised, non-test revenue event in the approved cohort window. |
| Revenue activation rate | Revenue-active Shops divided by eligible activated Shops in the same cohort. |
| Discover promotion adoption | Eligible Shop businesses that activate at least one paid or approved sponsored promotion divided by the approved active-Shop denominator. |
| Meaningfully active merchant | A merchant completing defined commerce or operational activity, not merely signing in. |
| Recognised revenue event | An accepted sale or payment event meeting the financial and evidence recognition rules after reversals and exclusions. |

## Appendix C: Commercial Progression

`Start → Run → Grow → Prove`

- **Start:** free Shop foundation, basic catalogue, orders and evidence.
- **Run:** capacity, operational setup, advanced inventory, team operations and Assurance.
- **Grow:** Discover, payments, AI, messaging and automation.
- **Prove:** verification, evidence reports, readiness and institutional opportunities.

## Appendix D: Final Product Statement

> **Ascend Shop helps African businesses turn product interest into orders, reach customers beyond their own audience and build a connected, verifiable commerce record as they grow.**
