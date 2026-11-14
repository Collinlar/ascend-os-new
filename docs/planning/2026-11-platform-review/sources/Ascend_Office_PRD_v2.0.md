# AscendSME

## Ascend Office Product Requirements Document v2.0

*The connected people, work, operations and internal-control layer for African SMEs*

> **Product thesis**
>
> Ascend Office helps growing businesses organise the people and work behind every sale, order, service and location. It gives owners and managers control without turning the business into a complex enterprise system.

| Field | Value |
|---|---|
| Document owner | Bold Vision MultiTech / AscendSME Product |
| Product | Ascend Office |
| Version | 2.0 |
| Status | Authoritative product requirements baseline |
| Inherits | AscendSME Connected Platform Master PRD v2.0 |
| Primary market | Ghana |
| Expansion markets | Nigeria, Kenya, South Africa and other African markets |
| Date | 6 September 2026 |
| Format | Markdown |

> **CONFIDENTIAL PRODUCT DOCUMENT**

---

# Document Control

Ascend Office is one product set within the AscendSME Connected Platform. It is not a separate HR application, project-management application or ERP. It is the shared internal operating layer that connects staff, responsibilities, tasks, projects, attendance, approvals, expenses, procurement, locations and daily accountability to the commercial activity already happening through Ascend POS, Ascend Shop, Ascend Services and Ascend Documents.

Office operates through:

- **Ascend Business Web** for configuration, analysis, administration and complex management
- **Ascend Business Mobile** for action, approvals, monitoring, attendance and exceptions
- **Ascend POS Terminal Mode** for limited shift, cashier, attendance and location actions where relevant
- **Ascend Customer Web and Mobile** only where a customer-facing confirmation or update is required

The governing experience principle is:

> **Show the next action before showing the report.**

The governing architecture principle is:

> **One staff directory. One work system. One approval history. One operational record.**

## Revision History

| Version | Date | Change | Owner |
|---|---|---|---|
| 1.0 | Earlier concept | Office concept derived from HRM, Projects and operating workflows. | AscendSME Product |
| 2.0 | 6 September 2026 | Rebuilt Office as the connected people, work, operations and governance layer of the new AscendSME deployment. | AscendSME Product |

## Approval Roles

| Role | Responsibility |
|---|---|
| Founder / CEO | Product direction, positioning and commercial model |
| Product Lead | Scope, prioritisation, acceptance and roadmap |
| CTO / Engineering Lead | Architecture, security, sync and system integrity |
| Design Lead | Role-aware simplicity, responsive UX and accessibility |
| Operations Lead | Merchant workflows, assisted setup and deployment |
| Finance Lead | Expense, procurement and financial controls |
| Data and Evidence Lead | Events, evidence confidence and scoring governance |
| Commercial Lead | Packaging, Assurance, staff bands and pricing |

# Table of Contents

1. Executive Summary  
2. Problem and Market Context  
3. Product Definition and Positioning  
4. Vision and Product Promise  
5. Goals and Non-Goals  
6. Product Principles  
7. Target Business Archetypes  
8. Personas and Roles  
9. Product Scope and Release Model  
10. Product Surfaces and Channel Strategy  
11. Information Architecture  
12. Zero-Silo Architecture and Capability Ownership  
13. Office Dashboard and Daily Command Centre  
14. Core Requirements Catalogue  
15. People and Staff Management  
16. Roles, Permissions and Delegated Authority  
17. Attendance, Shifts and Presence  
18. Leave, Availability and Scheduling  
19. Tasks and Work Management  
20. Projects, Milestones and Recurring Work  
21. Approvals and Internal Controls  
22. Expenses and Internal Spending  
23. Procurement and Supplier Operations  
24. Locations and Multi-Location Operations  
25. Calendar, Coordination and Handover  
26. Cross-Product Workflows  
27. Business Mobile and Staff Experience  
28. Reporting and Business Pulse  
29. Offline, Sync and Recovery  
30. Evidence and Sustainability Score Integration  
31. Monetization and Commercial Packaging  
32. Bundles and Entitlements  
33. Institutional Deployment  
34. APIs and Integrations  
35. Security, Privacy and Audit  
36. Administration, Support and Migration  
37. Product Analytics and Success Metrics  
38. Rollout Plan  
39. Risks and Mitigations  
40. Dependencies and Constraints  
41. Out of Scope  
42. Open Decisions  
43. Future Enhancements  
44. Master Acceptance Scenarios  
45. Appendices

---

# 1. Executive Summary

Ascend Office is the internal operating system for growing SMEs using AscendSME.

It helps a business answer five daily questions:

1. What needs attention today?
2. Who is working?
3. What work is delayed?
4. What requires approval?
5. Is the business operating normally?

Office connects the people and work behind commercial activity.

A Shop order can become a fulfilment task. A Services booking can create a staff assignment. A POS location can connect cashier shifts and attendance. An accepted quotation can become a project. An approved purchase request can become a purchase order. An expense can require approval and flow into the shared financial foundation.

Ascend Office therefore creates operating structure without forcing SMEs into a heavy ERP.

Its five pillars are:

- **People** - staff, roles, attendance, leave and availability
- **Work** - tasks, projects, milestones, recurring work and assignments
- **Operations** - approvals, expenses, procurement and locations
- **Coordination** - calendar, activity, notes, handovers and notifications
- **Evidence** - operational consistency, governance, completion and control

The core promise is:

> **Manage your team, tasks, projects and internal operations from one simple business workspace.**

# 2. Problem and Market Context

As SMEs grow, the owner often becomes the operating system. The owner knows who is working, which customer is waiting, which order is delayed, which expense needs approval and who is responsible. This works until growth creates more people, more locations and more simultaneous work than one person can coordinate.

Common problems include:

- Staff responsibilities are unclear
- Attendance is informal
- Orders are assigned in chats
- Tasks are forgotten
- Expenses are approved verbally
- Procurement lacks traceability
- Owners cannot see what is happening when away
- Projects live in WhatsApp threads or notebooks
- Leave creates unexpected staffing gaps
- Shift records are disconnected from sales
- Staff access remains active after people leave
- The same person is recreated in multiple systems
- Operations depend excessively on the owner

Ascend Office turns everyday internal activity into structured, connected operating records.

# 3. Product Definition and Positioning

Ascend Office is:

> **The connected internal operations layer of AscendSME that helps businesses organise people, work, approvals and daily execution.**

It is not:

- A full enterprise ERP
- A payroll product at launch
- A generic team chat application
- A standalone HR suite
- A heavy project-management platform
- A corporate intranet
- A replacement for accounting
- A separate task or staff system for each product set

# 4. Vision and Product Promise

## 4.1 Vision

Every growing African SME should be able to build operating discipline without needing enterprise software, specialist administrators or multiple disconnected tools.

## 4.2 Promise

> **Keep the business organised as more people, customers, orders and responsibilities are added.**

## 4.3 Strategic role

Office converts commercial activity into operational accountability. It sits between customer-facing activity, staff execution, approvals, internal spending, procurement, documents, financial records and business evidence.

# 5. Goals and Non-Goals

## 5.1 Goals

1. Give owners daily visibility into people and work.
2. Give staff clear responsibilities and next actions.
3. Connect staff and tasks to POS, Shop, Services and Documents.
4. Reduce owner dependency.
5. Create practical and auditable approvals.
6. Improve operational consistency.
7. Support multi-location businesses.
8. Preserve internal accountability history.
9. Generate useful governance and operational evidence.
10. Monetize growing-team complexity through simple capacity-based packages.

## 5.2 Non-Goals

Office will not initially:

- Calculate full statutory payroll
- Replace specialist payroll providers
- Become a full enterprise ERP
- Provide generic internal social networking
- Support every complex project methodology
- Replace accounting
- Create separate staff records for POS, Shop or Services
- Expose employee-private information to unrelated roles
- Provide surveillance-heavy workforce tracking
- Require every staff member to install an app before the business can operate

# 6. Product Principles

1. Action before analysis.
2. Role-aware simplicity.
3. One staff identity across the platform.
4. Commercial activity can create work automatically.
5. Approvals must be explicit and auditable.
6. Mobile is for action, web is for depth.
7. Owner control should not mean owner dependency.
8. Attendance must be proportionate and privacy-aware.
9. The product should fit a three-person business and scale upward.
10. Operational evidence should come from real work, not box-ticking.
11. Shared capabilities should not be charged twice.
12. Office should extend product-set essentials rather than duplicate them.

# 7. Target Business Archetypes

- Retail shops
- Multi-branch retailers
- Restaurants and food businesses
- Salons and beauty businesses
- Service teams
- Cleaning and field-service businesses
- Professional firms
- Agencies
- Training businesses
- Distributors
- Repair businesses
- Small manufacturers
- Hospitality businesses
- Project-based businesses
- Institution-supported SME cohorts

# 8. Personas and Roles

| Persona | Primary need |
|---|---|
| Owner | Business-wide visibility, control and approvals |
| General manager | Daily operating control without owner-only access |
| Location manager | Staff, work, attendance and approvals for assigned locations |
| Team / project lead | Assignment, progress, deadlines and escalation |
| Staff member | Clear work, schedule, requests and updates |
| Cashier | Shift, POS access and limited operational actions |
| Service provider | Availability, bookings, tasks and customer-linked work |
| Finance / admin officer | Expenses, approvals, procurement and records |
| People administrator | Staff, leave, attendance and access changes |
| External accountant | Restricted reporting or export access |

# 9. Product Scope and Release Model

## MVP

- Staff directory
- Roles and permissions
- Locations
- Attendance
- Shift visibility
- Leave requests
- Tasks
- Projects and milestones
- Approvals
- Expenses
- Basic procurement
- Calendar
- Activity feed
- Business Web
- Business Mobile
- POS shift integration
- Shop fulfilment integration
- Services assignment integration
- Documents purchase-order integration
- Business Pulse
- Evidence events
- Audit history

## Next

- Recurring work
- Handovers
- Procurement receiving
- Advanced approvals
- Project templates
- Multi-location benchmarking
- Accountant access
- Advanced operational reports
- Performance check-ins
- Workflow automation

## Later

- Payroll integrations
- Workforce planning
- Advanced performance management
- Asset management
- Advanced procurement
- Sector-specific workflows
- Advanced AI operational recommendations
- Partner APIs

# 10. Product Surfaces and Channel Strategy

| Experience | Primary use |
|---|---|
| Business Web | Configuration, staff setup, projects, procurement, reports and complex management |
| Business Mobile | Daily command centre, attendance, approvals, alerts, work and owner monitoring |
| POS Terminal | Cashier shift, terminal-specific attendance and limited handover actions |
| Customer Web | Authorized progress, fulfilment or completion confirmation only |
| Customer Mobile | Authorized progress and completion notifications only |

The channel principle is:

> **Web is for configuration, analysis and complex management. Mobile is for action, monitoring and exceptions.**

# 11. Information Architecture

## Business Web

1. Home
2. Team
3. Work
4. Projects
5. Approvals
6. Expenses
7. Procurement
8. Calendar
9. Locations
10. Activity
11. Reports
12. Settings

## Business Mobile

1. Home
2. Work
3. Team
4. Calendar
5. More

# 12. Zero-Silo Architecture and Capability Ownership

| Capability | Canonical owner | Office role |
|---|---|---|
| Business identity | Shared Business Core | Business and location context |
| Staff | People and Access | Team, attendance, roles and assignments |
| Customers | Customer Core | Customer-linked work |
| Catalogue | Catalogue Core | Products and services referenced in work |
| Inventory | Inventory Core | Stock requests and fulfilment references |
| Payments | Payments Core | Expense and procurement payment references |
| Documents | Documents Core | Purchase orders, agreements and supporting records |
| Work | Work Core | Tasks, projects, assignments and approvals |
| Messaging | Shared Messaging | Notifications and reminders |
| Evidence | Evidence Engine | Operational and governance evidence |
| Entitlements | Commercial Engine | Staff bands, duration and capabilities |

# 13. Office Dashboard and Daily Command Centre

The dashboard is not a vanity analytics page. It should show what the user needs to act on next.

Recommended modules:

- Greeting and current business/location context
- Due Today
- Awaiting Approval
- At Risk
- Team Active
- Priority Actions
- Team Today
- Work in Progress
- Today’s Schedule
- Approvals
- Recent Activity
- Business Pulse

# 14. Core Requirements Catalogue

