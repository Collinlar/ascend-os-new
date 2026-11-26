// PDF for a commercial document.
//
// Deliberately pure, like the ESC/POS encoder: it takes a document and
// returns bytes, with no database and no request in the middle. The layout
// can be proven on a desk.
//
// Hand-written rather than a library, for the same reason the thermal
// printer is. A PDF invoice needs a page, two fonts and a table, and the
// smallest PDF library that does that carries a font subsetter and a
// stream compressor we would never call. This produces a file of a few
// kilobytes that opens in every reader, WhatsApp's included, which matters
// more in Accra than anything a heavier dependency would buy.
//
// Two decisions worth knowing:
//
//   Only the base-14 fonts are used, so nothing is embedded. That keeps
//   the file tiny and means no licence travels with it.
//
//   Amounts are set in Courier and the currency is stated once in the
//   column heading. Courier is monospaced, so a column of figures aligns
//   exactly without carrying font metrics around, and stating GHS in the
//   heading avoids the cedi sign, which is not in the encoding the base
//   fonts use. "GHS 400.00" is what a bank wants to see anyway.

import { jpegInfo } from "./jpeg";

const PAGE_WIDTH = 595.28; // A4, the paper Ghana actually uses
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Courier at any size is exactly 0.6 em per character.
const COURIER_RATIO = 0.6;
// Helvetica varies. This is only ever used to decide where to truncate a
// long description, never to position anything, so an average is honest.
const HELVETICA_RATIO = 0.5;

export interface PdfLine {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PdfDocument {
  type: string;
  number: string | null;
  issuedAt: string | null;
  dueDate: string | null;
  currencyCode: string;
  businessName: string;
  businessPhone?: string | null;
  businessAddress?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  lines: PdfLine[];
  subtotal: number | null;
  taxTotal: number | null;
  total: number | null;
  amountPaid?: number | null;
  status: string;
  /** Why the document exists, where that is part of the record. On a
   *  credit note it always is: it is the whole audit trail. */
  reason?: string | null;
  /** Where the customer can check this document is real. */
  verifyUrl?: string | null;
  /** What the business wants said at the bottom of every document: MoMo
   *  details, terms, or thanks. */
  footerNote?: string | null;
  /** This document's own note, written when it was made (Modules R1). */
  note?: string | null;
  /** #RRGGBB. Used for the title and the rule under the table, never for
   *  anything that carries meaning, so a bad choice cannot make a document
   *  unreadable. */
  accentColour?: string | null;
  /** The look the business chose (Modules R2). Classic when not set. */
  template?: "classic" | "modern" | "compact" | null;
  businessEmail?: string | null;
  /** Ghana Revenue Authority TIN, or the Ghana Card PIN used as one. */
  tin?: string | null;
  /** The logo as JPEG bytes. Anything else is left off rather than broken. */
  logo?: Uint8Array | null;
  /** Signature lines on purchase orders and delivery notes. On by default. */
  signatureAreas?: boolean | null;
}

// PDF wants 0-1 floats per channel, not hex.
function rgb(hex: string | null | undefined): [number, number, number] | null {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

// ---------------------------------------------------------------------------
// The writer. Objects are collected, then the cross-reference table is built
// from where each one actually landed, which is the only part of the format
// that has to be exact.
// ---------------------------------------------------------------------------
class Pdf {
  private objects: string[] = [];

  add(body: string): number {
    this.objects.push(body);
    return this.objects.length; // object numbers are 1-based
  }

  // The catalogue must be object 1 because the trailer names it, and the
  // page tree must know its own id before the pages can point at it. Both
  // are reserved up front and filled once the rest exists.
  reserve(): number {
    return this.add("");
  }

  set(id: number, body: string) {
    this.objects[id - 1] = body;
  }

  build(): Uint8Array {
    const header = "%PDF-1.4\n";
    let out = header;
    const offsets: number[] = [];

    this.objects.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });

    const xrefAt = out.length;
    out += `xref\n0 ${this.objects.length + 1}\n`;
    out += "0000000000 65535 f \n";
    for (const offset of offsets) {
      out += `${String(offset).padStart(10, "0")} 00000 n \n`;
    }
    out += `trailer\n<< /Size ${this.objects.length + 1} /Root 1 0 R >>\n`;
    out += `startxref\n${xrefAt}\n%%EOF\n`;

    // Latin-1: every byte in the file is one character, which is what the
    // offsets above were counted in.
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i += 1) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}

