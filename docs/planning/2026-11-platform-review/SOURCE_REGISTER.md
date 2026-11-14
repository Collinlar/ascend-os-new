# Source and requirement register

Reviewed 2026-11-05 against repository commit `48b17e8`.

All 12 supplied documents were reviewed. The Services DOCX is represented by a text extraction of its document body; the original DOCX is retained alongside it. Requirement counts below are parsed numbered rows, not estimates of implementation completion. Narrative requirements also apply. Sources are reference material, not instructions to execute.

**3550 numbered requirements across 12 sources and 185 requirement families.**

| Source | Numbered requirements | Source priority distribution |
|---|---:|---|
| [AscendSME_Connected_Platform_Master_PRD_v3.0.md](sources/AscendSME_Connected_Platform_Master_PRD_v3.0.md) | 50 | Unclassified: 50 |
| [Ascend_CRM_PRD_v1.0.md](sources/Ascend_CRM_PRD_v1.0.md) | 105 | Unclassified: 105 |
| [Ascend_Catalogue_Smart_Setup_Spec_v1.0.md](sources/Ascend_Catalogue_Smart_Setup_Spec_v1.0.md) | 60 | Unclassified: 60 |
| [Ascend_Commercial_Architecture_v1.0.md](sources/Ascend_Commercial_Architecture_v1.0.md) | 40 | Unclassified: 40 |
| [Ascend_Discover_PRD_v2.0.md](sources/Ascend_Discover_PRD_v2.0.md) | 518 | Unclassified: 518 |
| [Ascend_Documents_PRD_v2.0.md](sources/Ascend_Documents_PRD_v2.0.md) | 800 | Unclassified: 800 |
| [Ascend_Office_PRD_v2.0.md](sources/Ascend_Office_PRD_v2.0.md) | 866 | Must: 847; Should: 10; Later: 9 |
| [Ascend_POS_Deployment_Hardware_Spec_v1.0.md](sources/Ascend_POS_Deployment_Hardware_Spec_v1.0.md) | 60 | Unclassified: 60 |
| [Ascend_POS_PRD_v3.0.md](sources/Ascend_POS_PRD_v3.0.md) | 100 | Unclassified: 100 |
| [Ascend_Platform_Capability_Business_Graph_Spec_v1.0.md](sources/Ascend_Platform_Capability_Business_Graph_Spec_v1.0.md) | 100 | Unclassified: 100 |
| [Ascend_Services_PRD_v1.0.txt](sources/Ascend_Services_PRD_v1.0.txt) | 332 | MVP: 248; Next: 78; Later: 6 |
| [Ascend_Shop_PRD_v2.0.md](sources/Ascend_Shop_PRD_v2.0.md) | 519 | MVP: 377; Next: 129; Later: 13 |

## How to use the register

The [machine-readable register](requirements.json) preserves each requirement, priority, acceptance text where supplied, source line and section. All implementation assessments begin as **not individually verified**. For each implementation ticket, attach applicable IDs, a code or migration reference, and a passing acceptance test or witnessed manual result. A source review is not a compliance certification. Do not convert a family-level “partial” finding into completed requirement statuses.

The [build plan](BUILD_PLAN.md) defines sequencing and shared ownership. The [backlog](EXECUTION_BACKLOG.md) defines deliverables and gates. The [decision log](DECISIONS.md) identifies superseded and unresolved requirements. Preserve the original requirement text when recording an approved override.

## Requirement families