### 14.1 Master platform requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-MST-001 | Ascend Office shall inherit the AscendSME Connected Platform Master PRD v2.0. | Must |
| OFF-MST-002 | Office shall use the shared business identity, location, staff, customer, document, financial and evidence foundations. | Must |
| OFF-MST-003 | Office shall use the shared staff directory rather than create a product-specific workforce directory. | Must |
| OFF-MST-004 | Office shall use the shared role and permission engine. | Must |
| OFF-MST-005 | Office shall use the shared Work Core for tasks, projects and assignments. | Must |
| OFF-MST-006 | Office shall use Ascend Documents for purchase orders and related commercial documents. | Must |
| OFF-MST-007 | Office shall use shared Payments and the Financial Foundation for approved expense and supplier payment records. | Must |
| OFF-MST-008 | Office shall use shared Messaging for notifications. | Must |
| OFF-MST-009 | Office shall emit governed events to the Business Event Engine. | Must |
| OFF-MST-010 | Office shall contribute evidence through the Business Evidence Ledger. | Must |
| OFF-MST-011 | Office shall support one or multiple business locations. | Must |
| OFF-MST-012 | Office shall preserve shared identifiers across web, mobile and POS terminal experiences. | Must |
| OFF-MST-013 | Office shall not create a separate inventory ledger. | Must |
| OFF-MST-014 | Office shall not create a separate financial ledger. | Must |
| OFF-MST-015 | Office shall not create duplicate customer records. | Must |
| OFF-MST-016 | Office shall not create separate approval engines for each product set. | Must |
| OFF-MST-017 | Office shall support embedded essentials in POS, Shop and Services without forcing full Office purchase. | Must |
| OFF-MST-018 | Shared capabilities shall not be charged twice through separate bundles. | Must |
| OFF-MST-019 | Cross-product workflow creation shall be idempotent. | Must |
| OFF-MST-020 | Any conflict with the Master PRD shall require an approved product-governance decision. | Must |

### 14.2 Dashboard and Business Pulse requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-DAS-001 | The default Office home shall prioritize actionable information over vanity metrics. | Must |
| OFF-DAS-002 | The dashboard shall show work due today. | Must |
| OFF-DAS-003 | The dashboard shall show pending approvals. | Must |
| OFF-DAS-004 | The dashboard shall show work at risk. | Must |
| OFF-DAS-005 | The dashboard shall show team members active today. | Must |
| OFF-DAS-006 | The dashboard shall show priority actions. | Must |
| OFF-DAS-007 | The dashboard shall show today’s schedule. | Must |
| OFF-DAS-008 | The dashboard shall show recent operational activity. | Must |
| OFF-DAS-009 | The dashboard shall show Business Pulse indicators. | Must |
| OFF-DAS-010 | The dashboard shall adapt content by user role. | Must |
| OFF-DAS-011 | Owners shall be able to view business-wide information subject to access scope. | Must |
| OFF-DAS-012 | Location managers shall see only assigned locations. | Must |
| OFF-DAS-013 | Staff shall see personal work and authorized team context only. | Must |
| OFF-DAS-014 | The dashboard shall distinguish urgent, warning and informational states. | Must |
| OFF-DAS-015 | The dashboard shall show data freshness where relevant. | Must |
| OFF-DAS-016 | The dashboard shall provide drill-through to source records. | Must |
| OFF-DAS-017 | The dashboard shall support mobile and web layouts. | Must |
| OFF-DAS-018 | Business Mobile shall prioritize exceptions and actions. | Must |
| OFF-DAS-019 | Business Web shall provide deeper operational context. | Must |
| OFF-DAS-020 | The dashboard shall avoid exposing private people information to unauthorized users. | Must |
| OFF-DAS-021 | The dashboard shall support useful empty states for new businesses. | Must |
| OFF-DAS-022 | Business Pulse shall summarize current operational health rather than duplicate the Sustainability Score. | Must |
| OFF-DAS-023 | Business Pulse shall link each warning to underlying records. | Must |
| OFF-DAS-024 | Business Pulse shall support business-archetype-specific indicators. | Must |
| OFF-DAS-025 | Users shall be able to personalize selected dashboard modules within role constraints. | Should |

### 14.3 People and staff requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-PEO-001 | Office shall maintain one shared staff identity per person within a business context. | Must |
| OFF-PEO-002 | A person may hold more than one business role. | Must |
| OFF-PEO-003 | A person may be assigned to more than one location. | Must |
| OFF-PEO-004 | The staff record shall support name, phone and approved contact details. | Must |
| OFF-PEO-005 | The staff record shall support job title. | Must |
| OFF-PEO-006 | The staff record shall support team or department. | Must |
| OFF-PEO-007 | The staff record shall support primary location. | Must |
| OFF-PEO-008 | The staff record shall support additional permitted locations. | Must |
| OFF-PEO-009 | The staff record shall support reporting manager. | Must |
| OFF-PEO-010 | The staff record shall support engagement type such as employee, contractor or temporary staff. | Must |
| OFF-PEO-011 | The staff record shall support start date. | Must |
| OFF-PEO-012 | The staff record shall support optional end date. | Must |
| OFF-PEO-013 | The staff record shall support active, invited, suspended and exited status. | Must |
| OFF-PEO-014 | The system shall support staff invitation through approved channels. | Must |
| OFF-PEO-015 | The system shall support assisted staff creation by authorized business users or Ascend support. | Must |
| OFF-PEO-016 | The system shall detect likely duplicate people. | Must |
| OFF-PEO-017 | The system shall preserve historical work after a staff member exits. | Must |
| OFF-PEO-018 | Exited staff shall lose operational access according to configured policy. | Must |
| OFF-PEO-019 | The system shall support temporary workers without weakening access control. | Must |
| OFF-PEO-020 | The system shall support staff notes with restricted visibility. | Must |
| OFF-PEO-021 | The system shall support staff documents through shared Briefcase capabilities where appropriate. | Must |
| OFF-PEO-022 | The system shall support staff-profile updates subject to permission. | Must |
| OFF-PEO-023 | Sensitive staff fields shall have stronger access restrictions. | Must |
| OFF-PEO-024 | The system shall support bulk staff import through approved templates. | Must |
| OFF-PEO-025 | The system shall support business-owned export of staff records. | Must |
| OFF-PEO-026 | The system shall preserve audit history for material staff changes. | Must |
| OFF-PEO-027 | The system shall support configurable organization charts for businesses that need them. | Should |
| OFF-PEO-028 | The system shall support workforce planning without changing the canonical staff identity model. | Later |

### 14.4 Roles, permissions and delegated authority requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-ROL-001 | Office shall use the shared role and permission engine. | Must |
| OFF-ROL-002 | The system shall provide sensible predefined roles. | Must |
| OFF-ROL-003 | The system shall support custom roles. | Must |
| OFF-ROL-004 | Permissions shall be capability-based rather than screen-only. | Must |
| OFF-ROL-005 | Permissions shall support location scope. | Must |
| OFF-ROL-006 | Permissions shall support team or project scope. | Must |
| OFF-ROL-007 | Permissions shall support amount thresholds. | Must |
| OFF-ROL-008 | Permissions shall support expense approval authority. | Must |
| OFF-ROL-009 | Permissions shall support procurement approval authority. | Must |
| OFF-ROL-010 | Permissions shall support staff-record access scope. | Must |
| OFF-ROL-011 | Permissions shall support task and project management scope. | Must |
| OFF-ROL-012 | Permissions shall support document approval where connected. | Must |
| OFF-ROL-013 | The system shall support delegated authority. | Must |
| OFF-ROL-014 | Delegation shall record delegator and delegate. | Must |
| OFF-ROL-015 | Delegation shall have an effective start and end time. | Must |
| OFF-ROL-016 | Delegation shall expire automatically. | Must |
| OFF-ROL-017 | The system shall preserve delegation history. | Must |
| OFF-ROL-018 | The system shall support maker-checker separation. | Must |
| OFF-ROL-019 | The system shall prevent self-approval where configured. | Must |
| OFF-ROL-020 | The system shall support temporary elevated access. | Must |
| OFF-ROL-021 | Temporary elevated access shall expire automatically. | Must |
| OFF-ROL-022 | The system shall support immediate access revocation. | Must |
| OFF-ROL-023 | Role changes shall propagate to Business Web, Business Mobile and POS access. | Must |
| OFF-ROL-024 | The system shall show a clear reason when an action is unavailable. | Must |
| OFF-ROL-025 | Direct API access shall enforce the same permission rules as the user interface. | Must |
| OFF-ROL-026 | The system shall support periodic access review. | Must |
| OFF-ROL-027 | High-risk role changes shall require stronger authentication. | Must |
| OFF-ROL-028 | The system shall preserve audit history for role and permission changes. | Must |

### 14.5 Attendance and presence requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-ATT-001 | Office shall support staff attendance recording. | Must |
| OFF-ATT-002 | Attendance shall support clock-in and clock-out. | Must |
| OFF-ATT-003 | Attendance shall support mobile capture. | Must |
| OFF-ATT-004 | Attendance shall support POS terminal capture where configured. | Must |
| OFF-ATT-005 | Attendance shall support authorized manual capture. | Must |
| OFF-ATT-006 | Attendance shall record location context where available and permitted. | Must |
| OFF-ATT-007 | Attendance shall record shift context where applicable. | Must |
| OFF-ATT-008 | Attendance shall support present, late, absent, excused and incomplete states. | Must |
| OFF-ATT-009 | The system shall support missing clock-out detection. | Must |
| OFF-ATT-010 | The system shall support attendance correction requests. | Must |
| OFF-ATT-011 | Attendance corrections shall require a reason. | Must |
| OFF-ATT-012 | The original attendance record shall remain preserved after correction. | Must |
| OFF-ATT-013 | The system shall support manager approval of corrections. | Must |
| OFF-ATT-014 | The system shall support daily attendance summaries. | Must |
| OFF-ATT-015 | The system shall support attendance exception views. | Must |
| OFF-ATT-016 | The system shall support configured grace periods. | Must |
| OFF-ATT-017 | The system shall support working-day calendars. | Must |
| OFF-ATT-018 | The system shall support business holidays. | Must |
| OFF-ATT-019 | The system shall support approved geolocation checks where lawful and proportionate. | Must |
| OFF-ATT-020 | The system shall not require continuous employee location tracking. | Must |
| OFF-ATT-021 | Location-based attendance shall be configurable rather than mandatory. | Must |
| OFF-ATT-022 | The system shall support offline attendance capture. | Must |
| OFF-ATT-023 | Offline attendance shall synchronize without duplicate records. | Must |
| OFF-ATT-024 | The system shall record the capture channel and device context. | Must |
| OFF-ATT-025 | The system shall support attendance export. | Must |
| OFF-ATT-026 | Attendance events shall feed the Business Event Engine. | Must |
| OFF-ATT-027 | Attendance alone shall not be treated as evidence of good business performance. | Must |
| OFF-ATT-028 | Attendance information shall remain private to authorized business roles. | Must |
| OFF-ATT-029 | The system may support QR or kiosk attendance while preserving the same attendance record. | Later |

### 14.6 Shift management requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-SHF-001 | Office shall use the shared shift capability used by POS where applicable. | Must |
| OFF-SHF-002 | The system shall support shift templates. | Must |
| OFF-SHF-003 | The system shall support one-off shifts. | Must |
| OFF-SHF-004 | The system shall support recurring shifts. | Must |
| OFF-SHF-005 | Shifts shall support location. | Must |
| OFF-SHF-006 | Shifts shall support role requirements. | Must |
| OFF-SHF-007 | Shifts shall support assigned staff. | Must |
| OFF-SHF-008 | Shifts shall support start and end times. | Must |
| OFF-SHF-009 | Shifts shall support break periods where configured. | Must |
| OFF-SHF-010 | The system shall support open-shift detection. | Must |
| OFF-SHF-011 | The system shall support late-start alerts. | Must |
| OFF-SHF-012 | The system shall support incomplete-shift alerts. | Must |
| OFF-SHF-013 | The system shall support shift handover notes. | Must |
| OFF-SHF-014 | The system shall support shift reassignment with permission. | Must |
| OFF-SHF-015 | The system shall support shift-swap requests subject to approval. | Should |
| OFF-SHF-016 | The system shall support cashier shift linkage to POS. | Must |
| OFF-SHF-017 | The system shall support POS reconciliation status within the relevant shift. | Must |
| OFF-SHF-018 | The system shall support service-provider shift linkage to availability. | Must |
| OFF-SHF-019 | The system shall warn of shift conflicts. | Must |
| OFF-SHF-020 | The system shall warn of staffing gaps. | Must |
| OFF-SHF-021 | The system shall preserve historical shift assignments. | Must |
| OFF-SHF-022 | The system shall support mobile shift views. | Must |
| OFF-SHF-023 | Manager overrides shall require a reason and audit entry. | Must |
| OFF-SHF-024 | Shift events shall feed the Business Event Engine. | Must |