// PDF strings end at an unescaped bracket, so brackets and backslashes have
// to be escaped. Anything outside Latin-1 is replaced rather than mangled:
// a customer named with a character the base fonts cannot set should see a
// question mark, not a broken file.
function pdfString(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 63;
    if (char === "(" || char === ")" || char === "\\") out += `\\${char}`;
    else if (code < 32) out += " ";
    else if (code > 255) out += "?";
    else out += char;
  }
  return out;
}

class Content {
  private ops: string[] = [];

  text(
    x: number,
    y: number,
    value: string,
    font: "F1" | "F2" | "F3",
    size: number,
    colour?: [number, number, number] | null
  ) {
    const fill = colour
      ? `${colour[0].toFixed(3)} ${colour[1].toFixed(3)} ${colour[2].toFixed(3)} rg `
      : "0 g ";
    this.ops.push(
      `BT ${fill}/${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfString(value)}) Tj ET`
    );
    return this;
  }

  // Amounts hang off the right edge of their column.
  right(xRight: number, y: number, value: string, font: "F3", size: number) {
    const width = value.length * size * COURIER_RATIO;
    return this.text(xRight - width, y, value, font, size);
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.7, grey = 0.8) {
    this.ops.push(
      `${grey} G ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`
    );
    return this;
  }