| Source | Family | Count | First source line |
|---|---|---:|---:|
| AscendSME_Connected_Platform_Master_PRD_v3.0.md | MST3 | 50 | 263 |
| Ascend_CRM_PRD_v1.0.md | CRM | 105 | 199 |
| Ascend_Catalogue_Smart_Setup_Spec_v1.0.md | CAT | 60 | 104 |
| Ascend_Commercial_Architecture_v1.0.md | COM | 40 | 183 |
| Ascend_Discover_PRD_v2.0.md | DISC-ELG | 15 | 534 |
| Ascend_Discover_PRD_v2.0.md | DISC-HME | 15 | 554 |
| Ascend_Discover_PRD_v2.0.md | DISC-SRC | 15 | 574 |
| Ascend_Discover_PRD_v2.0.md | DISC-LST | 15 | 594 |
| Ascend_Discover_PRD_v2.0.md | DISC-PRF | 15 | 614 |
| Ascend_Discover_PRD_v2.0.md | DISC-PDT | 15 | 634 |
| Ascend_Discover_PRD_v2.0.md | DISC-SVC | 15 | 654 |
| Ascend_Discover_PRD_v2.0.md | DISC-ORG | 15 | 674 |
| Ascend_Discover_PRD_v2.0.md | PROM-BLD | 20 | 694 |
| Ascend_Discover_PRD_v2.0.md | PROM-PAY | 20 | 719 |
| Ascend_Discover_PRD_v2.0.md | PROM-DLV | 20 | 744 |
| Ascend_Discover_PRD_v2.0.md | PROM-RPT | 20 | 769 |
| Ascend_Discover_PRD_v2.0.md | DISC-ATR | 15 | 794 |
| Ascend_Discover_PRD_v2.0.md | DISC-COL | 15 | 814 |
| Ascend_Discover_PRD_v2.0.md | DISC-SEO | 15 | 834 |
| Ascend_Discover_PRD_v2.0.md | PROM-SOC | 15 | 854 |
| Ascend_Discover_PRD_v2.0.md | DISC-SAV | 15 | 874 |
| Ascend_Discover_PRD_v2.0.md | DISC-REC | 15 | 894 |
| Ascend_Discover_PRD_v2.0.md | DISC-TRU | 15 | 914 |
| Ascend_Discover_PRD_v2.0.md | DISC-MOD | 20 | 934 |
| Ascend_Discover_PRD_v2.0.md | DISC-DSP | 15 | 959 |
| Ascend_Discover_PRD_v2.0.md | DISC-MSG | 15 | 979 |
| Ascend_Discover_PRD_v2.0.md | DISC-EVD | 15 | 999 |
| Ascend_Discover_PRD_v2.0.md | DISC-ANL | 20 | 1019 |
| Ascend_Discover_PRD_v2.0.md | DISC-ADM | 20 | 1044 |
| Ascend_Discover_PRD_v2.0.md | DISC-SPN | 18 | 1069 |
| Ascend_Discover_PRD_v2.0.md | DISC-API | 15 | 1092 |
| Ascend_Discover_PRD_v2.0.md | DISC-SEC | 20 | 1112 |
| Ascend_Discover_PRD_v2.0.md | DISC-NFR | 20 | 1137 |
| Ascend_Discover_PRD_v2.0.md | DISC-MIG | 15 | 1162 |
| Ascend_Discover_PRD_v2.0.md | DISC-QA | 20 | 1182 |
| Ascend_Documents_PRD_v2.0.md | DOC-MST | 20 | 667 |
| Ascend_Documents_PRD_v2.0.md | DOC-CHN | 15 | 692 |
| Ascend_Documents_PRD_v2.0.md | DOC-IA | 15 | 712 |
| Ascend_Documents_PRD_v2.0.md | DOC-CRT | 20 | 732 |
| Ascend_Documents_PRD_v2.0.md | DOC-BLD | 20 | 757 |
| Ascend_Documents_PRD_v2.0.md | DOC-BIZ | 15 | 782 |
| Ascend_Documents_PRD_v2.0.md | DOC-PTY | 20 | 802 |
| Ascend_Documents_PRD_v2.0.md | DOC-LIN | 20 | 827 |
| Ascend_Documents_PRD_v2.0.md | DOC-CAL | 20 | 852 |
| Ascend_Documents_PRD_v2.0.md | DOC-NUM | 15 | 877 |
| Ascend_Documents_PRD_v2.0.md | DOC-TPL | 20 | 897 |
| Ascend_Documents_PRD_v2.0.md | DOC-LIF | 20 | 922 |
| Ascend_Documents_PRD_v2.0.md | DOC-QTE | 20 | 947 |
| Ascend_Documents_PRD_v2.0.md | DOC-INV | 20 | 972 |
| Ascend_Documents_PRD_v2.0.md | DOC-RCT | 20 | 997 |
| Ascend_Documents_PRD_v2.0.md | DOC-CRE | 20 | 1022 |
| Ascend_Documents_PRD_v2.0.md | DOC-PUR | 20 | 1047 |
| Ascend_Documents_PRD_v2.0.md | DOC-SRV | 20 | 1072 |
| Ascend_Documents_PRD_v2.0.md | DOC-AGR | 20 | 1097 |
| Ascend_Documents_PRD_v2.0.md | DOC-CNV | 20 | 1122 |
| Ascend_Documents_PRD_v2.0.md | DOC-SND | 20 | 1147 |
| Ascend_Documents_PRD_v2.0.md | DOC-PAY | 20 | 1172 |
| Ascend_Documents_PRD_v2.0.md | DOC-REC | 20 | 1197 |
| Ascend_Documents_PRD_v2.0.md | DOC-CUS | 20 | 1222 |
| Ascend_Documents_PRD_v2.0.md | DOC-BRF | 20 | 1247 |
| Ascend_Documents_PRD_v2.0.md | DOC-COL | 20 | 1272 |
| Ascend_Documents_PRD_v2.0.md | DOC-AUD | 20 | 1297 |
| Ascend_Documents_PRD_v2.0.md | DOC-OFF | 20 | 1322 |
| Ascend_Documents_PRD_v2.0.md | DOC-SRH | 20 | 1347 |
| Ascend_Documents_PRD_v2.0.md | DOC-EVD | 20 | 1372 |
| Ascend_Documents_PRD_v2.0.md | DOC-MON | 20 | 1397 |
| Ascend_Documents_PRD_v2.0.md | DOC-ENT | 20 | 1422 |
| Ascend_Documents_PRD_v2.0.md | DOC-INS | 20 | 1447 |
| Ascend_Documents_PRD_v2.0.md | DOC-MSG | 20 | 1472 |
| Ascend_Documents_PRD_v2.0.md | DOC-API | 20 | 1497 |
| Ascend_Documents_PRD_v2.0.md | DOC-SEC | 20 | 1522 |
| Ascend_Documents_PRD_v2.0.md | DOC-NFR | 20 | 1547 |
| Ascend_Documents_PRD_v2.0.md | DOC-ADM | 20 | 1572 |
| Ascend_Documents_PRD_v2.0.md | DOC-MIG | 20 | 1597 |
| Ascend_Documents_PRD_v2.0.md | DOC-ANL | 20 | 1622 |
| Ascend_Documents_PRD_v2.0.md | DOC-QA | 20 | 1647 |
| Ascend_Office_PRD_v2.0.md | OFF-MST | 20 | 408 |
| Ascend_Office_PRD_v2.0.md | OFF-DAS | 25 | 433 |
| Ascend_Office_PRD_v2.0.md | OFF-PEO | 28 | 463 |
| Ascend_Office_PRD_v2.0.md | OFF-ROL | 28 | 496 |
| Ascend_Office_PRD_v2.0.md | OFF-ATT | 29 | 529 |
| Ascend_Office_PRD_v2.0.md | OFF-SHF | 24 | 563 |
| Ascend_Office_PRD_v2.0.md | OFF-LEV | 21 | 592 |
| Ascend_Office_PRD_v2.0.md | OFF-TSK | 40 | 618 |
| Ascend_Office_PRD_v2.0.md | OFF-PRJ | 31 | 663 |
| Ascend_Office_PRD_v2.0.md | OFF-APR | 35 | 699 |
| Ascend_Office_PRD_v2.0.md | OFF-EXP | 33 | 739 |
| Ascend_Office_PRD_v2.0.md | OFF-PRO | 35 | 777 |
| Ascend_Office_PRD_v2.0.md | OFF-LOC | 24 | 817 |
| Ascend_Office_PRD_v2.0.md | OFF-CAL | 22 | 846 |
| Ascend_Office_PRD_v2.0.md | OFF-ACT | 20 | 873 |
| Ascend_Office_PRD_v2.0.md | OFF-XFL | 29 | 898 |
| Ascend_Office_PRD_v2.0.md | OFF-MOB | 26 | 932 |
| Ascend_Office_PRD_v2.0.md | OFF-STF | 23 | 963 |
| Ascend_Office_PRD_v2.0.md | OFF-POS | 18 | 991 |
| Ascend_Office_PRD_v2.0.md | OFF-DOC | 16 | 1014 |
| Ascend_Office_PRD_v2.0.md | OFF-MSG | 24 | 1035 |
| Ascend_Office_PRD_v2.0.md | OFF-REP | 32 | 1064 |
| Ascend_Office_PRD_v2.0.md | OFF-OFF | 22 | 1101 |
| Ascend_Office_PRD_v2.0.md | OFF-EVD | 25 | 1128 |
| Ascend_Office_PRD_v2.0.md | OFF-MON | 25 | 1158 |
| Ascend_Office_PRD_v2.0.md | OFF-ENT | 21 | 1188 |
| Ascend_Office_PRD_v2.0.md | OFF-INS | 20 | 1214 |
| Ascend_Office_PRD_v2.0.md | OFF-API | 20 | 1239 |
| Ascend_Office_PRD_v2.0.md | OFF-SEC | 29 | 1264 |
| Ascend_Office_PRD_v2.0.md | OFF-NFR | 23 | 1298 |
| Ascend_Office_PRD_v2.0.md | OFF-ADM | 23 | 1326 |
| Ascend_Office_PRD_v2.0.md | OFF-MIG | 25 | 1354 |
| Ascend_Office_PRD_v2.0.md | OFF-ANL | 25 | 1384 |
| Ascend_Office_PRD_v2.0.md | OFF-QA | 25 | 1414 |
| Ascend_POS_Deployment_Hardware_Spec_v1.0.md | HW | 60 | 145 |
| Ascend_POS_PRD_v3.0.md | POS3 | 100 | 122 |
| Ascend_Platform_Capability_Business_Graph_Spec_v1.0.md | BG | 100 | 302 |
| Ascend_Services_PRD_v1.0.txt | SRV-ONB | 10 | 246 |
| Ascend_Services_PRD_v1.0.txt | SRV-AI | 10 | 292 |
| Ascend_Services_PRD_v1.0.txt | SRV-CAT | 20 | 339 |
| Ascend_Services_PRD_v1.0.txt | SRV-CAL | 18 | 424 |
| Ascend_Services_PRD_v1.0.txt | SRV-PUB | 15 | 502 |
| Ascend_Services_PRD_v1.0.txt | SRV-BKG | 15 | 593 |
| Ascend_Services_PRD_v1.0.txt | SRV-REQ | 8 | 659 |
| Ascend_Services_PRD_v1.0.txt | SRV-QTE | 10 | 696 |
| Ascend_Services_PRD_v1.0.txt | SRV-CLS | 10 | 741 |
| Ascend_Services_PRD_v1.0.txt | SRV-FLD | 10 | 786 |
| Ascend_Services_PRD_v1.0.txt | SRV-PRJ | 8 | 831 |
| Ascend_Services_PRD_v1.0.txt | SRV-PAY | 15 | 869 |
| Ascend_Services_PRD_v1.0.txt | SRV-CAN | 10 | 934 |
| Ascend_Services_PRD_v1.0.txt | SRV-CRM | 10 | 980 |
| Ascend_Services_PRD_v1.0.txt | SRV-STF | 10 | 1025 |
| Ascend_Services_PRD_v1.0.txt | SRV-LOC | 8 | 1070 |
| Ascend_Services_PRD_v1.0.txt | SRV-JOB | 10 | 1108 |
| Ascend_Services_PRD_v1.0.txt | SRV-MSG | 10 | 1153 |
| Ascend_Services_PRD_v1.0.txt | SRV-DOC | 8 | 1198 |
| Ascend_Services_PRD_v1.0.txt | SRV-RPT | 12 | 1235 |
| Ascend_Services_PRD_v1.0.txt | SRV-EVD | 10 | 1290 |
| Ascend_Services_PRD_v1.0.txt | SRV-DIS | 10 | 1336 |
| Ascend_Services_PRD_v1.0.txt | SRV-RBAC | 8 | 1399 |
| Ascend_Services_PRD_v1.0.txt | SRV-SYNC | 10 | 1436 |
| Ascend_Services_PRD_v1.0.txt | SRV-API | 10 | 1482 |
| Ascend_Services_PRD_v1.0.txt | SRV-MON | 12 | 1546 |
| Ascend_Services_PRD_v1.0.txt | SRV-SUP | 8 | 1599 |
| Ascend_Services_PRD_v1.0.txt | SRV-ADM | 10 | 1636 |
| Ascend_Services_PRD_v1.0.txt | SRV-SEC | 12 | 1682 |
| Ascend_Services_PRD_v1.0.txt | SRV-NFR | 15 | 1735 |
| Ascend_Shop_PRD_v2.0.md | SHOP-PLT | 12 | 341 |
| Ascend_Shop_PRD_v2.0.md | SHOP-EXP | 14 | 362 |
| Ascend_Shop_PRD_v2.0.md | SHOP-BIZ | 16 | 385 |
| Ascend_Shop_PRD_v2.0.md | SHOP-CUS | 18 | 410 |
| Ascend_Shop_PRD_v2.0.md | SHOP-ONB | 28 | 437 |
| Ascend_Shop_PRD_v2.0.md | SHOP-ID | 10 | 474 |
| Ascend_Shop_PRD_v2.0.md | SHOP-CAT | 24 | 493 |
| Ascend_Shop_PRD_v2.0.md | SHOP-AI | 16 | 522 |
| Ascend_Shop_PRD_v2.0.md | SHOP-INV | 9 | 547 |
| Ascend_Shop_PRD_v2.0.md | SHOP-STORE | 9 | 565 |
| Ascend_Shop_PRD_v2.0.md | SHOP-HOME | 7 | 579 |
| Ascend_Shop_PRD_v2.0.md | SHOP-WEB | 6 | 591 |
| Ascend_Shop_PRD_v2.0.md | SHOP-SOC | 9 | 606 |
| Ascend_Shop_PRD_v2.0.md | SHOP-DISC | 7 | 624 |
| Ascend_Shop_PRD_v2.0.md | SHOP-CHK | 12 | 640 |
| Ascend_Shop_PRD_v2.0.md | SHOP-PAY | 13 | 661 |
| Ascend_Shop_PRD_v2.0.md | SHOP-ORD | 12 | 683 |
| Ascend_Shop_PRD_v2.0.md | SHOP-FUL | 9 | 704 |
| Ascend_Shop_PRD_v2.0.md | SHOP-RET | 8 | 722 |
| Ascend_Shop_PRD_v2.0.md | SHOP-CRM | 8 | 739 |
| Ascend_Shop_PRD_v2.0.md | SHOP-PROMO | 7 | 756 |
| Ascend_Shop_PRD_v2.0.md | SHOP-ADX | 30 | 772 |
| Ascend_Shop_PRD_v2.0.md | SHOP-OPS | 16 | 811 |
| Ascend_Shop_PRD_v2.0.md | SHOP-RPT | 9 | 836 |
| Ascend_Shop_PRD_v2.0.md | SHOP-MSG | 11 | 854 |
| Ascend_Shop_PRD_v2.0.md | SHOP-RBAC | 6 | 874 |
| Ascend_Shop_PRD_v2.0.md | SHOP-EVD | 10 | 889 |
| Ascend_Shop_PRD_v2.0.md | SHOP-EVT | 18 | 904 |
| Ascend_Shop_PRD_v2.0.md | SHOP-MON | 24 | 931 |
| Ascend_Shop_PRD_v2.0.md | SHOP-ENT | 6 | 964 |
| Ascend_Shop_PRD_v2.0.md | SHOP-BND | 16 | 975 |
| Ascend_Shop_PRD_v2.0.md | SHOP-SYNC | 10 | 1000 |
| Ascend_Shop_PRD_v2.0.md | SHOP-SEO | 8 | 1019 |
| Ascend_Shop_PRD_v2.0.md | SHOP-NFR | 12 | 1032 |
| Ascend_Shop_PRD_v2.0.md | SHOP-SEC | 14 | 1053 |
| Ascend_Shop_PRD_v2.0.md | SHOP-SUP | 9 | 1076 |
| Ascend_Shop_PRD_v2.0.md | SHOP-INST | 6 | 1094 |
| Ascend_Shop_PRD_v2.0.md | SHOP-API | 9 | 1109 |
| Ascend_Shop_PRD_v2.0.md | SHOP-MIG | 14 | 1127 |
| Ascend_Shop_PRD_v2.0.md | SHOP-ANL | 13 | 1150 |
| Ascend_Shop_PRD_v2.0.md | SHOP-REL | 15 | 1172 |
| Ascend_Shop_PRD_v2.0.md | SHOP-QA | 9 | 1196 |

## Reproduction

Run `node docs/planning/2026-11-platform-review/build-register.mjs`. The script fails on duplicate IDs within a source and records source SHA-256 hashes in requirements.json. IDs can overlap across different source documents; identify requirements by source plus ID.