### 14.7 Leave and availability requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-LEV-001 | The system shall support leave requests. | Must |
| OFF-LEV-002 | The system shall support configurable leave types. | Must |
| OFF-LEV-003 | Leave shall support start and end dates. | Must |
| OFF-LEV-004 | Leave shall support partial-day requests where configured. | Must |
| OFF-LEV-005 | Leave shall support a reason field. | Must |
| OFF-LEV-006 | Leave shall support attachments where required. | Must |
| OFF-LEV-007 | The system shall support approval and rejection. | Must |
| OFF-LEV-008 | Rejection shall support a reason. | Must |
| OFF-LEV-009 | The system shall support leave cancellation. | Must |
| OFF-LEV-010 | Approved leave shall update staff availability. | Must |
| OFF-LEV-011 | Approved leave shall appear on authorized calendars. | Must |
| OFF-LEV-012 | The system shall warn of conflicts with scheduled shifts. | Must |
| OFF-LEV-013 | The system shall warn of conflicts with Services bookings or assignments. | Must |
| OFF-LEV-014 | The system shall support planned unavailability outside formal leave. | Must |
| OFF-LEV-015 | The system shall support team absence visibility without exposing sensitive reasons. | Must |
| OFF-LEV-016 | The system shall support mobile leave requests. | Must |
| OFF-LEV-017 | The system shall notify the appropriate approver. | Must |
| OFF-LEV-018 | The system shall preserve approval history. | Must |
| OFF-LEV-019 | The system shall support leave balances where the business enables them. | Should |
| OFF-LEV-020 | Leave-balance presentation shall not imply statutory payroll compliance. | Must |
| OFF-LEV-021 | Sensitive leave information shall have restricted visibility. | Must |

### 14.8 Tasks and work-management requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-TSK-001 | The system shall support task creation. | Must |
| OFF-TSK-002 | Tasks shall support title and description. | Must |
| OFF-TSK-003 | Tasks shall support one primary assignee. | Must |
| OFF-TSK-004 | Tasks shall support collaborators where configured. | Must |
| OFF-TSK-005 | Tasks shall support due date and time. | Must |
| OFF-TSK-006 | Tasks shall support priority. | Must |
| OFF-TSK-007 | Tasks shall support status. | Must |
| OFF-TSK-008 | Tasks shall support location. | Must |
| OFF-TSK-009 | Tasks shall support project linkage. | Must |
| OFF-TSK-010 | Tasks shall support customer linkage. | Must |
| OFF-TSK-011 | Tasks shall support Shop order linkage. | Must |
| OFF-TSK-012 | Tasks shall support Services booking linkage. | Must |
| OFF-TSK-013 | Tasks shall support document linkage. | Must |
| OFF-TSK-014 | Tasks shall support inventory or product linkage where relevant. | Must |
| OFF-TSK-015 | Tasks shall support attachments. | Must |
| OFF-TSK-016 | Tasks shall support comments. | Must |
| OFF-TSK-017 | Tasks shall support checklists. | Must |
| OFF-TSK-018 | Tasks shall support tags or categories. | Must |
| OFF-TSK-019 | Tasks shall support reminders. | Must |
| OFF-TSK-020 | Tasks shall support blocked status. | Must |
| OFF-TSK-021 | Tasks shall support overdue status. | Must |
| OFF-TSK-022 | Tasks shall support completion notes. | Must |
| OFF-TSK-023 | Tasks shall support completion evidence attachments. | Must |
| OFF-TSK-024 | The system shall support task reassignment. | Must |
| OFF-TSK-025 | The system shall preserve assignee history. | Must |
| OFF-TSK-026 | The system shall notify users of new assignments. | Must |
| OFF-TSK-027 | The system shall notify users of material changes. | Must |
| OFF-TSK-028 | The system shall support mobile task completion. | Must |
| OFF-TSK-029 | The system shall support offline task updates. | Must |
| OFF-TSK-030 | The system shall support task templates. | Must |
| OFF-TSK-031 | The system shall support automatic task creation from product-set events. | Must |
| OFF-TSK-032 | Automatic task creation shall be idempotent. | Must |
| OFF-TSK-033 | The system shall support escalation for overdue or blocked work. | Must |
| OFF-TSK-034 | The system shall support manager review of completed work where configured. | Must |
| OFF-TSK-035 | The system shall support recurring tasks. | Must |
| OFF-TSK-036 | The system shall support simple task dependencies. | Should |
| OFF-TSK-037 | The system shall report completed, overdue and blocked work. | Must |
| OFF-TSK-038 | The system shall provide each staff member with a personal work view. | Must |
| OFF-TSK-039 | The system shall preserve task audit history. | Must |
| OFF-TSK-040 | Task volume alone shall not improve readiness or sustainability scores. | Must |

### 14.9 Project, milestone and recurring-work requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-PRJ-001 | The system shall support project creation. | Must |
| OFF-PRJ-002 | Projects shall support name and description. | Must |
| OFF-PRJ-003 | Projects shall support owner and project lead. | Must |
| OFF-PRJ-004 | Projects shall support team members. | Must |
| OFF-PRJ-005 | Projects shall support customer linkage. | Must |
| OFF-PRJ-006 | Projects shall support start and target end dates. | Must |
| OFF-PRJ-007 | Projects shall support status and priority. | Must |
| OFF-PRJ-008 | Projects shall support location. | Must |
| OFF-PRJ-009 | Projects shall support milestones. | Must |
| OFF-PRJ-010 | Milestones shall support owners and due dates. | Must |
| OFF-PRJ-011 | Projects shall support linked tasks. | Must |
| OFF-PRJ-012 | Projects shall support files and notes. | Must |
| OFF-PRJ-013 | Projects shall support related quotations. | Must |
| OFF-PRJ-014 | Projects shall support related agreements. | Must |
| OFF-PRJ-015 | Projects shall support related invoices and payments. | Must |
| OFF-PRJ-016 | Projects shall support expenses. | Must |
| OFF-PRJ-017 | Projects shall support procurement records. | Must |
| OFF-PRJ-018 | Projects shall support completion records. | Must |
| OFF-PRJ-019 | Projects shall support customer confirmation where the workflow requires it. | Must |
| OFF-PRJ-020 | The system shall support project risk flags. | Must |
| OFF-PRJ-021 | The system shall detect overdue milestones. | Must |
| OFF-PRJ-022 | The system shall support project templates. | Must |
| OFF-PRJ-023 | The system shall support mobile project updates. | Must |
| OFF-PRJ-024 | The system shall support project-level permissions. | Must |
| OFF-PRJ-025 | The system shall support project reporting. | Must |
| OFF-PRJ-026 | The system shall preserve project activity history. | Must |
| OFF-PRJ-027 | The system shall preserve related-document history. | Must |
| OFF-PRJ-028 | The system shall support project archive without deleting history. | Must |
| OFF-PRJ-029 | The system shall support recurring project templates. | Should |
| OFF-PRJ-030 | The system shall support simple task dependencies within projects. | Should |
| OFF-PRJ-031 | The system shall support advanced planning only without turning Office into an enterprise project suite. | Later |

### 14.10 Approval and internal-control requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-APR-001 | Office shall provide one shared approval framework for internal operational actions. | Must |
| OFF-APR-002 | Approval requests shall identify the action requiring approval. | Must |
| OFF-APR-003 | Approval requests shall identify requester and approver. | Must |
| OFF-APR-004 | Approval requests shall support one or more approval levels. | Must |
| OFF-APR-005 | Approval rules shall support amount thresholds. | Must |
| OFF-APR-006 | Approval rules shall support request type. | Must |
| OFF-APR-007 | Approval rules shall support role. | Must |
| OFF-APR-008 | Approval rules shall support location. | Must |
| OFF-APR-009 | Approval rules shall support category. | Must |
| OFF-APR-010 | Approval requests shall support comments. | Must |
| OFF-APR-011 | Approvers shall be able to approve. | Must |
| OFF-APR-012 | Approvers shall be able to reject. | Must |
| OFF-APR-013 | Approvers shall be able to request changes. | Must |
| OFF-APR-014 | The system shall preserve approval history. | Must |
| OFF-APR-015 | The system shall support delegated approval. | Must |
| OFF-APR-016 | The system shall support escalation. | Must |
| OFF-APR-017 | The system shall support approval reminders. | Must |
| OFF-APR-018 | The system shall support mobile approval. | Must |
| OFF-APR-019 | The system shall support web approval. | Must |
| OFF-APR-020 | The system shall prevent unauthorized approval. | Must |
| OFF-APR-021 | The system shall prevent self-approval where maker-checker is required. | Must |
| OFF-APR-022 | The system shall support expense approvals. | Must |
| OFF-APR-023 | The system shall support procurement approvals. | Must |
| OFF-APR-024 | The system shall support leave approvals. | Must |
| OFF-APR-025 | The system shall support sensitive inventory-adjustment approvals through shared capabilities. | Must |
| OFF-APR-026 | The system shall support refund or discount approvals through shared capabilities. | Must |
| OFF-APR-027 | The system shall support document-issue approval where configured. | Must |
| OFF-APR-028 | The system shall support high-risk access-change approval. | Must |
| OFF-APR-029 | The system shall show pending approval counts by user. | Must |
| OFF-APR-030 | The system shall support reason codes. | Must |
| OFF-APR-031 | The system shall support emergency override where configured. | Must |
| OFF-APR-032 | Emergency override shall require a reason. | Must |
| OFF-APR-033 | Emergency override shall be highlighted in audit history. | Must |
| OFF-APR-034 | Approval configuration changes shall be auditable. | Must |
| OFF-APR-035 | Approval events shall feed the Business Event Engine. | Must |

### 14.11 Expense-management requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-EXP-001 | The system shall support expense capture. | Must |
| OFF-EXP-002 | Expenses shall support category. | Must |
| OFF-EXP-003 | Expenses shall support amount and currency. | Must |
| OFF-EXP-004 | Expenses shall support date. | Must |
| OFF-EXP-005 | Expenses shall support location. | Must |
| OFF-EXP-006 | Expenses shall support submitter. | Must |
| OFF-EXP-007 | Expenses shall support project linkage. | Must |
| OFF-EXP-008 | Expenses shall support customer, order or booking linkage where relevant. | Must |
| OFF-EXP-009 | Expenses shall support supplier linkage. | Must |
| OFF-EXP-010 | Expenses shall support receipt or supporting-document attachments. | Must |
| OFF-EXP-011 | Business Mobile shall support camera capture of expense evidence. | Must |
| OFF-EXP-012 | Expenses shall support notes. | Must |
| OFF-EXP-013 | Expenses shall support payment method. | Must |
| OFF-EXP-014 | Expenses shall support approval status. | Must |
| OFF-EXP-015 | Expenses shall support reimbursement status where relevant. | Must |
| OFF-EXP-016 | The system shall support business-defined expense policies. | Must |
| OFF-EXP-017 | The system shall support amount-based approval thresholds. | Must |
| OFF-EXP-018 | The system shall support cash expenses. | Must |
| OFF-EXP-019 | The system shall support Mobile Money expenses. | Must |
| OFF-EXP-020 | The system shall support card or bank expenses where recorded. | Must |
| OFF-EXP-021 | The system shall support pending, approved, rejected and paid states. | Must |
| OFF-EXP-022 | The system shall detect likely duplicate expense submissions where feasible. | Must |
| OFF-EXP-023 | The system shall support controlled expense corrections. | Must |
| OFF-EXP-024 | Corrections shall preserve original values. | Must |
| OFF-EXP-025 | Approved expenses shall feed the shared Financial Foundation. | Must |
| OFF-EXP-026 | The system shall preserve payment verification confidence. | Must |
| OFF-EXP-027 | The system shall support expense export. | Must |
| OFF-EXP-028 | The system shall support project and location expense reporting. | Must |
| OFF-EXP-029 | The system shall support staff expense reporting subject to permission. | Must |
| OFF-EXP-030 | Expense events shall feed the Business Event Engine. | Must |
| OFF-EXP-031 | A receipt image alone shall not be treated as verified payment. | Must |
| OFF-EXP-032 | The system shall support accountant review where entitled. | Must |
| OFF-EXP-033 | The system shall preserve expense audit history. | Must |

