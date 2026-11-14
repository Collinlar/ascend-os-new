# Ascend Catalogue & Smart Setup Specification v1.0

**Status:** Shared platform capability specification  
**Date:** 16 September 2026

---

## 1. Purpose

Ascend Catalogue is the canonical commercial catalogue for POS, Shop, Discover, Documents and relevant Office workflows.

Smart Setup is the optional paid acceleration layer that helps merchants build the catalogue quickly using AI or assisted implementation.

> **The merchant can always build the catalogue manually for free. Payment buys speed, assistance and processing, not ownership of the catalogue.**

---

## 2. Shared Catalogue Model

One product may appear in POS, Shop, Discover, Documents and inventory without duplication.

Core fields include:

- Product ID
- Business ID
- Name
- Description
- Category
- Brand
- SKU
- Barcode
- Images
- Variants
- Attributes
- Unit
- Selling price
- Cost price where permitted
- Tax treatment
- Stock-tracked flag
- Opening stock
- Availability
- POS enabled
- Shop enabled
- Discover eligibility
- Status
- Source
- AI-generated fields
- Merchant-review status
- Audit history

---

## 3. Setup Modes

### Manual Setup

Free. Merchant creates and edits products manually.

### Smart Setup DIY

Paid. Merchant provides images or structured files and AI assists with titles, descriptions, categories, attributes, variants, duplicate detection and spreadsheet cleaning.

### Assisted Setup

Paid. Ascend staff or approved partners complete most of the configuration and may include photography, migration, printer setup, staff setup and training.

---

## 4. AI Workflow

1. Merchant uploads images or file.
2. System creates processing job.
3. AI proposes structured product information.
4. Low-confidence fields are flagged.
5. Merchant or operator reviews.
6. Price is confirmed.
7. Stock is confirmed.
8. Product is activated.
9. Channel visibility is selected.
10. Audit records preserve AI and human changes.

AI must not invent merchant prices or stock quantities without explicit confirmation.

---

## 5. Smart Setup Packs

Illustrative structure:

- Smart Setup 25
- Smart Setup 100
- Smart Setup 250
- Smart Setup 500
- Custom Bulk Setup

These describe AI processing capacity, not permanent product limits.

---

## 6. Requirements

| ID | Requirement |
|---|---|
| CAT-001 | Manual product creation shall remain free. |
| CAT-002 | AI setup shall be optional. |
| CAT-003 | Assisted setup shall be optional. |
| CAT-004 | Each product shall have one canonical shared identifier. |
| CAT-005 | POS and Shop shall reuse the same canonical product. |
| CAT-006 | Discover shall reference the same canonical product. |
| CAT-007 | Channel-specific settings shall not duplicate the core product. |
| CAT-008 | AI output shall be reviewable before activation. |
| CAT-009 | The system shall record AI-generated fields. |
| CAT-010 | The system shall record merchant or operator confirmation. |
| CAT-011 | AI shall support title suggestion. |
| CAT-012 | AI shall support description suggestion. |
| CAT-013 | AI shall support category suggestion. |
| CAT-014 | AI shall support attribute suggestion. |
| CAT-015 | AI shall support likely variant suggestion. |
| CAT-016 | Image-based setup shall be supported. |
| CAT-017 | CSV or spreadsheet import shall be supported. |
| CAT-018 | Bulk image upload shall be supported. |
| CAT-019 | Duplicate detection shall be supported. |
| CAT-020 | Low-confidence fields shall be flagged. |
| CAT-021 | Price shall require explicit confirmation. |
| CAT-022 | Opening stock shall require explicit confirmation. |
| CAT-023 | Batch approval shall be supported. |
| CAT-024 | Individual correction shall be supported. |
| CAT-025 | Smart Setup pack consumption shall be tracked. |
| CAT-026 | Failed AI jobs shall not unfairly consume paid capacity. |
| CAT-027 | Retried jobs shall be idempotent where possible. |
| CAT-028 | Products shall remain after AI capacity is exhausted. |
| CAT-029 | Pack expiry shall not delete generated products. |
| CAT-030 | Assisted setup operator roles shall be supported. |
| CAT-031 | Operators shall not gain business ownership. |
| CAT-032 | Operator actions shall be audited. |
| CAT-033 | Certified setup partners shall be supported in future. |
| CAT-034 | Setup partner identity shall be recorded. |
| CAT-035 | Setup jobs shall have tracked status. |
| CAT-036 | Setup jobs shall support Draft, Processing, Review, Completed and Failed states. |
| CAT-037 | Merchant approval before publication shall be supported. |
| CAT-038 | Category-specific setup templates shall be supported. |
| CAT-039 | Business-type defaults shall be supported. |
| CAT-040 | Barcode entry shall be supported. |
| CAT-041 | SKU generation shall be available where requested. |
| CAT-042 | Product-photography guidance shall be supported. |
| CAT-043 | Image cropping and optimization shall be supported. |
| CAT-044 | Original merchant images shall be preserved. |
| CAT-045 | Channel-ready image derivatives shall be supported. |
| CAT-046 | Catalogue search shall be supported. |
| CAT-047 | Archive shall be preferred to destructive deletion. |
| CAT-048 | Product merge shall preserve audit history. |
| CAT-049 | Variant relationships shall be supported. |
| CAT-050 | Unit-of-measure configuration shall be supported. |
| CAT-051 | Cost price shall be role-restricted. |
| CAT-052 | Market-specific tax attributes shall be supported. |
| CAT-053 | Product availability shall be supported. |
| CAT-054 | Channel eligibility rules shall be supported. |
| CAT-055 | Product completeness may be used for setup guidance. |
| CAT-056 | Product completeness shall not be treated as Sustainability Score. |
| CAT-057 | Catalogue export shall be supported. |
| CAT-058 | Import history shall be preserved. |
| CAT-059 | Approved API access shall be supported. |
| CAT-060 | Catalogue shall remain a shared platform capability, not a POS-only feature. |

---

## 7. Commercial Principle

Charge for AI processing, operator time, photography, migration, cleanup, complexity and training.

Do not charge for permanent catalogue ownership, manual product entry, merchant export or basic editing of existing products.

---

## 8. Final Definition

> **Ascend Catalogue is the shared product foundation. Smart Setup is the optional acceleration service that makes getting onto Ascend dramatically faster.**