  rect(x: number, y: number, w: number, h: number, colour: [number, number, number]) {
    this.ops.push(`${colour.map((v) => v.toFixed(3)).join(" ")} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    return this;
  }

  rule(x1: number, y: number, x2: number, width: number, colour: [number, number, number]) {
    this.ops.push(`${colour.map((v) => v.toFixed(3)).join(" ")} RG ${width} w ${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S`);
    return this;
  }

  image(name: string, x: number, y: number, w: number, h: number) {
    this.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${name} Do Q`);
    return this;
  }

  toString(): string {
    return this.ops.join("\n");
  }
}

const WHITE: [number, number, number] = [1, 1, 1];
const GREY: [number, number, number] = [0.29, 0.33, 0.39];
// Without a chosen colour: the action teal, or a neutral ink for Classic.
const DEFAULT_ACCENT: [number, number, number] = [0, 0.478, 0.435];

// Bold capitals run wide; an estimate per font keeps right-aligned text
// inside the margin. Only used for placing, never for measuring a column.
function textWidth(value: string, font: "F1" | "F2", size: number): number {
  const ratio = font === "F1" ? HELVETICA_RATIO : value === value.toUpperCase() ? 0.7 : 0.57;
  return value.length * size * ratio;
}

function rightText(c: Content, xRight: number, y: number, value: string, font: "F1" | "F2", size: number, colour?: [number, number, number] | null) {
  c.text(xRight - textWidth(value, font, size), y, value, font, size, colour);
}

function truncate(value: string, maxWidth: number, size: number): string {
  const max = Math.floor(maxWidth / (size * HELVETICA_RATIO));
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 1))}…`.replace("…", "...");
}

function amount(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function dateLabel(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Who the document is addressed to, said the way each kind says it.
const PARTY_LABEL: Record<string, string> = {
  purchase_order: "Ordered from",
  delivery_note: "Deliver to",
  quotation: "Prepared for",
  proforma: "Prepared for",
  receipt: "Received from",
  credit_note: "Issued to",
};

// The two signature lines on the documents that record goods changing hands.
const SIGN_AREAS: Record<string, [string, string]> = {
  delivery_note: ["Delivered by", "Received by customer"],
  purchase_order: ["Authorised by", "Received by supplier"],
};

const TYPE_TITLE: Record<string, string> = {
  quotation: "QUOTATION",
  proforma: "PROFORMA INVOICE",
  invoice: "INVOICE",
  receipt: "RECEIPT",
  credit_note: "CREDIT NOTE",
  purchase_order: "PURCHASE ORDER",
  delivery_note: "DELIVERY NOTE",
  agreement: "AGREEMENT",
  job_card: "JOB CARD",
  statement: "STATEMENT",
};

// What the customer should understand at a glance, in words rather than
// the enum's own vocabulary.
const STATUS_LABEL: Record<string, string> = {
  paid: "Paid in full",
  partially_paid: "Part paid",
  credited: "Credited in full",
  overdue: "Overdue",
  issued: "Issued",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  rejected: "Rejected",
  cancelled: "Cancelled",
  superseded: "Superseded",
};

const ROWS_FIRST_PAGE = 22;
const ROWS_LATER_PAGE = 34;

export function renderDocumentPdf(doc: PdfDocument): Uint8Array {
  const template = doc.template ?? "classic";
  const accent = rgb(doc.accentColour) ?? (template === "classic" ? null : DEFAULT_ACCENT);
  const logoInfo = doc.logo ? jpegInfo(doc.logo) : null;
  const pdf = new Pdf();
  const catalogId = pdf.reserve(); // object 1, per the trailer
  const pagesId = pdf.reserve();

  // Split the lines across pages before drawing anything, so page numbers
  // can say "1 of 3" on the first page rather than discovering it later.
  const pages: PdfLine[][] = [];
  let remaining = [...doc.lines];
  pages.push(remaining.splice(0, ROWS_FIRST_PAGE));
  while (remaining.length > 0) pages.push(remaining.splice(0, ROWS_LATER_PAGE));

  const contentIds: number[] = [];

  pages.forEach((linesOnPage, pageIndex) => {
    const c = new Content();
    const isFirst = pageIndex === 0;
    const isLast = pageIndex === pages.length - 1;
    let y = PAGE_HEIGHT - MARGIN;

    if (isFirst) {
      y = letterhead(c, doc, template, accent, logoInfo);


      if (doc.customerName) {
        // A purchase order is addressed to whoever is being ordered from,
        // not billed.
        c.text(
          MARGIN,
          y,
          PARTY_LABEL[doc.type] ?? "Billed to",
          "F1",
          8.5
        );
        y -= 13;
        c.text(MARGIN, y, doc.customerName, "F2", 11);
        y -= 12;
        if (doc.customerPhone) {
          c.text(MARGIN, y, doc.customerPhone, "F1", 9);
          y -= 12;
        }
      }
      y -= 10;
    } else {
      c.text(MARGIN, y, `${doc.businessName} · ${doc.number ?? ""}`, "F1", 9);
      y -= 24;
    }

    // A delivery note records what changed hands, not what it cost
    // (Modules R1): quantities only, no prices and no totals.
    const hidePrices = doc.type === "delivery_note";

    // Column geometry. Amounts are right-aligned to these edges.
    const qtyRight = MARGIN + CONTENT_WIDTH * 0.6;
    const priceRight = MARGIN + CONTENT_WIDTH * 0.79;
    const totalRight = MARGIN + CONTENT_WIDTH;
    const descWidth = qtyRight - MARGIN - 60;

    c.text(MARGIN, y, hidePrices ? "Item" : "Description", "F2", 8.5);
    if (hidePrices) {
      c.right(priceRight, y, "Ordered", "F3", 8.5);
      c.right(totalRight, y, "Delivered", "F3", 8.5);
    } else {
      c.right(qtyRight, y, "Qty", "F3", 8.5);
      c.right(priceRight, y, "Price", "F3", 8.5);
      c.right(totalRight, y, `Amount ${doc.currencyCode}`, "F3", 8.5);
    }
    y -= 6;
    if (accent) c.rule(MARGIN, y, MARGIN + CONTENT_WIDTH, 1.2, accent);
    else c.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y, 0.8, 0.75);
    y -= 14;

    for (const line of linesOnPage) {
      c.text(MARGIN, y, truncate(line.description, descWidth, 9.5), "F1", 9.5);
      if (hidePrices) {
        c.right(priceRight, y, String(line.quantity), "F3", 9.5);
        c.right(totalRight, y, String(line.quantity), "F3", 9.5);
      } else {
        c.right(qtyRight, y, String(line.quantity), "F3", 9.5);
        c.right(priceRight, y, amount(line.unitPrice), "F3", 9.5);
        c.right(totalRight, y, amount(line.lineTotal), "F3", 9.5);
      }
      y -= 15;
    }

    if (isLast) {
      y -= 4;
      c.line(MARGIN + CONTENT_WIDTH * 0.55, y, MARGIN + CONTENT_WIDTH, y, 0.8, 0.75);
      y -= 15;

      const labelRight = MARGIN + CONTENT_WIDTH * 0.79;
      const totalRow = (label: string, value: number | null, bold = false) => {
        c.text(
          labelRight - label.length * 9.5 * HELVETICA_RATIO,
          y,
          label,
          bold ? "F2" : "F1",
          9.5
        );
        c.right(totalRight, y, amount(value), "F3", bold ? 10.5 : 9.5);
        y -= bold ? 17 : 14;
      };

      if (!hidePrices) {
        totalRow("Subtotal", doc.subtotal);
        if ((doc.taxTotal ?? 0) !== 0) totalRow("Tax", doc.taxTotal);
        totalRow("Total", doc.total, true);
      }

      if (doc.amountPaid !== null && doc.amountPaid !== undefined) {
        totalRow("Paid", doc.amountPaid);
        const balance = (doc.total ?? 0) - doc.amountPaid;
        if (Math.abs(balance) > 0.005) totalRow("Balance due", balance, true);
      }

      if (doc.reason) {
        y -= 4;
        c.text(MARGIN, y, "Reason", "F1", 8.5);
        y -= 12;
        c.text(MARGIN, y, truncate(doc.reason, CONTENT_WIDTH * 0.55, 9.5), "F2", 9.5);
        y -= 14;
      }

      if (doc.note) {
        y -= 4;
        c.text(MARGIN, y, "Note", "F1", 8.5);
        y -= 12;
        c.text(MARGIN, y, truncate(doc.note, CONTENT_WIDTH, 9.5), "F1", 9.5);
        y -= 14;
      }
      const signs = doc.signatureAreas === false ? undefined : SIGN_AREAS[doc.type];
      if (signs) {
        // Somewhere for both sides to sign for what changed hands.
        y -= 18;
        c.line(MARGIN, y, MARGIN + CONTENT_WIDTH * 0.4, y, 0.6, 0.6);
        c.line(MARGIN + CONTENT_WIDTH * 0.55, y, MARGIN + CONTENT_WIDTH, y, 0.6, 0.6);
        y -= 11;
        c.text(MARGIN, y, signs[0], "F1", 8.5);
        c.text(MARGIN + CONTENT_WIDTH * 0.55, y, signs[1], "F1", 8.5);
        y -= 14;
      }

      y -= 8;
      // A receipt says what it is by existing. Its stored status is
      // "issued", which would print as "Issued" and tell the customer
      // nothing about their money.
      const status =
        doc.type === "receipt" ? "Payment received" : STATUS_LABEL[doc.status];
      if (status) {
        c.text(MARGIN, y, status, "F2", 10);
        y -= 20;
      }

      // What the business wants said on every document. Sits above the
      // verification line, because it is theirs and that line is ours.
      if (doc.footerNote) {
        c.text(MARGIN, MARGIN + 46, truncate(doc.footerNote, CONTENT_WIDTH, 8.5), "F1", 8.5);
      }

      // The footer says who to trust and how to check. A document nobody
      // can verify is only a picture of a document.
      const footY = MARGIN + 6;
      c.line(MARGIN, footY + 26, MARGIN + CONTENT_WIDTH, footY + 26, 0.6, 0.85);
      if (doc.verifyUrl) {
        c.text(MARGIN, footY + 14, "Check this document is genuine:", "F1", 7.5);
        c.text(MARGIN, footY + 4, doc.verifyUrl, "F1", 7.5);
      }
      const mark = "Issued through AscendSME";
      c.text(
        PAGE_WIDTH - MARGIN - mark.length * 7.5 * HELVETICA_RATIO,
        footY + 4,
        mark,
        "F1",
        7.5
      );
    }

    if (pages.length > 1) {
      const label = `Page ${pageIndex + 1} of ${pages.length}`;
      c.text(
        PAGE_WIDTH - MARGIN - label.length * 7.5 * HELVETICA_RATIO,
        MARGIN - 12,
        label,
        "F1",
        7.5
      );
    }

    const body = c.toString();
    contentIds.push(pdf.add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`));
  });

  // Fonts, then the page tree. Object numbers are assigned in the order
  // they are added, and the page objects need to know the ids of both.
  const f1 = pdf.add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
  );
  const f2 = pdf.add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
  );
  const f3 = pdf.add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>"
  );

  let xobjects = "";
  if (doc.logo && logoInfo) {
    let raw = "";
    for (let i = 0; i < doc.logo.length; i += 1) raw += String.fromCharCode(doc.logo[i]);
    const space = logoInfo.components === 1 ? "/DeviceGray" : logoInfo.components === 4 ? "/DeviceCMYK" : "/DeviceRGB";
    const im = pdf.add(
      `<< /Type /XObject /Subtype /Image /Width ${logoInfo.width} /Height ${logoInfo.height} /ColorSpace ${space} ` +
        `/BitsPerComponent 8 /Filter /DCTDecode /Length ${doc.logo.length} >>\nstream\n${raw}\nendstream`
    );
    xobjects = ` /XObject << /Logo ${im} 0 R >>`;
  }

  const pageIds = contentIds.map((contentId) =>
    pdf.add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R >>${xobjects} >> ` +
        `/Contents ${contentId} 0 R >>`
    )
  );

  pdf.set(
    pagesId,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`
  );
  pdf.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  return pdf.build();
}