### 14.12 Procurement requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-PRO-001 | The system shall support purchase requests. | Must |
| OFF-PRO-002 | Purchase requests shall identify requester. | Must |
| OFF-PRO-003 | Purchase requests shall support products, services or custom items. | Must |
| OFF-PRO-004 | Purchase requests shall support quantity. | Must |
| OFF-PRO-005 | Purchase requests shall support expected amount. | Must |
| OFF-PRO-006 | Purchase requests shall support suggested supplier. | Must |
| OFF-PRO-007 | Purchase requests shall support location. | Must |
| OFF-PRO-008 | Purchase requests shall support project linkage. | Must |
| OFF-PRO-009 | Purchase requests shall support justification. | Must |
| OFF-PRO-010 | Purchase requests shall support attachments. | Must |
| OFF-PRO-011 | Purchase requests shall follow configured approval rules. | Must |
| OFF-PRO-012 | Approved purchase requests shall support supplier selection. | Must |
| OFF-PRO-013 | The system shall generate purchase orders through Ascend Documents. | Must |
| OFF-PRO-014 | Purchase orders shall preserve approval linkage. | Must |
| OFF-PRO-015 | The system shall support expected delivery date. | Must |
| OFF-PRO-016 | The system shall support goods receipt. | Must |
| OFF-PRO-017 | The system shall support service receipt. | Must |
| OFF-PRO-018 | Goods receipt shall update shared Inventory where applicable. | Must |
| OFF-PRO-019 | The system shall support partial receipt. | Must |
| OFF-PRO-020 | The system shall support damaged or rejected receipt states. | Must |
| OFF-PRO-021 | The system shall support supplier invoice attachment or linkage. | Must |
| OFF-PRO-022 | The system shall support supplier payment linkage. | Must |
| OFF-PRO-023 | The system shall support outstanding procurement tracking. | Must |
| OFF-PRO-024 | Purchase-order amendments shall preserve prior versions and approval history. | Must |
| OFF-PRO-025 | Procurement cancellation shall require a reason. | Must |
| OFF-PRO-026 | The system shall support procurement reporting. | Must |
| OFF-PRO-027 | The system shall support mobile goods receipt. | Must |
| OFF-PRO-028 | The system shall support location-based procurement. | Must |
| OFF-PRO-029 | The system shall support centralized procurement for multiple locations. | Must |
| OFF-PRO-030 | The system shall preserve request-to-payment history. | Must |
| OFF-PRO-031 | Purchase-order creation shall be idempotent. | Must |
| OFF-PRO-032 | Procurement events shall feed the Business Event Engine. | Must |
| OFF-PRO-033 | The system shall support supplier acknowledgement. | Should |
| OFF-PRO-034 | The system shall support supplier performance observations. | Should |
| OFF-PRO-035 | The system shall support richer supplier portals without changing the shared supplier model. | Later |

### 14.13 Location and multi-location requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-LOC-001 | Office shall use shared business locations. | Must |
| OFF-LOC-002 | The system shall support one or more active locations. | Must |
| OFF-LOC-003 | Staff shall have permitted location scope. | Must |
| OFF-LOC-004 | Tasks shall support location assignment. | Must |
| OFF-LOC-005 | Projects shall support location context. | Must |
| OFF-LOC-006 | Attendance shall support location context. | Must |
| OFF-LOC-007 | Shifts shall support location context. | Must |
| OFF-LOC-008 | Expenses shall support location context. | Must |
| OFF-LOC-009 | Procurement shall support location context. | Must |
| OFF-LOC-010 | Approvals shall support location scope. | Must |
| OFF-LOC-011 | The dashboard shall support location filtering. | Must |
| OFF-LOC-012 | Owners shall be able to compare authorized locations. | Must |
| OFF-LOC-013 | Location managers shall see only assigned locations. | Must |
| OFF-LOC-014 | The system shall support temporary staff reassignment across locations. | Must |
| OFF-LOC-015 | The system shall support location opening, temporary closure and closure states. | Must |
| OFF-LOC-016 | The system shall preserve history after location closure. | Must |
| OFF-LOC-017 | The system shall support location-specific business hours. | Must |
| OFF-LOC-018 | The system shall support location-specific operational alerts. | Must |
| OFF-LOC-019 | The system shall support central and local approval models. | Must |
| OFF-LOC-020 | The system shall support central procurement. | Must |
| OFF-LOC-021 | The system shall support cross-location project teams. | Must |
| OFF-LOC-022 | The system shall support business-wide and location-level reports. | Must |
| OFF-LOC-023 | The system shall prevent users from viewing unauthorized locations. | Must |
| OFF-LOC-024 | The system shall support location-level Business Pulse comparison. | Should |

### 14.14 Calendar, schedule, coordination and handover requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-CAL-001 | Office shall provide a shared business calendar. | Must |
| OFF-CAL-002 | The calendar shall show shifts. | Must |
| OFF-CAL-003 | The calendar shall show approved leave. | Must |
| OFF-CAL-004 | The calendar shall show tasks and milestones. | Must |
| OFF-CAL-005 | The calendar shall show Services bookings where relevant and permitted. | Must |
| OFF-CAL-006 | The calendar shall support business events. | Must |
| OFF-CAL-007 | Business Web shall support day, week and month views. | Must |
| OFF-CAL-008 | Business Mobile shall support a simplified agenda and day view. | Must |
| OFF-CAL-009 | The system shall support personal calendars. | Must |
| OFF-CAL-010 | The system shall support team calendars. | Must |
| OFF-CAL-011 | The system shall support location calendars. | Must |
| OFF-CAL-012 | The system shall support project calendars. | Must |
| OFF-CAL-013 | The system shall detect obvious schedule conflicts. | Must |
| OFF-CAL-014 | The system shall show staff availability to authorized users. | Must |
| OFF-CAL-015 | The system shall support handover notes. | Must |
| OFF-CAL-016 | Handover notes shall support shift, team or location context. | Must |
| OFF-CAL-017 | Handover notes shall support unresolved items. | Must |
| OFF-CAL-018 | The system shall support handover acknowledgement. | Must |
| OFF-CAL-019 | The system shall support recurring business events. | Must |
| OFF-CAL-020 | The system shall support reminder notifications. | Must |
| OFF-CAL-021 | The system shall protect sensitive leave details in shared calendar views. | Must |
| OFF-CAL-022 | The system shall support approved external calendar integrations. | Later |

### 14.15 Activity, notes and internal-record requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-ACT-001 | Office shall provide a role-aware business activity feed. | Must |
| OFF-ACT-002 | The activity feed shall show meaningful operational changes. | Must |
| OFF-ACT-003 | The activity feed shall support task updates. | Must |
| OFF-ACT-004 | The activity feed shall support project updates. | Must |
| OFF-ACT-005 | The activity feed shall support approval actions. | Must |
| OFF-ACT-006 | The activity feed shall support expense and procurement events. | Must |
| OFF-ACT-007 | The activity feed shall support shift and attendance events where appropriate. | Must |
| OFF-ACT-008 | The activity feed shall support relevant cross-product operational events. | Must |
| OFF-ACT-009 | The system shall distinguish system-generated from user-entered activity. | Must |
| OFF-ACT-010 | The system shall preserve actor and timestamp. | Must |
| OFF-ACT-011 | The system shall support internal notes. | Must |
| OFF-ACT-012 | Internal notes shall support permission controls. | Must |
| OFF-ACT-013 | Notes shall support customer, task or project linkage where appropriate. | Must |
| OFF-ACT-014 | Notes shall support attachments. | Must |
| OFF-ACT-015 | The system shall support pinned notes. | Must |
| OFF-ACT-016 | The system shall support handover notes. | Must |
| OFF-ACT-017 | The system shall support activity filtering. | Must |
| OFF-ACT-018 | The system shall support search. | Must |
| OFF-ACT-019 | The system shall avoid exposing sensitive staff information in broad activity feeds. | Must |
| OFF-ACT-020 | The system shall preserve auditable history for protected actions. | Must |

### 14.16 Cross-product workflow requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-XFL-001 | A Shop order may create a fulfilment task linked to the original order. | Must |
| OFF-XFL-002 | A Shop order may assign fulfilment responsibility to an authorized staff member. | Must |
| OFF-XFL-003 | A Shop delivery exception may appear as an Office exception. | Must |
| OFF-XFL-004 | A Shop refund requiring approval may use the shared Office approval framework. | Must |
| OFF-XFL-005 | A Services booking may assign a provider using the shared staff identity. | Must |
| OFF-XFL-006 | A Services booking shall respect staff leave and availability. | Must |
| OFF-XFL-007 | A Services request may create preparation, delivery or follow-up tasks. | Must |
| OFF-XFL-008 | A Services engagement may create a project where appropriate. | Must |
| OFF-XFL-009 | A POS cashier shall use the same staff identity as Office. | Must |
| OFF-XFL-010 | A POS shift shall be visible in Office when entitled. | Must |
| OFF-XFL-011 | POS reconciliation exceptions shall be visible to authorized Office users. | Must |
| OFF-XFL-012 | A high-risk POS refund may require an Office approval. | Must |
| OFF-XFL-013 | A sensitive inventory adjustment may require an Office approval. | Must |
| OFF-XFL-014 | An accepted quotation may create a project linked to the customer and source document. | Must |
| OFF-XFL-015 | A project may link to invoices and payments in Ascend Documents. | Must |
| OFF-XFL-016 | An approved purchase request may create a purchase order through Ascend Documents. | Must |
| OFF-XFL-017 | An approved Office expense shall feed the shared Financial Foundation. | Must |
| OFF-XFL-018 | A project may link to Shop, Services, POS or Documents transactions. | Must |
| OFF-XFL-019 | Cross-product records shall preserve source identifiers. | Must |
| OFF-XFL-020 | Automatic work creation shall be idempotent. | Must |
| OFF-XFL-021 | Cross-product workflows shall preserve permission boundaries. | Must |
| OFF-XFL-022 | Cross-product workflows shall emit shared business events. | Must |
| OFF-XFL-023 | The system shall not create duplicate staff from cross-product integration. | Must |
| OFF-XFL-024 | The system shall show the originating product set on connected work records. | Must |
| OFF-XFL-025 | Authorized users shall be able to override automatic assignment where appropriate. | Must |
| OFF-XFL-026 | The system shall surface failed cross-product workflow events for recovery. | Must |
| OFF-XFL-027 | Retry shall not create duplicate work. | Must |
| OFF-XFL-028 | The system shall preserve cross-product audit history. | Must |
| OFF-XFL-029 | Shared domain APIs shall allow future product sets to create Office work without a separate task engine. | Later |

### 14.17 Owner and manager Business Mobile requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-MOB-001 | Business Mobile shall provide an Office home view. | Must |
| OFF-MOB-002 | The mobile home shall show priority actions. | Must |
| OFF-MOB-003 | The mobile home shall show pending approvals. | Must |
| OFF-MOB-004 | The mobile home shall show staff presence. | Must |
| OFF-MOB-005 | The mobile home shall show overdue work. | Must |
| OFF-MOB-006 | The mobile home shall show today’s schedule. | Must |
| OFF-MOB-007 | The mobile home shall show critical business exceptions. | Must |
| OFF-MOB-008 | Owners shall be able to switch between authorized locations. | Must |
| OFF-MOB-009 | Managers shall see only permitted locations. | Must |
| OFF-MOB-010 | Users shall be able to approve, reject or request changes. | Must |
| OFF-MOB-011 | Users shall be able to assign and reassign tasks. | Must |
| OFF-MOB-012 | Users shall be able to update project status. | Must |
| OFF-MOB-013 | Users shall be able to capture expenses. | Must |
| OFF-MOB-014 | Users shall be able to review attendance exceptions. | Must |
| OFF-MOB-015 | Users shall be able to review leave requests. | Must |
| OFF-MOB-016 | Users shall be able to create quick notes. | Must |
| OFF-MOB-017 | Users shall be able to capture photo attachments. | Must |
| OFF-MOB-018 | Users shall receive relevant push notifications. | Must |
| OFF-MOB-019 | The mobile experience shall avoid dense analytics. | Must |
| OFF-MOB-020 | The mobile experience shall support selected offline actions. | Must |
| OFF-MOB-021 | The mobile experience shall show sync state. | Must |
| OFF-MOB-022 | High-risk actions shall support biometric or PIN re-entry where available. | Must |
| OFF-MOB-023 | The mobile experience shall support role-aware shortcuts. | Must |
| OFF-MOB-024 | The mobile experience shall support deep links from notifications. | Must |
| OFF-MOB-025 | The mobile experience shall support low-bandwidth conditions. | Must |
| OFF-MOB-026 | The mobile experience shall hide unauthorized staff and financial data. | Must |

