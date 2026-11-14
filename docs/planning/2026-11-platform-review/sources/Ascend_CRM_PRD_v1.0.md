# Ascend CRM Product Requirements Document v1.0

**Product:** Ascend CRM  
**Platform:** AscendSME Connected Platform  
**Status:** Authoritative product baseline  
**Date:** 29 October 2026  
**Primary market:** Ghana  
**Expansion:** Africa  
**Inherits:** AscendSME Connected Platform Master PRD v3.0

---

## 1. Executive Summary

Ascend CRM is the customer relationship and retention product set of AscendSME.

> **Know your customers. Follow every opportunity. Bring them back.**

Ascend CRM is designed around the reality that many African SMEs manage customers through WhatsApp, phone contacts, walk-in interactions, Shop orders, POS receipts, bookings, invoices and staff memory. The CRM creates one connected customer history from the activity already happening across AscendSME.

A customer may first appear through Discover, enquire through WhatsApp, buy through POS, order through Shop, book through Services, receive an invoice through Documents and later receive a retention offer through CRM. All of these interactions must remain part of one customer relationship.

The CRM lifecycle is:

```text
Discover → Lead → Enquiry → Opportunity → Purchase / Booking → Fulfilment → Follow-up → Repeat Purchase → Loyal Customer
```

---

## 2. Product Positioning

Ascend CRM is:

> **The connected customer relationship layer for African businesses.**

It is not a separate customer database, mass-spam tool, generic enterprise CRM, standalone WhatsApp bot or disconnected marketing automation platform.

It must use the shared Customer Core, Communications Engine, Business Event Engine, Payments, Documents, Shop, Services, POS and Discover.

---

## 3. Problems to Solve

- Businesses lose customers after the first transaction.
- Enquiries are forgotten.
- Customer numbers are spread across phones and staff devices.
- Follow-up is inconsistent.
- Businesses cannot easily identify repeat or inactive customers.
- Sales opportunities are not structured.
- Communication history is disconnected from transactions.
- Campaigns are sent without segmentation or clear attribution.
- Customer retention depends too heavily on the owner's memory.

---

## 4. Product Principles

1. One customer relationship across the platform.
2. Follow-up should be easier than forgetting.
3. Use the channels SMEs already use.
4. Respect consent and channel rules.
5. Connect communication to commercial outcomes.
6. Do not reward message volume over real customer value.
7. Mobile should support action; web should support depth.
8. CRM must reuse shared tasks, documents, payments and communications.

---

## 5. Goals

### Business goals

- Improve repeat transactions.
- Reduce missed leads.
- Improve sales follow-up.
- Create monetizable messaging and automation.
- Increase value of POS, Shop, Services and Discover.
- Improve customer-level business intelligence.
- Strengthen customer-retention evidence.

### User goals

Businesses should be able to:

- see all customers in one place
- know where customers came from
- understand what they bought or booked
- track leads and opportunities
- know what needs follow-up
- send relevant messages
- automate reminders
- identify repeat and inactive customers
- create offers and campaigns
- measure conversion and retention

---

## 6. Non-Goals

Ascend CRM v1.0 will not initially:

- replace full contact-centre software
- scrape external customer data
- support unrestricted cold outreach
- become a complex enterprise CPQ system
- expose one business's customer records to another business
- infer marketing consent merely from having a phone number
- replace Shop, Services, Documents or POS transaction flows

---

## 7. Personas

- Business owner
- Sales staff
- Customer service staff
- Service provider
- Marketing operator
- Manager
- Customer

---

## 8. Product Surfaces

### Ascend Business Web

- CRM dashboard
- customer database
- pipeline
- segmentation
- campaigns
- automation
- analytics
- team configuration
- templates
- imports and exports

### Ascend Business Mobile

- customer lookup
- lead creation
- opportunity updates
- follow-ups
- quick messaging
- reminders
- activity history
- call notes

### Ascend Customer Web and Mobile

- preferences
- communication consent
- offers
- receipts
- order and booking history
- merchant follows

### Communication channels

WhatsApp, SMS, email and push are channels into the platform, not separate customer databases.

---

## 9. Core CRM Objects

- Customer
- Lead
- Enquiry
- Opportunity
- Pipeline Stage
- Activity
- Task
- Interaction
- Note
- Message
- Campaign
- Segment
- Consent
- Offer
- Customer Preference
- Tag
- Source
- Customer Value Summary
- Retention Status
- Automation
- Related Transaction
- Related Booking
- Related Document
- Related Payment

---

## 10. Core Requirements

