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

  text(x: number, y: number, value: string, font: "F1" | "F2" | "F3", size: number) {
    this.ops.push(
      `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfString(value)}) Tj ET`
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

  toString(): string {
    return this.ops.join("\n");
  }
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
      // Issuer, left. The business is the one selling; that is the whole
      // point of the seller line on Discover and it holds here too.
      c.text(MARGIN, y, doc.businessName, "F2", 16);
      y -= 15;
      if (doc.businessAddress) {
        c.text(MARGIN, y, truncate(doc.businessAddress, 260, 9), "F1", 9);
        y -= 11;
      }
      if (doc.businessPhone) {
        c.text(MARGIN, y, doc.businessPhone, "F1", 9);
        y -= 11;
      }

      // Document identity, right.
      const titleY = PAGE_HEIGHT - MARGIN;
      const title = TYPE_TITLE[doc.type] ?? doc.type.toUpperCase();
      const titleWidth = title.length * 14 * HELVETICA_RATIO;
      c.text(PAGE_WIDTH - MARGIN - titleWidth, titleY, title, "F2", 14);

      let ry = titleY - 16;
      if (doc.number) {
        c.right(PAGE_WIDTH - MARGIN, ry, doc.number, "F3", 10);
        ry -= 12;
      }
      const issued = dateLabel(doc.issuedAt);
      if (issued) {
        const label = `Issued ${issued}`;
        c.text(
          PAGE_WIDTH - MARGIN - label.length * 9 * HELVETICA_RATIO,
          ry,
          label,
          "F1",
          9
        );
        ry -= 11;
      }
      const due = dateLabel(doc.dueDate);
      if (due) {
        const label = `Due ${due}`;
        c.text(
          PAGE_WIDTH - MARGIN - label.length * 9 * HELVETICA_RATIO,
          ry,
          label,
          "F1",
          9
        );
        ry -= 11;
      }

      y = Math.min(y, ry) - 18;

      if (doc.customerName) {
        c.text(MARGIN, y, "Billed to", "F1", 8.5);
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

    // Column geometry. Amounts are right-aligned to these edges.
    const qtyRight = MARGIN + CONTENT_WIDTH * 0.6;
    const priceRight = MARGIN + CONTENT_WIDTH * 0.79;
    const totalRight = MARGIN + CONTENT_WIDTH;
    const descWidth = qtyRight - MARGIN - 60;

    c.text(MARGIN, y, "Description", "F2", 8.5);
    c.right(qtyRight, y, "Qty", "F3", 8.5);
    c.right(priceRight, y, "Price", "F3", 8.5);
    c.right(totalRight, y, `Amount ${doc.currencyCode}`, "F3", 8.5);
    y -= 6;
    c.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y, 0.8, 0.75);
    y -= 14;

    for (const line of linesOnPage) {
      c.text(MARGIN, y, truncate(line.description, descWidth, 9.5), "F1", 9.5);
      c.right(qtyRight, y, String(line.quantity), "F3", 9.5);
      c.right(priceRight, y, amount(line.unitPrice), "F3", 9.5);
      c.right(totalRight, y, amount(line.lineTotal), "F3", 9.5);
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

      totalRow("Subtotal", doc.subtotal);
      if ((doc.taxTotal ?? 0) !== 0) totalRow("Tax", doc.taxTotal);
      totalRow("Total", doc.total, true);

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

  const pageIds = contentIds.map((contentId) =>
    pdf.add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R >> >> ` +
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

export function documentFilename(doc: PdfDocument): string {
  const base = (doc.number ?? doc.type).replace(/[^A-Za-z0-9-]+/g, "-");
  return `${base}.pdf`;
}