// The top of the first page, in the business's template. Returns where the
// party block starts.
function letterhead(
  c: Content,
  doc: PdfDocument,
  template: "classic" | "modern" | "compact",
  accent: [number, number, number] | null,
  logo: ReturnType<typeof jpegInfo>
): number {
  const title = TYPE_TITLE[doc.type] ?? doc.type.toUpperCase();
  const right = PAGE_WIDTH - MARGIN;
  const issued = dateLabel(doc.issuedAt);
  const due = dateLabel(doc.dueDate);
  const dates = [
    issued ? `Issued ${issued}` : null,
    due ? (doc.type === "purchase_order" ? `Deliver by ${due}` : `Due ${due}`) : null,
  ].filter((d): d is string => Boolean(d));
  const contact = [doc.businessPhone, doc.businessEmail].filter(Boolean).join("  ·  ");
  const tin = doc.tin ? `TIN ${doc.tin}` : "";

  // A logo fits a square, keeping its shape.
  const drawLogo = (x: number, top: number, box: number): number => {
    if (!logo) return 0;
    const scale = Math.min(box / logo.width, box / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    c.image("Logo", x, top - h, w, h);
    return w + 10;
  };

  let y = PAGE_HEIGHT - MARGIN;

  if (template === "modern") {
    // A band of the brand colour across the top, the name and the title
    // in white on it, and the contact line under it.
    const band = 104;
    const ink = accent ?? DEFAULT_ACCENT;
    c.rect(0, PAGE_HEIGHT - band, PAGE_WIDTH, band, ink);
    const top = PAGE_HEIGHT - 30;
    const shift = drawLogo(MARGIN, top + 4, 40);
    c.text(MARGIN + shift, top - 12, doc.businessName, "F2", 16, WHITE);
    if (doc.businessAddress) c.text(MARGIN + shift, top - 27, truncate(doc.businessAddress, 250, 9), "F1", 9, WHITE);
    rightText(c, right, top - 10, title, "F2", 16, WHITE);
    if (doc.number) rightText(c, right, top - 27, doc.number, "F2", 10, WHITE);
    y = PAGE_HEIGHT - band - 22;
    const line = [contact, tin].filter(Boolean).join("  ·  ");
    if (line) c.text(MARGIN, y, truncate(line, CONTENT_WIDTH * 0.6, 9), "F1", 9, GREY);
    dates.forEach((d, i) => rightText(c, right, y - i * 11, d, "F1", 9));
    return y - Math.max(1, dates.length) * 11 - 16;
  }

  if (template === "compact") {
    // One line: the title and number on the left, the business on the
    // right, a rule in the brand colour under both.
    rightText(c, right, y, doc.businessName, "F2", 11);
    c.text(MARGIN, y, title, "F2", 13, accent);
    if (doc.number) c.text(MARGIN + textWidth(title, "F2", 13) + 10, y, doc.number, "F3", 10);
    if (logo) drawLogo(right - textWidth(doc.businessName, "F2", 11) - 28, y + 12, 20);
    y -= 10;
    c.rule(MARGIN, y, right, 2, accent ?? [0.2, 0.2, 0.2]);
    y -= 14;
    const details = [doc.businessAddress, contact, tin].filter(Boolean).join("  ·  ");
    if (details) {
      c.text(MARGIN, y, truncate(details, CONTENT_WIDTH, 8.5), "F1", 8.5, GREY);
      y -= 11;
    }
    if (dates.length) {
      c.text(MARGIN, y, dates.join("  ·  "), "F1", 8.5);
      y -= 11;
    }
    return y - 14;
  }

  // Classic: the business on the left under its logo, the title in the
  // brand colour on the right.
  const shift = drawLogo(MARGIN, y + 6, 44);
  let ly = y;
  c.text(MARGIN + shift, ly, doc.businessName, "F2", 16);
  ly -= 15;
  for (const part of [doc.businessAddress, contact, tin]) {
    if (!part) continue;
    c.text(MARGIN + shift, ly, truncate(part, 260, 9), "F1", 9);
    ly -= 11;
  }
  if (logo) ly = Math.min(ly, y - 44);
  rightText(c, right, y, title, "F2", 14, accent);
  let ry = y - 16;
  if (doc.number) {
    c.right(right, ry, doc.number, "F3", 10);
    ry -= 12;
  }
  for (const d of dates) {
    rightText(c, right, ry, d, "F1", 9);
    ry -= 11;
  }
  return Math.min(ly, ry) - 18;
}

export function documentFilename(doc: PdfDocument): string {
  const base = (doc.number ?? doc.type).replace(/[^A-Za-z0-9-]+/g, "-");
  return `${base}.pdf`;
}