| ID | Requirement |
|---|---|
| CRM-001 | CRM shall use the shared Customer Core rather than create a separate customer database. |
| CRM-002 | Customers created in POS shall be available to CRM subject to permissions. |
| CRM-003 | Customers created in Shop shall be available to CRM subject to permissions. |
| CRM-004 | Customers created in Services shall be available to CRM subject to permissions. |
| CRM-005 | Customers created in Documents shall be available to CRM subject to permissions. |
| CRM-006 | Discover interactions may enrich a customer relationship only where identity and consent permit. |
| CRM-007 | The system shall support duplicate detection and controlled merge. |
| CRM-008 | The system shall preserve customer source attribution. |
| CRM-009 | The customer profile shall show transaction history. |
| CRM-010 | The customer profile shall show booking history. |
| CRM-011 | The customer profile shall show document history. |
| CRM-012 | The customer profile shall show payment history according to permission. |
| CRM-013 | The customer profile shall show communication history. |
| CRM-014 | The customer profile shall show open opportunities. |
| CRM-015 | The customer profile shall show outstanding invoices where permitted. |
| CRM-016 | The system shall support leads. |
| CRM-017 | Leads shall support source, owner, status, next action and due date. |
| CRM-018 | Leads shall support estimated value and related products or services. |
| CRM-019 | Lead conversion shall avoid duplicate customer creation. |
| CRM-020 | The system shall support opportunities. |
| CRM-021 | Opportunities shall support pipeline stage. |
| CRM-022 | Opportunities shall support expected value and expected close date. |
| CRM-023 | Opportunities shall support related quotation, booking and staff. |
| CRM-024 | The system shall support configurable pipeline stages. |
| CRM-025 | Default stages shall include New, Contacted, Qualified, Proposal, Won and Lost. |
| CRM-026 | Businesses shall be able to simplify the pipeline. |
| CRM-027 | CRM shall not require every business to use an opportunity pipeline. |
| CRM-028 | Follow-up tasks shall use the shared Work Core. |
| CRM-029 | Follow-up tasks shall support assignment, due date and outcome. |
| CRM-030 | The system shall support call, WhatsApp, SMS, email and in-person interaction logging. |
| CRM-031 | The system shall distinguish system-recorded from manually logged interactions. |
| CRM-032 | The system shall support customer segmentation. |
| CRM-033 | Segments shall support recency, frequency and monetary value. |
| CRM-034 | Segments shall support product or service category. |
| CRM-035 | Segments shall support location, source, tags and inactivity. |
| CRM-036 | The system shall support dynamic and saved segments. |
| CRM-037 | The system shall support campaigns. |
| CRM-038 | Campaigns shall use the shared Communications Engine. |
| CRM-039 | Campaigns shall support WhatsApp where integrated. |
| CRM-040 | Campaigns shall support SMS where integrated. |
| CRM-041 | Campaigns shall support email. |
| CRM-042 | Campaigns shall respect consent and opt-outs. |
| CRM-043 | Campaigns shall support audience and message preview. |
| CRM-044 | Campaigns shall support draft, scheduled and sent states. |
| CRM-045 | Campaigns shall show variable channel cost before send. |
| CRM-046 | Variable-cost messaging may use Ascend Balance. |
| CRM-047 | Campaigns shall report delivery status. |
| CRM-048 | Campaigns shall report clicks or opens where supported. |
| CRM-049 | Campaigns shall report attributed transactions where supportable. |
| CRM-050 | Attribution reports shall distinguish verified attribution from correlation. |
| CRM-051 | The system shall support message templates. |
| CRM-052 | Templates shall support approved variables. |
| CRM-053 | Templates shall support transactional and marketing classification. |
| CRM-054 | The system shall maintain consent by channel, purpose, source and timestamp. |
| CRM-055 | Customers shall be able to opt out of relevant marketing. |
| CRM-056 | Transactional communication may continue where lawful and operationally necessary. |
| CRM-057 | The system shall support post-purchase follow-up. |
| CRM-058 | The system shall support reactivation campaigns. |
| CRM-059 | The system shall support repeat-purchase reminders. |
| CRM-060 | The system shall support booking reminders through Services. |
| CRM-061 | The system shall support invoice reminders through Documents. |
| CRM-062 | The system shall support new-stock campaigns through Catalogue. |
| CRM-063 | The system shall support simple automation triggers. |
| CRM-064 | Automation may trigger on purchase, booking, quote, overdue invoice or inactivity events. |
| CRM-065 | Automation shall support delay, condition and stop rules. |
| CRM-066 | Automation shall support audit history. |
| CRM-067 | The system shall prevent duplicate automated messages. |
| CRM-068 | The system shall support campaign frequency controls. |
| CRM-069 | The system shall support preferred-channel and do-not-contact settings. |
| CRM-070 | Following a business shall not automatically equal consent for all marketing. |
| CRM-071 | The system shall support manual and rule-based customer tags. |
| CRM-072 | The system shall support customer value summaries. |
| CRM-073 | Customer value summaries may include total transaction value, transaction count, first and last transaction dates and preferred categories. |
| CRM-074 | Customer value summaries shall preserve confidence and data freshness. |
| CRM-075 | The system shall support inactive-customer identification. |
| CRM-076 | Inactivity thresholds shall be configurable by business type. |
| CRM-077 | The system shall support repeat-customer identification. |
| CRM-078 | The system shall support lead-source, pipeline, conversion and retention reporting. |
| CRM-079 | The system shall support campaign and staff follow-up reporting. |
| CRM-080 | Reports shall respect role permissions. |
| CRM-081 | Business Mobile shall show follow-ups due, open opportunities and recent customer activity. |
| CRM-082 | Mobile shall support quick customer search and follow-up creation. |
| CRM-083 | Mobile shall support quick message actions. |
| CRM-084 | Mobile shall support offline notes and follow-up drafts. |
| CRM-085 | Offline actions shall synchronize safely. |
| CRM-086 | The system shall support customer import and export. |
| CRM-087 | Import shall support duplicate detection. |
| CRM-088 | Import shall not infer consent from possession of contact details. |
| CRM-089 | The Communications Engine shall own WhatsApp, SMS, email and push delivery. |
| CRM-090 | The Communications Engine shall own opt-outs and consent state. |
| CRM-091 | The system shall support customer reply capture where provider integrations allow. |
| CRM-092 | Replies shall remain associated with the same customer relationship. |
| CRM-093 | The system shall support shared inbox capabilities in a later release. |
| CRM-094 | Customer service issues shall be able to create Office tasks. |
| CRM-095 | CRM shall emit standard customer lifecycle events to the Business Event Engine. |
| CRM-096 | CRM shall contribute retention and conversion evidence where appropriate. |
| CRM-097 | Message volume alone shall not improve Sustainability Score. |
| CRM-098 | Paid campaign spend shall not improve Sustainability Score directly. |
| CRM-099 | The system shall avoid double-counting transactions already captured by POS, Shop or Services. |
| CRM-100 | CRM shall enforce business tenancy isolation and customer-data privacy. |
| CRM-101 | CRM shall support data access, correction and deletion where legally appropriate. |
| CRM-102 | CRM shall audit staff access to sensitive customer information. |
| CRM-103 | CRM shall support role- and location-based customer visibility. |
| CRM-104 | CRM shall not expose one merchant's customer history to another merchant. |
| CRM-105 | CRM shall support country-specific communication rules and local-currency costs. |