### 14.18 Staff mobile requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-STF-001 | Staff shall see a personal Home view. | Must |
| OFF-STF-002 | Staff shall see assigned work. | Must |
| OFF-STF-003 | Staff shall see today’s schedule. | Must |
| OFF-STF-004 | Staff shall see shift information. | Must |
| OFF-STF-005 | Staff shall see approved leave. | Must |
| OFF-STF-006 | Staff shall be able to clock in and out where enabled. | Must |
| OFF-STF-007 | Staff shall be able to update task status. | Must |
| OFF-STF-008 | Staff shall be able to add task comments. | Must |
| OFF-STF-009 | Staff shall be able to attach completion evidence. | Must |
| OFF-STF-010 | Staff shall be able to submit leave requests. | Must |
| OFF-STF-011 | Staff shall be able to submit expenses where permitted. | Must |
| OFF-STF-012 | Staff shall be able to acknowledge handover notes. | Must |
| OFF-STF-013 | Staff shall be able to view project context where permitted. | Must |
| OFF-STF-014 | Staff shall receive relevant notifications. | Must |
| OFF-STF-015 | Staff shall not see owner-only financial information. | Must |
| OFF-STF-016 | Staff shall not see private records of other staff unless authorized. | Must |
| OFF-STF-017 | Staff shall not see unrelated locations. | Must |
| OFF-STF-018 | Staff shall be able to report blockers. | Must |
| OFF-STF-019 | Staff shall be able to request assistance from the responsible manager. | Must |
| OFF-STF-020 | Staff core actions shall work on common low-cost Android devices. | Must |
| OFF-STF-021 | Staff core actions shall tolerate weak connectivity. | Must |
| OFF-STF-022 | Staff shall see when an action is pending synchronization. | Must |
| OFF-STF-023 | Staff may view approved personal performance summaries without exposing inappropriate comparative data. | Later |

### 14.19 POS Terminal integration requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-POS-001 | POS Terminal Mode shall use the shared staff identity. | Must |
| OFF-POS-002 | Cashiers shall authenticate according to terminal policy. | Must |
| OFF-POS-003 | The terminal shall support shift opening. | Must |
| OFF-POS-004 | The terminal shall support shift closing. | Must |
| OFF-POS-005 | The terminal shall support basic attendance where configured. | Must |
| OFF-POS-006 | The terminal shall support limited handover notes where configured. | Must |
| OFF-POS-007 | The terminal shall show only terminal-relevant Office actions. | Must |
| OFF-POS-008 | The terminal shall not expose full staff records. | Must |
| OFF-POS-009 | The terminal shall not expose owner-only Office dashboards. | Must |
| OFF-POS-010 | The terminal shall support offline shift continuity. | Must |
| OFF-POS-011 | The terminal shall synchronize shift events to Office. | Must |
| OFF-POS-012 | The terminal shall link sales to the active cashier and shift. | Must |
| OFF-POS-013 | The terminal shall link reconciliation exceptions to Office. | Must |
| OFF-POS-014 | Manager override shall require authorization and audit history. | Must |
| OFF-POS-015 | The terminal shall support safe shared-device use. | Must |
| OFF-POS-016 | The terminal shall use registered business and location context. | Must |
| OFF-POS-017 | The terminal shall not create separate attendance records outside the shared Office capability. | Must |
| OFF-POS-018 | The terminal shall support immediate access revocation after synchronization. | Must |

### 14.20 Documents and Briefcase integration requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-DOC-001 | Office shall use Ascend Documents for purchase orders. | Must |
| OFF-DOC-002 | Office shall link project invoices from Ascend Documents. | Must |
| OFF-DOC-003 | Office shall link receipts and supporting documents to expenses where appropriate. | Must |
| OFF-DOC-004 | Office shall support service agreements linked to projects. | Must |
| OFF-DOC-005 | Office shall support completion documents linked to work. | Must |
| OFF-DOC-006 | Office shall support permitted staff documents through My Briefcase. | Must |
| OFF-DOC-007 | The system shall preserve document identifiers. | Must |
| OFF-DOC-008 | The system shall not duplicate shared documents. | Must |
| OFF-DOC-009 | The system shall support document status visibility. | Must |
| OFF-DOC-010 | The system shall support document-related approval triggers. | Must |
| OFF-DOC-011 | The system shall support expiring-document alerts where applicable. | Must |
| OFF-DOC-012 | The system shall enforce Ascend Documents permissions. | Must |
| OFF-DOC-013 | The system shall support Business Evidence events from connected documents. | Must |
| OFF-DOC-014 | Office shall not implement a separate PDF engine. | Must |
| OFF-DOC-015 | Office shall not implement a separate signature engine. | Must |
| OFF-DOC-016 | Office shall not implement a separate document-numbering engine. | Must |

### 14.21 Notifications and messaging requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-MSG-001 | Office shall use the shared Messaging service. | Must |
| OFF-MSG-002 | The system shall notify staff of new assignments. | Must |
| OFF-MSG-003 | The system shall notify users of due and overdue work. | Must |
| OFF-MSG-004 | The system shall notify approvers of pending requests. | Must |
| OFF-MSG-005 | The system shall notify requesters of approval outcomes. | Must |
| OFF-MSG-006 | The system shall notify managers of attendance exceptions. | Must |
| OFF-MSG-007 | The system shall notify staff of material shift changes. | Must |
| OFF-MSG-008 | The system shall notify staff of leave decisions. | Must |
| OFF-MSG-009 | The system shall notify relevant users of procurement changes. | Must |
| OFF-MSG-010 | The system shall notify project owners of milestone risk. | Must |
| OFF-MSG-011 | The system shall support in-app notifications. | Must |
| OFF-MSG-012 | The system shall support push notifications. | Must |
| OFF-MSG-013 | The system shall support email where configured. | Must |
| OFF-MSG-014 | The system shall support WhatsApp or SMS for approved variable-cost messages. | Must |
| OFF-MSG-015 | The system shall distinguish transactional from marketing communication. | Must |
| OFF-MSG-016 | The system shall support notification preferences. | Must |
| OFF-MSG-017 | The system shall support quiet hours. | Must |
| OFF-MSG-018 | The system shall prevent duplicate notifications. | Must |
| OFF-MSG-019 | The system shall preserve delivery state where available. | Must |
| OFF-MSG-020 | Variable-cost messages may consume Ascend Balance. | Must |
| OFF-MSG-021 | Sensitive people information shall not appear in broad notification previews. | Must |
| OFF-MSG-022 | The system shall support escalation notifications. | Must |
| OFF-MSG-023 | The system shall support deep links into the relevant action. | Must |
| OFF-MSG-024 | The system shall support configurable digest notifications. | Later |

### 14.22 Search, reporting and Business Pulse requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-REP-001 | Office shall support global search across authorized people and work records. | Must |
| OFF-REP-002 | The system shall support task search. | Must |
| OFF-REP-003 | The system shall support project search. | Must |
| OFF-REP-004 | The system shall support staff search. | Must |
| OFF-REP-005 | The system shall support expense search. | Must |
| OFF-REP-006 | The system shall support procurement search. | Must |
| OFF-REP-007 | The system shall support approval search. | Must |
| OFF-REP-008 | The system shall support filters by location. | Must |
| OFF-REP-009 | The system shall support filters by status. | Must |
| OFF-REP-010 | The system shall support filters by date. | Must |
| OFF-REP-011 | The system shall support filters by assignee. | Must |
| OFF-REP-012 | The system shall support filters by project. | Must |
| OFF-REP-013 | The system shall provide work-completion reports. | Must |
| OFF-REP-014 | The system shall provide overdue-work reports. | Must |
| OFF-REP-015 | The system shall provide attendance reports. | Must |
| OFF-REP-016 | The system shall provide shift reports. | Must |
| OFF-REP-017 | The system shall provide leave reports. | Must |
| OFF-REP-018 | The system shall provide approval-turnaround reports. | Must |
| OFF-REP-019 | The system shall provide expense reports. | Must |
| OFF-REP-020 | The system shall provide procurement reports. | Must |
| OFF-REP-021 | The system shall provide project reports. | Must |
| OFF-REP-022 | The system shall provide location comparisons. | Must |
| OFF-REP-023 | The system shall provide staff-workload summaries subject to permission. | Must |
| OFF-REP-024 | Business Pulse shall focus on operational health rather than vanity totals. | Must |
| OFF-REP-025 | Business Pulse shall distinguish warning from critical conditions. | Must |
| OFF-REP-026 | Business Pulse shall link to underlying evidence. | Must |
| OFF-REP-027 | Reports shall state data freshness and scope. | Must |
| OFF-REP-028 | Reports shall respect permissions. | Must |
| OFF-REP-029 | Reports shall support approved exports. | Must |
| OFF-REP-030 | The system shall support owner-level cross-product operational summaries. | Must |
| OFF-REP-031 | The system shall not present unsupported predictive claims. | Must |
| OFF-REP-032 | The system shall support scheduled operational reports. | Later |

### 14.23 Offline, synchronization and recovery requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-OFF-001 | Business Mobile shall support offline access to recently synchronized assigned work. | Must |
| OFF-OFF-002 | Business Mobile shall support offline task updates. | Must |
| OFF-OFF-003 | Business Mobile shall support offline attendance capture. | Must |
| OFF-OFF-004 | Business Mobile shall support offline expense drafts. | Must |
| OFF-OFF-005 | POS Terminal Mode shall support offline shift continuity. | Must |
| OFF-OFF-006 | The system shall show offline state. | Must |
| OFF-OFF-007 | The system shall queue offline actions. | Must |
| OFF-OFF-008 | The system shall use idempotency keys for retry-safe operations. | Must |
| OFF-OFF-009 | The system shall prevent duplicate tasks, expenses or approval requests after retry. | Must |
| OFF-OFF-010 | The system shall preserve original action time. | Must |
| OFF-OFF-011 | The system shall record synchronization time. | Must |
| OFF-OFF-012 | The system shall encrypt protected local data. | Must |
| OFF-OFF-013 | The system shall support retry and recovery. | Must |
| OFF-OFF-014 | The system shall show failed synchronization. | Must |
| OFF-OFF-015 | The system shall support conflict handling. | Must |
| OFF-OFF-016 | The system shall not silently overwrite approval decisions. | Must |
| OFF-OFF-017 | The system shall support device revocation. | Must |
| OFF-OFF-018 | The system shall remove protected local data after authorized logout or revocation. | Must |
| OFF-OFF-019 | The system shall monitor synchronization failures. | Must |
| OFF-OFF-020 | The system shall support eventual synchronization across web, mobile and terminals. | Must |
| OFF-OFF-021 | The system shall show pending-sync indicators. | Must |
| OFF-OFF-022 | High-risk actions that require online verification shall not be falsely completed offline. | Must |

### 14.24 Business Evidence Ledger and Sustainability Score requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-EVD-001 | Office shall emit standard operational events to the Business Event Engine. | Must |
| OFF-EVD-002 | Eligible events shall include staff added, role assigned, shift opened, shift closed, task completed, approval completed, expense approved, purchase received and project completed. | Must |
| OFF-EVD-003 | Attendance alone shall not automatically improve the Sustainability Score. | Must |
| OFF-EVD-004 | Task volume alone shall not automatically improve the Sustainability Score. | Must |
| OFF-EVD-005 | Operational evidence shall emphasize consistency and outcomes. | Must |
| OFF-EVD-006 | The system shall distinguish merchant-entered from system-recorded events. | Must |
| OFF-EVD-007 | The system shall distinguish customer-confirmed completion where available. | Must |
| OFF-EVD-008 | The system shall distinguish payment-verified expense or procurement outcomes where available. | Must |
| OFF-EVD-009 | Evidence events shall preserve business, location, actor, role and channel context. | Must |
| OFF-EVD-010 | Evidence events shall preserve correction and reversal relationships. | Must |
| OFF-EVD-011 | The system shall avoid double-counting one outcome across related tasks, documents and transactions. | Must |
| OFF-EVD-012 | Governance evidence may include approval use and role separation. | Must |
| OFF-EVD-013 | Operational evidence may include fulfilment reliability. | Must |
| OFF-EVD-014 | Operational evidence may include shift reconciliation consistency. | Must |
| OFF-EVD-015 | Operational evidence may include project milestone completion. | Must |
| OFF-EVD-016 | Operational evidence may include procurement discipline. | Must |
| OFF-EVD-017 | The system shall support business-archetype-specific relevance and weighting. | Must |
| OFF-EVD-018 | The system shall not penalize businesses for Office capabilities irrelevant to their archetype. | Must |
| OFF-EVD-019 | Missing Office evidence shall reduce Evidence Confidence rather than automatically imply poor performance. | Must |
| OFF-EVD-020 | The system shall support evidence correction and appeal. | Must |
| OFF-EVD-021 | The Business Evidence Ledger shall preserve append-only history. | Must |
| OFF-EVD-022 | Office package purchase shall not directly improve the Sustainability Score. | Must |
| OFF-EVD-023 | Institution-sponsored Office access shall not directly improve the Sustainability Score. | Must |
| OFF-EVD-024 | Private staff information shall not be exposed through public readiness outputs. | Must |
| OFF-EVD-025 | Business owners shall control institutional sharing through consent. | Must |

