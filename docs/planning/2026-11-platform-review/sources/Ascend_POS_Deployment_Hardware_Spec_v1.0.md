# Ascend POS Deployment & Hardware Specification v1.0

**Status:** Deployment and hardware baseline  
**Date:** 16 September 2026

---

## 1. Purpose

This specification defines how Ascend POS operates across merchant-owned phones, portable printer configurations, dedicated Smart POS terminals and fixed Counter deployments.

One software engine must support all device classes.

---

## 2. Deployment Classes

### Class A: BYOD Smartphone

Merchant-owned Android phone.

- No Ascend hardware purchase required
- No mandatory MDM
- Portrait-first
- Digital receipt by default
- Optional Bluetooth printer
- Camera available for product or barcode capture
- Mobile data and Wi-Fi

### Class B: POS Print Kit

Merchant smartphone plus Ascend-supported portable printer.

- Bluetooth preferred
- Rechargeable
- Locally available paper
- Field-portable
- Test-print workflow
- Optional carrying case

### Class C: Ascend Smart POS

Dedicated Android terminal.

Preferred characteristics:

- Supported Android version
- 5.5 to 6.5 inch screen
- Integrated thermal printer
- 3 GB RAM or more preferred
- 32 GB storage or more preferred
- 4G
- Wi-Fi
- Bluetooth
- Strong full-day battery
- Camera or barcode capability
- NFC optional
- SIM support
- Secure boot and device security support
- Remote management capability

### Class D: Ascend POS Counter

Larger tablet or touchscreen with optional:

- Thermal printer
- Barcode scanner
- Stand
- Cash drawer
- Customer display
- External payment terminal

---

## 3. Software Adaptation

### Compact screens

- Portrait-first
- Sequential flow
- Persistent cart total
- Large touch targets
- Minimal simultaneous panels

### Wide screens

- Product browser and cart together
- Faster keyboard and scanner interaction
- Persistent totals
- Larger transaction overview

Both use the same transaction engine.

---

## 4. Printer Support

Approved connection types:

- Bluetooth
- Integrated device printer
- USB where supported
- Network printing where supported

Configuration flow:

1. Open Printer Settings
2. Discover or select printer
3. Pair or connect
4. Choose paper width
5. Print test receipt
6. Save as default
7. Show printer status

---

## 5. Managed Device Boundary

Merchant-owned devices use normal application permissions and are not forced into kiosk mode or remote wipe.

Ascend-managed devices may support kiosk mode, remote app update, remote logout, device health monitoring, controlled settings and contractual remote disable.

---

## 6. Offline Requirements

Offline support should include:

- Product lookup
- Cart creation
- Cash sale
- Receipt generation
- Shift continuation
- Local transaction history
- Queued synchronization

External payment authorizations must not be falsely shown as completed when unavailable offline.

---

## 7. Requirements

| ID | Requirement |
|---|---|
| HW-001 | Merchant-owned Android smartphones shall be supported. |
| HW-002 | Dedicated Android Smart POS terminals shall be supported. |
| HW-003 | Tablet and counter devices shall be supported. |
| HW-004 | Businesses shall move between device classes without migration. |
| HW-005 | Personal devices shall not require MDM. |
| HW-006 | Ascend-managed devices may use MDM. |
| HW-007 | Device class shall be detected or registered. |
| HW-008 | Screen class shall be detected. |
| HW-009 | UI shall adapt to screen class. |
| HW-010 | Compact layouts shall be touch-first. |
| HW-011 | Wide layouts shall support high-throughput interaction. |
| HW-012 | Bluetooth printers shall be supported. |
| HW-013 | Integrated Smart POS printers shall be supported. |
| HW-014 | Approved USB or network printers may be supported on Counter deployments. |
| HW-015 | Printer setup shall include test print. |
| HW-016 | Printer status shall be visible. |
| HW-017 | Printer failure shall not block sale completion. |
| HW-018 | Digital receipt shall remain available. |
| HW-019 | Approved paper widths shall be supported. |
| HW-020 | Receipt reprint shall be supported. |
| HW-021 | Device registration shall be supported. |
| HW-022 | Managed devices shall expose remote status. |
| HW-023 | Managed devices shall support remote application update where available. |
| HW-024 | Managed devices shall support remote logout. |
| HW-025 | Managed devices may support kiosk mode. |
| HW-026 | Managed devices shall preserve business-data security. |
| HW-027 | Offline cash sales shall be supported. |
| HW-028 | Offline product lookup shall be supported. |
| HW-029 | Offline transactions shall queue for sync. |
| HW-030 | Synchronization shall be idempotent. |
| HW-031 | Pending sync shall be visible. |
| HW-032 | Failed sync shall be visible. |
| HW-033 | Original transaction time shall be preserved. |
| HW-034 | Synchronization time shall be preserved. |
| HW-035 | Integrated payment status shall follow payment-provider truth. |
| HW-036 | Unavailable external authorization shall not be shown as successful. |
| HW-037 | Smart POS should support a full business day under normal use. |
| HW-038 | Hardware selection shall consider local repairability. |
| HW-039 | Hardware selection shall consider paper availability. |
| HW-040 | Hardware selection shall consider replacement-part availability. |
| HW-041 | Hardware selection shall consider local network compatibility. |
| HW-042 | Hardware selection shall consider camera or scanner quality. |
| HW-043 | Hardware selection shall consider printer reliability. |
| HW-044 | Hardware selection shall consider battery replacement cost. |
| HW-045 | Hardware selection shall consider vendor firmware support. |
| HW-046 | Hardware selection shall consider security patch policy. |
| HW-047 | At least two Smart POS models should be piloted. |
| HW-048 | An approved-device list shall be maintained. |
| HW-049 | Hardware warranty records shall be supported. |
| HW-050 | Managed-device serial tracking shall be supported. |
| HW-051 | Supplied-printer asset tracking shall be supported. |
| HW-052 | Hardware package SKUs shall be supported. |
| HW-053 | Replacement-device workflows shall be supported. |
| HW-054 | Warranty claim status shall be supported. |
| HW-055 | Setup technician attribution shall be supported. |
| HW-056 | Deployment checklist completion shall be recorded. |
| HW-057 | Training confirmation shall be recorded. |
| HW-058 | First test sale shall be recorded. |
| HW-059 | First test print shall be recorded. |
| HW-060 | Remote support diagnostics shall be supported where device class permits. |

---

## 8. Deployment Checklist

- Verify business
- Verify location
- Confirm catalogue
- Configure prices
- Configure stock
- Configure payment methods
- Configure staff
- Register device if managed
- Connect printer
- Print test receipt
- Complete test sale
- Test offline mode
- Train business
- Confirm support channel
- Record warranty
- Hand over quick guide

---

## 9. Pilot

Recommended pilot:

- 20 to 30 businesses
- At least two Smart POS models
- At least two portable printer models
- Mix of small and medium catalogues
- Mix of weak and strong connectivity
- Different retail categories

Measure:

- Sale speed
- Printer reliability
- Battery performance
- Sync failures
- Setup time
- Support load
- Training time
- Paper consumption
- Device failures
- Merchant satisfaction
- Upgrade intent

---

## 10. Final Definition

> **Ascend POS hardware is not a separate product system. It is a set of deployment configurations for one connected POS experience.**
