// What a customer receives, drawn on screen in the business's look
// (Modules R2). The same three templates the PDF draws (lib/documents/pdf.ts),
// so what the owner sees here is what goes out.

export type Template = "classic" | "modern" | "compact";

export interface PreviewLook {
  template: Template;
  /** #RRGGBB, or null for none chosen. */
  accent: string | null;
  logoUrl: string | null;
  name: string;
  address: string;
  phone: string;
  email: string;
  tin: string;
  footer: string;
  signatures: boolean;
}

export interface PreviewDocument {
  title: string;
  number: string | null;
  partyLabel: string;
  party: { name: string; sub: string };
  meta: Array<{ k: string; v: string }>;
  lines: Array<{ d: string; sub?: string; q: number; u: number }>;
  prices: boolean;
  sign?: [string, string];
  note?: string;
  /** "Total paid" on a receipt, "Credit" on a credit note. */
  totalLabel?: string;
  reference?: string;
}

const amount = (n: number) => n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Without a chosen colour, Modern and Compact use the action teal; Classic
// stays in ink, as the PDF does.
export const lookAccent = (look: Pick<PreviewLook, "template" | "accent">) =>
  look.accent ?? (look.template === "classic" ? null : "#007A6F");

export default function DocumentPreview({ look, doc, size = "md" }: { look: PreviewLook; doc: PreviewDocument; size?: "md" | "lg" }) {
  const acc = lookAccent(look);
  const rule = acc ?? "#121212";
  const initials = look.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "A";
  const pad = size === "lg" ? "px-6 py-7 sm:px-10 sm:py-9" : "px-5 py-6 sm:px-7";
  const contact = [look.phone, look.email].filter(Boolean).join(" · ");
  const total = doc.lines.reduce((s, l) => s + l.q * l.u, 0);

  const Logo = ({ box }: { box: number }) =>
    look.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={look.logoUrl} alt="" width={box} height={box} className="flex-none rounded-[8px] object-contain" style={{ width: box, height: box }} />
    ) : (
      // @contrast-ignore the brand colour the business chose, white initials on it
      <span aria-hidden className="flex flex-none items-center justify-center rounded-[8px] font-heading font-extrabold text-white" style={{ width: box, height: box, fontSize: box * 0.32, background: acc ?? "#374151" }}>
        {initials}
      </span>
    );

  return (
    <div className="overflow-hidden rounded-[6px] bg-white text-[12px] text-ink shadow-[0_1px_3px_rgba(0,95,87,0.12)]">
      {look.template === "modern" && (
        // @contrast-ignore white on the business's chosen dark brand colour
        <div className={`flex items-center justify-between gap-4 text-white ${size === "lg" ? "px-6 py-7 sm:px-10" : "px-5 py-5 sm:px-7"}`} style={{ background: acc ?? "#007A6F" }}>
          <span className="flex min-w-0 items-center gap-3">
            {look.logoUrl && <Logo box={40} />}
            <span className="flex min-w-0 flex-col gap-0.5">
              <strong className="truncate font-heading text-[15px]">{look.name}</strong>
              {look.address && <span className="truncate text-[11px] opacity-90">{look.address}</span>}
            </span>
          </span>
          <span className="flex flex-none flex-col items-end gap-0.5">
            <span className="font-heading text-[15px] font-extrabold tracking-[0.05em] sm:text-[19px]">{doc.title}</span>
            <strong className="text-[11px]">{doc.number ?? "Numbered when sent"}</strong>
          </span>
        </div>
      )}
      <div className={`flex flex-col gap-4 ${pad}`}>
        {look.template === "classic" && (
          <div className="flex items-start justify-between gap-4">
            <span className="flex min-w-0 items-start gap-3">
              <Logo box={40} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <strong className="truncate font-heading text-[14px]">{look.name}</strong>
                {look.address && <span className="text-[11px] text-neutral-600">{look.address}</span>}
                {contact && <span className="text-[11px] text-neutral-600">{contact}</span>}
                {look.tin && <span className="text-[11px] text-neutral-600">TIN {look.tin}</span>}
              </span>
            </span>
            <span className="flex flex-none flex-col items-end gap-0.5">
              <span className="font-heading text-[15px] font-extrabold tracking-[0.05em] sm:text-[18px]" style={{ color: acc ?? "#121212" }}>
                {doc.title}
              </span>
              <span className="text-[11px] font-semibold text-neutral-700">{doc.number ?? "Numbered when sent"}</span>
            </span>
          </div>
        )}
        {look.template === "compact" && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-2.5" style={{ borderBottom: `2px solid ${rule}` }}>
            <span className="flex items-baseline gap-2.5">
              <span className="font-heading text-[14px] font-extrabold" style={{ color: acc ?? "#121212" }}>
                {doc.title}
              </span>
              <strong className="text-[11px]">{doc.number ?? "Numbered when sent"}</strong>
            </span>
            <span className="flex min-w-0 items-center gap-2">
              {look.logoUrl && <Logo box={20} />}
              <strong className="truncate">{look.name}</strong>
            </span>
          </div>
        )}
        {look.template !== "classic" && (contact || look.tin || (look.template === "compact" && look.address)) && (
          <span className="-mt-1 text-[11px] text-neutral-600">
            {[look.template === "compact" ? look.address : null, contact, look.tin ? `TIN ${look.tin}` : null].filter(Boolean).join(" · ")}
          </span>
        )}

        <div className="grid grid-cols-2 gap-3 rounded-[10px] bg-neutral-50 px-3.5 py-3 sm:grid-cols-3">
          <span className="col-span-2 flex min-w-0 flex-col gap-0.5 sm:col-span-1">
            <span className="text-[10.5px] text-neutral-600">{doc.partyLabel}</span>
            <strong className="truncate">{doc.party.name}</strong>
            {doc.party.sub && <span className="truncate text-[11px] text-neutral-600">{doc.party.sub}</span>}
          </span>
          {doc.meta.map((m) => (
            <span key={m.k} className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[10.5px] text-neutral-600">{m.k}</span>
              <strong className="truncate">{m.v}</strong>
            </span>
          ))}
        </div>
        {doc.reference && <span className="font-semibold text-neutral-700">{doc.reference}</span>}

        <table className="w-full border-collapse">
          <thead>
            <tr className="text-[10.5px] text-neutral-600">
              <th className="pb-1.5 text-left font-semibold" style={{ borderBottom: `1.5px solid ${rule}` }}>{doc.prices ? "DESCRIPTION" : "ITEM"}</th>
              <th className="pb-1.5 text-center font-semibold" style={{ borderBottom: `1.5px solid ${rule}` }}>{doc.prices ? "QTY" : "ORDERED"}</th>
              <th className="pb-1.5 text-right font-semibold" style={{ borderBottom: `1.5px solid ${rule}` }}>{doc.prices ? "AMOUNT" : "DELIVERED"}</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-4 text-center text-[11.5px] text-neutral-500">Items you add show here</td>
              </tr>
            ) : (
              doc.lines.map((l, i) => (
                <tr key={i}>
                  <td className="border-b border-[#EEF0F2] py-2 pr-2">
                    <span className="flex flex-col gap-px">
                      <span className="font-semibold">{l.d}</span>
                      {doc.prices ? <span className="num text-[10.5px] text-neutral-600">{amount(l.u)} each</span> : l.sub ? <span className="text-[10.5px] text-neutral-600">{l.sub}</span> : null}
                    </span>
                  </td>
                  <td className="num border-b border-[#EEF0F2] py-2 text-center">{l.q}</td>
                  <td className="num border-b border-[#EEF0F2] py-2 text-right">{doc.prices ? amount(l.q * l.u) : l.q}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            {doc.sign && look.signatures && (
              <div className="grid grid-cols-2 gap-4 pt-4">
                {doc.sign.map((s) => (
                  <span key={s} className="flex flex-col gap-1">
                    <span className="border-t border-neutral-400" />
                    <span className="text-[10.5px] text-neutral-600">{s}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          {doc.prices && (
            <div className="flex min-w-[150px] flex-col gap-1">
              <span className="flex justify-between gap-3 text-neutral-600">
                <span>Subtotal</span>
                <span className="num">{amount(total)}</span>
              </span>
              <span className="num flex justify-between gap-3 pt-1.5 font-heading text-[14px] font-extrabold" style={{ borderTop: `1.5px solid ${rule}` }}>
                <span>{doc.totalLabel ?? "Total"}</span>
                <span>GHS {amount(total)}</span>
              </span>
            </div>
          )}
        </div>

        {(doc.note?.trim() || look.footer) && (
          <span className="border-t border-[#EEF0F2] pt-2 text-[10.5px] leading-normal text-neutral-600">
            {[doc.note?.trim(), look.footer].filter(Boolean).join(" ")}
          </span>
        )}
      </div>
    </div>
  );
}