### 14.25 Monetization and commercial requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-MON-001 | Office shall not rely primarily on compulsory monthly SaaS pricing. | Must |
| OFF-MON-002 | Basic workforce capabilities required by an anchor product shall remain included with that product. | Must |
| OFF-MON-003 | POS shall include basic cashier roles, basic shifts and shift-linked attendance essentials. | Must |
| OFF-MON-004 | Services shall include provider profiles and basic availability essentials. | Must |
| OFF-MON-005 | Shop shall include basic fulfilment assignment essentials. | Must |
| OFF-MON-006 | Full Office shall add general attendance, leave, projects, tasks, approvals, expenses, procurement and multi-location control. | Must |
| OFF-MON-007 | Office shall support Team Operations Pass pricing. | Must |
| OFF-MON-008 | Team Operations Pass pricing shall be based primarily on staff band, location scope and operating complexity. | Must |
| OFF-MON-009 | Office shall support 90-day passes where commercially approved. | Must |
| OFF-MON-010 | Office shall support six-month passes where commercially approved. | Must |
| OFF-MON-011 | Office shall support annual passes. | Must |
| OFF-MON-012 | Office shall support setup and implementation fees. | Must |
| OFF-MON-013 | Office shall support paid migration and configuration. | Must |
| OFF-MON-014 | Office shall support sponsored entitlements. | Must |
| OFF-MON-015 | Office shall support institutional packages. | Must |
| OFF-MON-016 | Office shall support Assurance. | Must |
| OFF-MON-017 | Variable-cost messaging may use Ascend Balance. | Must |
| OFF-MON-018 | Paid automation may use entitlements or Ascend Balance. | Must |
| OFF-MON-019 | The system shall show the local-currency price before purchase. | Must |
| OFF-MON-020 | Historical merchant-owned records shall remain accessible after entitlement expiry. | Must |
| OFF-MON-021 | The system shall not delete staff, work or approval history because a pass expires. | Must |
| OFF-MON-022 | The system shall support a limited mode after expiry. | Must |
| OFF-MON-023 | The system shall not charge twice for a shared capability included elsewhere in a bundle. | Must |
| OFF-MON-024 | The system shall support country-localized pricing. | Must |
| OFF-MON-025 | Commercial actions and entitlement changes shall be auditable. | Must |

### 14.26 Bundle and entitlement requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-ENT-001 | Office shall be available as a standalone growth product. | Must |
| OFF-ENT-002 | Office shall be available in Retail Operations bundles. | Must |
| OFF-ENT-003 | Office shall be available in Service Team bundles. | Must |
| OFF-ENT-004 | Office shall be available in Complete Business OS bundles. | Must |
| OFF-ENT-005 | Office Essentials shall be embedded in selected anchor products. | Must |
| OFF-ENT-006 | The entitlement engine shall distinguish embedded essentials from Full Office. | Must |
| OFF-ENT-007 | The entitlement engine shall support staff bands. | Must |
| OFF-ENT-008 | The entitlement engine shall support location bands. | Must |
| OFF-ENT-009 | The entitlement engine shall support project capability tiers. | Must |
| OFF-ENT-010 | The entitlement engine shall support procurement capability tiers. | Must |
| OFF-ENT-011 | The entitlement engine shall support advanced approval entitlements. | Must |
| OFF-ENT-012 | The entitlement engine shall support accountant-access entitlements. | Must |
| OFF-ENT-013 | The entitlement engine shall support automation entitlements. | Must |
| OFF-ENT-014 | The entitlement engine shall support sponsored access. | Must |
| OFF-ENT-015 | The entitlement engine shall support grace periods. | Must |
| OFF-ENT-016 | The entitlement engine shall support Assurance status. | Must |
| OFF-ENT-017 | The system shall preserve read and export access after entitlement expiry. | Must |
| OFF-ENT-018 | The system shall show why a capability is unavailable. | Must |
| OFF-ENT-019 | The system shall show appropriate upgrade paths. | Must |
| OFF-ENT-020 | The system shall prevent duplicate billing across bundles. | Must |
| OFF-ENT-021 | Entitlement changes shall be auditable. | Must |

### 14.27 Institutional and sponsored deployment requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-INS-001 | Office shall support institution-sponsored SME cohorts. | Must |
| OFF-INS-002 | Institutions may fund capabilities without owning merchant data. | Must |
| OFF-INS-003 | Businesses shall consent to programme participation. | Must |
| OFF-INS-004 | The system shall support programme-specific entitlements. | Must |
| OFF-INS-005 | The system shall support programme dates and eligibility. | Must |
| OFF-INS-006 | The system shall support cohort-level reporting. | Must |
| OFF-INS-007 | Institutions shall not see unrelated merchant data. | Must |
| OFF-INS-008 | Institutions shall not see private staff records without explicit lawful purpose and consent. | Must |
| OFF-INS-009 | The system shall support programme onboarding checklists. | Must |
| OFF-INS-010 | The system shall support programme configuration templates. | Must |
| OFF-INS-011 | The system shall support sponsored setup and training. | Must |
| OFF-INS-012 | The system shall support sponsored Team Operations Passes. | Must |
| OFF-INS-013 | The system shall support approved programme activity reporting. | Must |
| OFF-INS-014 | The system shall support transition from sponsored to merchant-funded access. | Must |
| OFF-INS-015 | Merchant records shall remain with the merchant after programme end. | Must |
| OFF-INS-016 | The system shall audit institutional access. | Must |
| OFF-INS-017 | The system shall support revocation of institutional access. | Must |
| OFF-INS-018 | The system shall support data-minimized exports. | Must |
| OFF-INS-019 | Institution-sponsored access shall not improve private readiness scores directly. | Must |
| OFF-INS-020 | The system shall support country-specific programme policies. | Must |

### 14.28 API and integration requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-API-001 | Office shall expose approved internal APIs through platform boundaries. | Must |
| OFF-API-002 | APIs shall use shared identifiers. | Must |
| OFF-API-003 | APIs shall enforce tenancy. | Must |
| OFF-API-004 | APIs shall enforce role and location permissions. | Must |
| OFF-API-005 | APIs shall support task creation from Shop. | Must |
| OFF-API-006 | APIs shall support assignment creation from Services. | Must |
| OFF-API-007 | APIs shall support shift events from POS. | Must |
| OFF-API-008 | APIs shall support purchase-order creation through Documents. | Must |
| OFF-API-009 | APIs shall support approved expense events to the Financial Foundation. | Must |
| OFF-API-010 | APIs shall emit events to the Business Event Engine. | Must |
| OFF-API-011 | APIs shall support webhooks for approved work and approval events. | Must |
| OFF-API-012 | Creation APIs shall be idempotent. | Must |
| OFF-API-013 | APIs shall version breaking changes. | Must |
| OFF-API-014 | APIs shall apply rate limits. | Must |
| OFF-API-015 | APIs shall log access and failures. | Must |
| OFF-API-016 | APIs shall not expose private staff information publicly. | Must |
| OFF-API-017 | The system shall support approved calendar integrations in a later release. | Must |
| OFF-API-018 | The system shall support approved payroll-provider integrations in a later release. | Must |
| OFF-API-019 | The system shall support partner integrations subject to consent and contract. | Must |
| OFF-API-020 | The system shall support approved import and export interfaces. | Must |

### 14.29 Security, privacy and audit requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-SEC-001 | The system shall enforce business tenancy isolation. | Must |
| OFF-SEC-002 | The system shall enforce role-based access. | Must |
| OFF-SEC-003 | The system shall enforce location scope. | Must |
| OFF-SEC-004 | The system shall encrypt protected data in transit. | Must |
| OFF-SEC-005 | The system shall encrypt protected data at rest. | Must |
| OFF-SEC-006 | The system shall protect staff personal information. | Must |
| OFF-SEC-007 | The system shall restrict access to HR-sensitive fields. | Must |
| OFF-SEC-008 | The system shall support stronger authentication for high-risk actions. | Must |
| OFF-SEC-009 | The system shall support device revocation. | Must |
| OFF-SEC-010 | The system shall support account suspension. | Must |
| OFF-SEC-011 | The system shall log protected access actions. | Must |
| OFF-SEC-012 | The system shall audit staff-role changes. | Must |
| OFF-SEC-013 | The system shall audit approval changes. | Must |
| OFF-SEC-014 | The system shall audit expense changes. | Must |
| OFF-SEC-015 | The system shall audit procurement changes. | Must |
| OFF-SEC-016 | The system shall audit attendance corrections. | Must |
| OFF-SEC-017 | The system shall audit administrative access. | Must |
| OFF-SEC-018 | The system shall support retention policies. | Must |
| OFF-SEC-019 | The system shall support data-access and correction requests. | Must |
| OFF-SEC-020 | The system shall support deletion or anonymization where legally appropriate. | Must |
| OFF-SEC-021 | The system shall preserve required transaction and audit history. | Must |
| OFF-SEC-022 | The system shall avoid unnecessary continuous employee tracking. | Must |
| OFF-SEC-023 | The system shall support incident response. | Must |
| OFF-SEC-024 | The system shall support suspicious-action detection where appropriate. | Must |
| OFF-SEC-025 | The system shall support periodic permission review. | Must |
| OFF-SEC-026 | High-risk administrative changes shall support maker-checker control. | Must |
| OFF-SEC-027 | The system shall not expose employee data to institutions by default. | Must |
| OFF-SEC-028 | The system shall not use private employee data for public scoring. | Must |
| OFF-SEC-029 | The system shall preserve security-event history. | Must |

### 14.30 Non-functional requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-NFR-001 | Business Web shall support common modern desktop browsers. | Must |
| OFF-NFR-002 | Business Mobile shall support common low-cost Android devices. | Must |
| OFF-NFR-003 | Core mobile actions shall remain usable on weak networks. | Must |
| OFF-NFR-004 | The system shall provide responsive layouts. | Must |
| OFF-NFR-005 | The system shall support keyboard navigation on web. | Must |
| OFF-NFR-006 | The system shall support screen readers for core flows. | Must |
| OFF-NFR-007 | The system shall meet approved colour-contrast requirements. | Must |
| OFF-NFR-008 | The system shall support local date, time and number formats. | Must |
| OFF-NFR-009 | The system shall support future localization. | Must |
| OFF-NFR-010 | The system shall maintain consistent identifiers across channels. | Must |
| OFF-NFR-011 | The system shall support scalable growth in staff and work records. | Must |
| OFF-NFR-012 | The system shall support multi-location businesses without separate codebases. | Must |
| OFF-NFR-013 | The system shall support disaster recovery. | Must |
| OFF-NFR-014 | The system shall provide observability for critical Office workflows. | Must |
| OFF-NFR-015 | The system shall support graceful degradation when secondary services fail. | Must |
| OFF-NFR-016 | The system shall preserve work records during messaging outages. | Must |
| OFF-NFR-017 | The system shall preserve operational records during reporting outages. | Must |
| OFF-NFR-018 | The system shall support controlled feature rollout. | Must |
| OFF-NFR-019 | The system shall provide clear error messages without exposing internal implementation details. | Must |
| OFF-NFR-020 | The system shall show data freshness where stale data may mislead. | Must |
| OFF-NFR-021 | The system shall support efficient mobile battery use. | Must |
| OFF-NFR-022 | The system shall support secure background synchronization. | Must |
| OFF-NFR-023 | The system shall support country-level configuration. | Must |