---

## 11. CRM Dashboard

The CRM dashboard should answer:

- Who needs follow-up today?
- Which opportunities are closest to conversion?
- Which customers have gone inactive?
- Which customers have returned?
- Which campaigns produced action?
- Which leads are being ignored?

Recommended cards:

- Follow-ups Due
- New Leads
- Open Opportunities
- Customers at Risk
- Repeat Customers
- Campaign Activity
- Recent Wins
- Recent Customer Activity

---

## 12. Customer Profile

The customer profile should be a timeline, not merely a contact card.

Example:

```text
Ama Mensah
Source: Discover
Customer since: 18 May 2026
Last purchase: 4 October 2026
Transactions: 8
Total transaction value: GHS 3,820
Outstanding: GHS 280
Preferred category: Women's shoes
Last interaction: WhatsApp, 12 days ago
Next action: Follow up with new-arrival offer
```

Recommended tabs:

- Overview
- Activity
- Transactions
- Bookings
- Documents
- Messages
- Opportunities
- Notes
- Preferences

---

## 13. Monetization

### Free / embedded

- customer records
- transaction history
- basic tags
- simple follow-up
- basic pipeline
- limited manual messaging
- basic customer insights

### Paid

- WhatsApp and SMS usage
- automation
- advanced segmentation
- campaign scheduling
- bulk messaging
- advanced pipeline
- shared inbox
- team assignment
- advanced analytics
- AI campaign drafting
- reactivation automation
- advanced attribution

CRM should preserve Ascend's commercial principle:

> **Charge for communication, automation and operating leverage, not for ownership of the customer record.**

---

## 14. Rollout

### Phase 1

- customer profile
- timeline
- leads
- basic pipeline
- follow-ups
- tags
- transaction history
- mobile CRM
- basic WhatsApp/SMS/email actions
- consent
- basic reports

### Phase 2

- segmentation
- campaigns
- automation
- reactivation
- advanced analytics
- staff assignment
- shared inbox foundation

### Phase 3

- advanced customer intelligence
- AI recommendations
- loyalty
- advanced attribution
- partner integrations
- sector-specific CRM templates

---

## 15. Success Metrics

**Headline metric:** Percentage of active businesses that convert CRM follow-up into repeat customer activity.

Supporting metrics:

- leads created
- lead-to-customer conversion
- opportunity win rate
- follow-up completion
- repeat customer rate
- customer reactivation
- retention
- campaign-to-transaction conversion
- communications revenue
- CRM paid conversion

---

## 16. Final Product Definition

Ascend CRM is:

> **The connected customer relationship and retention layer of AscendSME.**

It helps businesses understand where customers came from, what they bought, what needs to happen next and how to bring them back, using the same customer, transaction, payment, document, communication and evidence records already created across AscendSME.