### 14.31 Administration, support and merchant-success requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-ADM-001 | Authorized operators shall manage Office feature flags. | Must |
| OFF-ADM-002 | Authorized operators shall manage country settings. | Must |
| OFF-ADM-003 | Authorized operators shall manage entitlements. | Must |
| OFF-ADM-004 | Authorized operators shall manage sponsored programmes. | Must |
| OFF-ADM-005 | Authorized operators shall manage standard role templates. | Must |
| OFF-ADM-006 | Authorized operators shall manage task templates. | Must |
| OFF-ADM-007 | Authorized operators shall manage project templates. | Must |
| OFF-ADM-008 | Authorized operators shall manage approval templates. | Must |
| OFF-ADM-009 | Authorized operators shall manage leave templates. | Must |
| OFF-ADM-010 | The system shall support merchant support notes. | Must |
| OFF-ADM-011 | The system shall support assisted staff import. | Must |
| OFF-ADM-012 | The system shall support assisted role setup. | Must |
| OFF-ADM-013 | The system shall support assisted location setup. | Must |
| OFF-ADM-014 | The system shall support assisted project migration. | Must |
| OFF-ADM-015 | The system shall support operational diagnostics. | Must |
| OFF-ADM-016 | Support staff shall not alter protected audit history. | Must |
| OFF-ADM-017 | High-risk administrative actions shall require approval. | Must |
| OFF-ADM-018 | The system shall audit administrative changes. | Must |
| OFF-ADM-019 | The system shall support merchant-health views for authorized support users. | Must |
| OFF-ADM-020 | The system shall support onboarding checklists. | Must |
| OFF-ADM-021 | The system shall support demo or training data. | Must |
| OFF-ADM-022 | The system shall support issue escalation. | Must |
| OFF-ADM-023 | The system shall support country and cohort operational reporting. | Must |

### 14.32 Migration and adoption requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-MIG-001 | Existing AscendSME staff records shall be evaluated for migration. | Must |
| OFF-MIG-002 | Migration shall preserve shared identities where available. | Must |
| OFF-MIG-003 | Migration shall avoid duplicate staff records. | Must |
| OFF-MIG-004 | Migration shall preserve roles where they map safely. | Must |
| OFF-MIG-005 | Migration shall preserve locations. | Must |
| OFF-MIG-006 | Migration shall preserve active projects where feasible. | Must |
| OFF-MIG-007 | Migration shall preserve tasks where feasible. | Must |
| OFF-MIG-008 | Migration shall preserve approved attendance history where available. | Must |
| OFF-MIG-009 | Migration shall preserve available audit history. | Must |
| OFF-MIG-010 | Migration shall preserve attachments where supported. | Must |
| OFF-MIG-011 | Migration shall identify conflicting staff identities. | Must |
| OFF-MIG-012 | Migration shall identify conflicting locations. | Must |
| OFF-MIG-013 | Migration shall identify unsupported legacy roles. | Must |
| OFF-MIG-014 | Migration shall create an audit record. | Must |
| OFF-MIG-015 | Migration shall support batch validation. | Must |
| OFF-MIG-016 | Migration shall support rollback of failed batches. | Must |
| OFF-MIG-017 | Migration shall report unresolved conflicts. | Must |
| OFF-MIG-018 | The system shall support CSV import for staff. | Must |
| OFF-MIG-019 | The system shall support approved task and project imports. | Must |
| OFF-MIG-020 | The system shall support export of merchant-owned records. | Must |
| OFF-MIG-021 | The system shall support guided first-time setup. | Must |
| OFF-MIG-022 | The system shall support progressive activation rather than require complete configuration. | Must |
| OFF-MIG-023 | A business shall be able to start with staff and tasks only. | Must |
| OFF-MIG-024 | The system shall recommend additional Office setup as complexity grows. | Must |
| OFF-MIG-025 | The system shall support Account Manager-assisted onboarding. | Must |

### 14.33 Product analytics and success-metric requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-ANL-001 | The platform shall measure businesses activating Office. | Must |
| OFF-ANL-002 | The platform shall measure time to first staff setup. | Must |
| OFF-ANL-003 | The platform shall measure time to first assigned task. | Must |
| OFF-ANL-004 | The platform shall measure weekly active Office businesses. | Must |
| OFF-ANL-005 | The platform shall measure weekly active Office staff. | Must |
| OFF-ANL-006 | The platform shall measure task completion rate. | Must |
| OFF-ANL-007 | The platform shall measure overdue task rate. | Must |
| OFF-ANL-008 | The platform shall measure project milestone completion. | Must |
| OFF-ANL-009 | The platform shall measure approval turnaround time. | Must |
| OFF-ANL-010 | The platform shall measure attendance exception rate. | Must |
| OFF-ANL-011 | The platform shall measure shift completion. | Must |
| OFF-ANL-012 | The platform shall measure expense approval time. | Must |
| OFF-ANL-013 | The platform shall measure procurement cycle time. | Must |
| OFF-ANL-014 | The platform shall measure mobile versus web usage. | Must |
| OFF-ANL-015 | The platform shall measure owner mobile engagement. | Must |
| OFF-ANL-016 | The platform shall measure cross-product workflow creation. | Must |
| OFF-ANL-017 | The platform shall measure Office-generated evidence events. | Must |
| OFF-ANL-018 | The platform shall measure Team Operations Pass conversion. | Must |
| OFF-ANL-019 | The platform shall measure renewal and Assurance adoption. | Must |
| OFF-ANL-020 | The platform shall measure sponsored-to-paid conversion. | Must |
| OFF-ANL-021 | The platform shall measure support volume and recurring support causes. | Must |
| OFF-ANL-022 | The platform shall measure onboarding completion. | Must |
| OFF-ANL-023 | The platform shall measure multi-location adoption. | Must |
| OFF-ANL-024 | The platform shall measure active approval-rule usage. | Must |
| OFF-ANL-025 | Analytics outputs shall protect staff personal information. | Must |

### 14.34 Quality assurance requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-QA-001 | Testing shall verify role-aware dashboard differences. | Must |
| OFF-QA-002 | Testing shall verify location isolation. | Must |
| OFF-QA-003 | Testing shall verify shared staff identity reuse across product sets. | Must |
| OFF-QA-004 | Testing shall verify task creation from Shop. | Must |
| OFF-QA-005 | Testing shall verify Services staff assignment. | Must |
| OFF-QA-006 | Testing shall verify POS shift visibility. | Must |
| OFF-QA-007 | Testing shall verify Documents purchase-order integration. | Must |
| OFF-QA-008 | Testing shall verify expense approval. | Must |
| OFF-QA-009 | Testing shall verify procurement approval. | Must |
| OFF-QA-010 | Testing shall verify maker-checker controls. | Must |
| OFF-QA-011 | Testing shall verify leave and shift conflicts. | Must |
| OFF-QA-012 | Testing shall verify attendance correction history. | Must |
| OFF-QA-013 | Testing shall verify mobile offline task updates. | Must |
| OFF-QA-014 | Testing shall verify mobile offline attendance. | Must |
| OFF-QA-015 | Testing shall verify retry idempotency. | Must |
| OFF-QA-016 | Testing shall verify tenant isolation. | Must |
| OFF-QA-017 | Testing shall verify staff privacy. | Must |
| OFF-QA-018 | Testing shall verify historical access after entitlement expiry. | Must |
| OFF-QA-019 | Testing shall verify Business Evidence events and reversals. | Must |
| OFF-QA-020 | Testing shall verify sponsored programme restrictions. | Must |
| OFF-QA-021 | Testing shall verify owner, manager and staff access boundaries. | Must |
| OFF-QA-022 | Testing shall verify approval escalation. | Must |
| OFF-QA-023 | Testing shall verify task reassignment history. | Must |
| OFF-QA-024 | Testing shall verify merchant export. | Must |
| OFF-QA-025 | Testing shall verify Business Pulse links to underlying records. | Must |

# 15. People and Staff Management

Office should make staff setup useful before the business completes a detailed HR profile. The minimum viable staff record should be enough to assign work and enforce access. Additional employment information can be added progressively.

A recommended activation sequence is:

1. Add or invite the person.
2. Assign role.
3. Assign location.
4. Give required product access.
5. Optionally assign manager, team, shift and leave policy.
6. Begin work.

The system must not require payroll data before the person can participate in work.

# 16. Roles, Permissions and Delegated Authority

The permission model should support the reality that one person may be a cashier in one location, a manager in another context and a project lead for selected work. Role labels must not become the sole authorization mechanism. Access must resolve from business membership, role, location, capability, assignment and temporary delegation.

# 17. Attendance, Shifts and Presence

Attendance exists to improve coordination, not surveillance. Office should know whether the business has the people it expects, while respecting staff privacy.

POS shift activity should reuse the same staff and shift records. A cashier should not clock in once for Office and separately exist as an unrelated person in POS.

# 18. Leave, Availability and Scheduling

Availability is a shared operating concept. Approved leave should inform Services availability and staffing decisions. A manager should see that a provider is unavailable before assigning a service, not after the customer has already been promised a time.

# 19. Tasks and Work Management

Tasks are the universal unit of operational accountability. They can originate manually or from connected business activity.

Examples:

- Pack Shop order #1042
- Prepare treatment room for booking #B-812
- Reconcile Branch A POS shift
- Follow up invoice #INV-204
- Receive supplier delivery against PO-112
- Complete milestone 2 for customer project

The task should always retain the source transaction rather than copying it.

# 20. Projects, Milestones and Recurring Work

Projects support work that spans multiple steps, people or dates. Office should remain deliberately lighter than enterprise project-management products.

A project should answer:

- What are we trying to complete?
- Who owns it?
- What are the milestones?
- What is due next?
- What is at risk?
- Which customer, quotation, agreement, invoice or payment is connected?

# 21. Approvals and Internal Controls

The approval system is a core governance capability. It should be reusable across expenses, procurement, leave, access changes, refunds, inventory adjustments and selected document actions.

The design must balance control with speed. Small businesses should be able to begin with simple single-level approval and add maker-checker or multi-level controls as they grow.

# 22. Expenses and Internal Spending

Expense capture should be fast on mobile. The user should be able to photograph a receipt, enter amount and category, select the business or project context and submit.

The system must distinguish between:

- an expense claim
- approval
- evidence attachment
- payment
- financial posting

These are related but not identical events.

# 23. Procurement and Supplier Operations

The connected procurement flow is:

> **Purchase request -> approval -> supplier selection -> purchase order -> goods or service receipt -> supplier invoice -> payment -> financial record -> evidence**

This flow should use shared supplier, inventory, Documents, Payments and Financial Foundation capabilities rather than reproduce them inside Office.

# 24. Locations and Multi-Location Operations

Office becomes particularly valuable when an owner cannot physically supervise every location. Multi-location control should therefore focus on exceptions, delegated managers, staff presence, overdue work, approvals and operational consistency rather than a wall of comparative charts.

# 25. Calendar, Coordination and Handover

The calendar should combine operational commitments from Office and connected product sets. Handovers should make unresolved work visible when responsibility changes between shifts, people or locations.

# 26. Cross-Product Workflows

## POS + Office

- Shared cashier identity
- Shifts and attendance
- Reconciliation exceptions
- Refund approval
- Inventory-adjustment approval
- Owner mobile oversight

## Shop + Office

- Fulfilment assignment
- Packing and delivery tasks
- Delayed order escalation
- Refund approval
- Location responsibility

## Services + Office

- Provider availability
- Booking assignment
- Leave conflict
- Preparation and delivery tasks
- Field-service completion
- Project conversion

## Documents + Office

- Accepted quote to project
- Project invoices
- Purchase request to purchase order
- Expense supporting documents
- Agreements and completion records

# 27. Business Mobile and Staff Experience

Business Mobile should not reproduce the complete Office web application. It should make daily action faster.

Owner and manager mobile priorities:

- Approvals
- People active today
- Overdue work
- Location issues
- Critical projects
- Expense and procurement exceptions
- Shop, Services and POS operating exceptions

Staff mobile priorities:

- What do I need to do?
- When do I need to do it?
- Where do I need to be?
- What is blocking me?
- What requests have I submitted?

# 28. Reporting and Business Pulse

Business Pulse is a current-state operating summary, not a second sustainability score.

Potential indicators include:

- Work due today
- Overdue work
- Staffing gaps
- Open or incomplete shifts
- Approval backlog
- Fulfilment delays
- Service completion delays
- Expense exceptions
- Procurement delays
- Unresolved handovers

# 29. Offline, Sync and Recovery

Offline support is required for field staff, mobile teams and businesses operating under weak connectivity. The system should prefer safe queued action over false completion. High-risk actions that require online authorization must show that they remain pending.

# 30. Evidence and Sustainability Score Integration

Office contributes primarily to the following Sustainability Score dimensions:

- Operational structure and consistency
- Governance and control
- Financial integrity where expenses and procurement are connected
- Documentation and compliance where records are preserved

Evidence strength should increase when Office actions connect to outcomes.

Examples:

| Office activity | Relative evidence strength |
|---|---|
| Task created | Low |
| Task completed by assigned staff | Moderate |
| Task linked to fulfilled order | Stronger |
| Shift completed | Moderate |
| Shift reconciled against POS | Stronger |
| Expense submitted | Low |
| Expense approved and payment-linked | Stronger |
| Purchase order issued | Moderate |
| Goods received and inventory updated | Stronger |
| Project completed | Moderate |
| Project completed and customer-confirmed | Stronger |

Office usage itself must never be treated as proof that a business is sustainable.

# 31. Monetization and Commercial Packaging

Office should monetize increasing operating complexity rather than simple logins.

## Embedded essentials

Anchor products include the staff functions necessary for their core job:

- POS includes cashier accounts, basic shifts and shift-linked attendance
- Services includes provider profiles and basic availability
- Shop includes fulfilment assignment
- Documents includes necessary document-approval essentials

## Full Office

Full Office adds:

- general attendance
- leave
- tasks
- projects
- recurring work
- broader approvals
- expenses
- procurement
- multi-location team management
- operational reports
- advanced governance

## Team Operations Pass

Illustrative Ghana pilot hypotheses:

| Team size | Illustrative annual price |
|---|---:|
| Up to 5 staff | GHS 600 |
| 6 to 15 staff | GHS 1,200 |
| 16 to 30 staff | GHS 2,400 |
| 30+ | Custom |

Alternative 90-day and 6-month periods may be offered after commercial validation.

## Setup and implementation

Illustrative setup range:

**GHS 500 to GHS 1,500**

depending on staff count, locations, migration, approval complexity, procurement setup and training.

These values are commercial hypotheses, not final market prices.

# 32. Bundles and Entitlements

Recommended bundle participation:

- **Retail Operations** - POS + Office + Documents + advanced inventory
- **Omnichannel Retail** - POS + Shop + Office + Documents + Discover eligibility
- **Service Team** - Services + Office + Documents
- **Complete Business OS** - POS + Shop + Services + Office + Documents + Discover + Readiness

Bundles are commercial packaging only. They do not create separate data models.

# 33. Institutional Deployment

Office can support development programmes, business associations, corporate supplier programmes and financial institutions that want SMEs to become more structured operationally.

Institutional access must remain consent-based and data-minimized. Programme sponsors may receive cohort-level progress, but they must not gain unrestricted access to private staff records.

# 34. APIs and Integrations

The recommended implementation remains a modular monolith with event-driven boundaries rather than premature microservices. Office should expose clean internal domain APIs and standard events while sharing identity, entitlements, audit, notifications and storage with the rest of the platform.

# 35. Security, Privacy and Audit

Office contains sensitive workforce and internal-control data. Access must be narrow, role-aware and auditable. Continuous tracking of staff should not become the default mechanism for attendance or productivity measurement.

# 36. Administration, Support and Migration

Office will require assisted implementation for many SMEs. AscendSME should support:

- role templates
- staff import
- location setup
- migration
- project templates
- approval setup
- procurement setup
- training
- post-launch support

The goal is not simply to activate Office but to establish useful operational routines.

# 37. Product Analytics and Success Metrics

## Headline product metric

**Percentage of active Office businesses completing structured, assigned work through Ascend Office every week.**

A structured work event includes a task completed, project milestone completed, approval completed, procurement step completed, expense approved, shift completed or fulfilment responsibility completed.

Supporting metrics:

- Weekly active businesses
- Weekly active staff
- Owner mobile usage
- Task completion rate
- Overdue work rate
- Approval turnaround time
- Project milestone completion
- Attendance exception rate
- Procurement cycle time
- Cross-product work creation
- Team Operations Pass conversion
- Retention and renewal
- Evidence confidence improvement

# 38. Rollout Plan

## Phase 1 - Core Office

- Team
- Roles
- Tasks
- Projects
- Attendance
- Shifts
- Leave
- Approvals
- Expenses
- Business Web
- Business Mobile
- POS integration
- Shop fulfilment integration
- Services assignment integration
- Documents purchase-order integration

## Phase 2 - Operational depth

- Procurement receiving
- Recurring work
- Handovers
- Multi-location control
- Advanced approval rules
- Accountant access
- Advanced reports
- Business Pulse improvements
- Sponsored deployments

## Phase 3 - Scale and intelligence

- Workflow automation
- Workforce planning
- Performance check-ins
- Payroll integrations
- Advanced procurement
- AI recommendations
- Partner APIs
- Country localization

# 39. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Office becomes too broad | Keep focus on people, work, approvals and operations |
| Office feels like enterprise HR software | Plain language, progressive setup and action-first mobile UX |
| Staff resist adoption | Simple personal work view and obvious daily value |
| Owner becomes overwhelmed by data | Prioritize exceptions and next actions |
| Product duplicates POS or Services workforce features | One shared staff and permission model |
| Attendance feels intrusive | Proportionate controls and no continuous tracking by default |
| Approvals slow the business | Configurable thresholds, delegation and controlled emergency override |
| Businesses stop using Office after setup | Cross-product work creation and daily command centre |
| Pricing becomes another SaaS burden | Staff-band operating passes and flexible durations |
| Office activity inflates the Sustainability Score | Use outcome evidence, relevance and confidence rules |
| Procurement becomes ERP-heavy | Keep the request-to-payment flow simple and connected |
| Staff data is exposed | Strong permissions, location scope and privacy controls |
| Weak connectivity interrupts work | Offline task, attendance and draft support |
| Office becomes generic project software | Anchor work to real SME commercial activity |

# 40. Dependencies and Constraints

## Dependencies

- Identity and tenancy
- People and Access
- Locations
- Work Core
- Customers
- Catalogue
- Inventory
- Payments
- Financial Foundation
- Documents
- Messaging
- Entitlements
- Ascend Balance
- Business Event Engine
- Business Evidence Ledger
- Business Web and Mobile shells

## Constraints

- Low-cost Android devices
- Weak connectivity
- Limited formal HR administration in many SMEs
- Staff without work email addresses
- Owner-led operating structures
- Inconsistent legacy records
- Business reluctance to adopt heavy software
- Location privacy concerns
- Country-specific labour rules

# 41. Out of Scope

MVP excludes:

- Full payroll
- Statutory payroll filing
- Employee lending
- Recruitment applicant tracking
- Complex performance scoring
- Enterprise resource planning
- Manufacturing resource planning
- Generic internal chat
- Corporate social networking
- Full asset management
- Fleet management
- Advanced workforce optimization
- Public employee ratings
- Biometric surveillance
- Complex Gantt planning
- Unrestricted external collaboration

# 42. Open Decisions

- Final Office Essentials boundary
- Final staff-band pricing
- Whether 90-day passes launch immediately
- Attendance methods for launch
- Geolocation policy
- Shift-swap scope
- Leave-balance scope
- Multi-level approval timing
- Project-template library
- Procurement depth
- Accountant-access packaging
- Customer-facing project update scope
- Performance-check-in timing
- Payroll integration partners
- Business Pulse rules
- Staff Mobile onboarding model
- First institutional programme model
- Multi-location comparison depth
- Automation pricing
- Migration scope from the first AscendSME deployment

# 43. Future Enhancements

- AI-generated task summaries
- AI operational recommendations
- Workload balancing
- Staffing-gap prediction
- Shift optimization
- Goals and OKRs
- Performance check-ins
- Payroll integrations
- Benefits integrations
- Advanced procurement
- Supplier performance
- Asset management
- Training records
- Policy acknowledgements
- Workflow builder
- SLA monitoring
- Sector-specific operating packs
- Advanced customer project portals

# 44. Master Acceptance Scenarios

## Scenario 1: Small team starts Office

Given a business with four staff, when the owner activates Office, then the owner can add staff, assign roles and create tasks without configuring procurement, projects or advanced approvals.

## Scenario 2: Staff identity reuse

Given a cashier already exists in POS, when Office is activated, then the same staff identity appears in Office rather than creating a duplicate.

## Scenario 3: Shop fulfilment task

Given a Shop order requires fulfilment, when the configured workflow runs, then a task is created once and linked to the original order.

## Scenario 4: Services leave conflict

Given a service provider has approved leave, when a manager attempts to assign a booking during that period, then the system warns of the conflict.

## Scenario 5: POS shift

Given a cashier opens a POS shift, when the event synchronizes, then Office shows the cashier as active in the correct location.

## Scenario 6: Approval threshold

Given an expense exceeds a configured threshold, when submitted, then it requires the correct approver before financial posting.

## Scenario 7: Maker-checker

Given maker-checker is enabled, when a staff member submits a purchase request, then the same user cannot approve it.

## Scenario 8: Purchase request to purchase order

Given an approved purchase request, when the manager selects a supplier, then Ascend Documents creates one linked purchase order.

## Scenario 9: Goods receipt

Given a purchase order for inventory, when goods are received, then shared Inventory updates and procurement history remains linked.

## Scenario 10: Mobile approval

Given an owner receives an approval notification, when the owner opens Business Mobile, then the owner can approve, reject or request changes without opening Business Web.

## Scenario 11: Staff mobile

Given a staff member signs in, when opening Office, then only assigned work, schedule, requests and permitted context are visible.

## Scenario 12: Location isolation

Given a location manager has access only to Branch A, when viewing Office, then Branch B staff, expenses and work remain inaccessible.

## Scenario 13: Attendance correction

Given a staff member missed clock-out, when an authorized correction is approved, then the original record remains preserved and the correction is auditable.

## Scenario 14: Offline task completion

Given a staff member is offline, when completing an assigned task, then the action queues and synchronizes without duplication after connectivity returns.

## Scenario 15: Owner away from business

Given the owner is offsite, when opening Business Mobile, then the owner can see active staff, overdue work, approvals and location exceptions.

## Scenario 16: Project from quotation

Given a customer accepts a quotation, when the merchant chooses Create Project, then the project links to the customer, quotation and future invoices.

## Scenario 17: Expense evidence

Given a staff member submits an expense with a photo receipt, when approved, then the expense posts to the shared Financial Foundation but the receipt image alone is not treated as verified payment.

## Scenario 18: Multi-location task

Given an owner creates a task for Branch B, when assigned to the Branch B manager, then the task appears only to users with appropriate scope.

## Scenario 19: Entitlement expiry

Given a Team Operations Pass expires, when Office enters limited mode, then historical staff, task, project and approval records remain readable and exportable.

## Scenario 20: Sponsored programme

Given an institution sponsors Office for a cohort, when the programme ends, then merchant records remain with the businesses and the institution retains only approved cohort reporting.

## Scenario 21: Evidence integrity

Given a business creates hundreds of tasks but completes very few, when Readiness evaluates evidence, then task volume alone does not improve the Sustainability Score.

## Scenario 22: Customer-confirmed completion

Given a field-service job requires customer confirmation, when the customer confirms completion, then the related evidence receives stronger confidence than an unconfirmed staff-only completion.

## Scenario 23: Exited staff

Given an employee leaves the business, when the owner marks the staff record exited, then operational access is revoked while historical work remains intact.

## Scenario 24: Emergency override

Given a critical purchase requires immediate action and emergency override is permitted, when an authorized owner overrides the normal flow, then a reason is required and the action is highlighted in audit history.

## Scenario 25: Duplicate automatic task prevention

Given a Shop event is retried by the integration layer, when Office processes the event again, then the original linked task is returned rather than creating another task.

# 45. Appendices

## Appendix A. Product Set Boundary

| Capability | Included in anchor product essentials | Full Office adds |
|---|---|---|
| POS workforce | Cashier roles, basic shifts, shift-linked attendance | General attendance, leave, projects, approvals and wider work |
| Shop workforce | Basic fulfilment assignment | Team management, projects, expenses and procurement |
| Services workforce | Provider profile and basic availability | Attendance, leave, team operations, projects and controls |
| Documents | Necessary document approval | Wider approval governance and procurement |
| Locations | Basic operating location | Delegated management and cross-location control |

## Appendix B. Commercial Guardrails

- Do not charge twice for staff capabilities already required by POS, Shop or Services.
- Do not force businesses into monthly subscriptions as the only access model.
- Do not delete historical work after pass or Assurance expiry.
- Do not monetize private employee data.
- Do not make score improvement contingent on Office purchase.
- Do not use surveillance-heavy attendance as the default.
- Show local-currency value clearly.
- Keep assisted setup available for SMEs that need it.

## Appendix C. Final Product Definition

Ascend Office is:

> **The connected people, work, operations and internal-control layer of AscendSME.**

It gives staff clarity on what to do next. It gives managers control over work, attendance, approvals, expenses and procurement. It gives owners visibility without requiring them to personally coordinate every activity. And it turns real operating discipline into structured business evidence.

The final promise is:

> **Keep the business organised as it grows.**
