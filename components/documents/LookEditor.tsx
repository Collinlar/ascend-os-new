"use client";

// How documents look (Modules R2), from the design's screen of the same
// name: the template, logo and colour, the details on the letterhead,
// numbering, default terms and signature areas, with the business's own
// documents previewed in the look as it changes. Saving applies it to
// documents sent from now on; anything already sent keeps its look.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/shell/icons";
import { primaryAction, secondaryAction } from "@/components/shell/Page";
import { Toast, useToast } from "@/components/shell/Toast";
import DocumentPreview, { lookAccent, type PreviewDocument, type Template } from "@/components/documents/DocumentPreview";
import type { LookData } from "@/lib/documents/look";

const KINDS = [
  { type: "invoice", label: "Invoices", standard: "INV" },
  { type: "quotation", label: "Quotations", standard: "QUO" },
  { type: "proforma", label: "Proformas", standard: "PRO" },
  { type: "receipt", label: "Receipts", standard: "RCP" },
  { type: "purchase_order", label: "Purchase orders", standard: "PO" },
  { type: "delivery_note", label: "Delivery notes", standard: "DN" },
  { type: "credit_note", label: "Credit notes", standard: "CRN" },
];

// The design's five colours. Each carries white text at 4.5:1 or better,
// which the Modern band needs.
const SWATCHES: Array<[string, string]> = [
  ["#006B62", "Ascend teal"],
  ["#0A0E1A", "Deep ink"],
  ["#6B2D5C", "Plum"],
  ["#9A3412", "Terracotta"],
  ["#1E3A8A", "Royal blue"],
];

const TEMPLATES: Array<[Template, string, string]> = [
  ["classic", "Classic", "Your name on the left, the title in your colour"],
  ["modern", "Modern", "A band of your colour across the top"],
  ["compact", "Compact", "One line at the top, more room for items"],
];

type SampleKind = "invoice" | "quotation" | "receipt" | "purchase_order" | "delivery_note" | "credit_note";
const SAMPLES: Array<[SampleKind, string, string]> = [
  ["invoice", "Invoice", "INVOICE"],
  ["quotation", "Quotation", "QUOTATION"],
  ["receipt", "Receipt", "RECEIPT"],
  ["purchase_order", "Purchase order", "PURCHASE ORDER"],
  ["delivery_note", "Delivery note", "DELIVERY NOTE"],
  ["credit_note", "Credit note", "CREDIT NOTE"],
];

const ACCRA = "Africa/Accra";
const day = (offset = 0) =>
  new Date(Date.now() + offset * 864e5).toLocaleDateString("en-GB", { timeZone: ACCRA, day: "numeric", month: "short", year: "numeric" });

export default function LookEditor({ data }: { data: LookData }) {
  const router = useRouter();
  const toast = useToast(4200);
  const L = data.look;
  const [template, setTemplate] = useState<Template>(L.template);
  const [accent, setAccent] = useState<string | null>(L.accentColour);
  const [logoUrl, setLogoUrl] = useState<string | null>(L.logoUrl);
  const [newLogo, setNewLogo] = useState<string | null>(null);
  const [name, setName] = useState(L.tradingName);
  const [address, setAddress] = useState(L.addressLine);
  const [phone, setPhone] = useState(L.phone);
  const [email, setEmail] = useState(L.email);
  const [tin, setTin] = useState(L.tin);
  const [footer, setFooter] = useState(L.footerNote);
  const [signatures, setSignatures] = useState(L.signatureAreas);
  const [prefixes, setPrefixes] = useState<Record<string, string>>(L.numberPrefixes);
  const [year, setYear] = useState(L.numberYear);
  const [sample, setSample] = useState<SampleKind>("invoice");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };

  // Without Documents Plus the saved Plus settings stay saved but are not
  // used: documents are Classic, no logo or colour, standard numbering.
  const locked = data.ready && !data.plus;
  const shownName = name.trim() || data.businessName;
  const shownAddress = address.trim() || data.place;
  const prefixOf = (type: string) => (locked ? "" : (prefixes[type] ?? "").trim().toUpperCase()) || KINDS.find((k) => k.type === type)!.standard;
  const numberOf = (type: string) => {
    const n = String(data.next[type] ?? 1).padStart(4, "0");
    return `${prefixOf(type)}-${year || locked ? `${new Date().getFullYear()}-` : ""}${n}`;
  };

  // A logo is turned into a JPEG on white here, at most 400px, so it is
  // small, prints the same everywhere, and the PDF can carry it as it is.
  async function pickLogo(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setError("Use a PNG or JPG for your logo.");
      return;
    }
    setError(null);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = url;
      });
      const scale = Math.min(1, 400 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const jpeg = canvas.toDataURL("image/jpeg", 0.88);
      setNewLogo(jpeg);
      setLogoUrl(jpeg);
      setDirty(true);
    } catch {
      setError("We could not read that picture. Try another PNG or JPG.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/documents/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: data.businessId,
          tradingName: name,
          addressLine: address,
          phone,
          email,
          footerNote: footer,
          // Without Documents Plus its settings are left as they are.
          ...(locked ? {} : { accentColour: accent ?? "" }),
          // The rest needs 0142; before it runs only the settings above save.
          ...(data.ready
            ? {
                tin,
                signatureAreas: signatures,
                ...(locked
                  ? {}
                  : {
                      template,
                      numberPrefixes: Object.fromEntries(KINDS.map((k) => [k.type, (prefixes[k.type] ?? "").trim().toUpperCase() === k.standard ? "" : (prefixes[k.type] ?? "")])),
                      numberYear: year,
                      ...(newLogo ? { logoBase64: newLogo.split(",")[1] } : {}),
                      ...(!logoUrl && L.logoUrl ? { removeLogo: true } : {}),
                    }),
              }
            : {}),
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(out.error ?? "That did not save. Check the details and tap again.");
        return;
      }
      if (out.logoUrl) setLogoUrl(out.logoUrl);
      setNewLogo(null);
      setDirty(false);
      toast.show("Saved. New documents use this look. Documents already sent keep the look they were sent with.");
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap again.");
    } finally {
      setBusy(false);
    }
  }

  const look = {
    template: locked ? ("classic" as Template) : template,
    accent: locked ? null : accent,
    logoUrl: locked ? null : logoUrl,
    name: shownName,
    address: shownAddress,
    phone: phone.trim(),
    email: email.trim(),
    tin: tin.trim().toUpperCase(),
    footer: footer.trim(),
    signatures,
  };
  const doc = sampleDoc(sample, data.sample, numberOf(sample === "credit_note" ? "credit_note" : sample));

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[372px_minmax(0,1fr)]">
      <div className="flex flex-col gap-3.5">
        {!data.ready && (
          <p className="rounded-panel bg-gold-100 px-4 py-3 text-[13px] font-semibold text-gold-700" role="status">
            Templates, logo, TIN and numbering switch on after this week&rsquo;s update. Name, address, colour and terms save now.
          </p>
        )}

        {locked && (
          <section className="flex flex-col gap-2 rounded-[18px] border border-gold bg-gold-tint px-4 py-3.5">
            <span className="text-[11px] font-bold uppercase tracking-eyebrow text-gold-ink">Documents Plus</span>
            <strong className="text-[14px] text-ink">Your logo and colour on every document</strong>
            <span className="text-[13px] leading-relaxed text-ink">
              The Modern and Compact templates, your logo, your colour and your own numbering come with Documents Plus
              {data.plusPrice ? `, GHS ${data.plusPrice.toLocaleString("en-GB")} for 12 months` : ""}. Your details, TIN, terms and signature areas stay free.
            </span>
            <Link href="/billing/get/documents_plus_12m" className={`${secondaryAction} min-h-[40px] self-start`}>
              Get Documents Plus
            </Link>
          </section>
        )}

        <Card>
          <H2>Template</H2>
          <div className="grid grid-cols-3 gap-2">
            {TEMPLATES.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => touch(setTemplate)(key)}
                disabled={locked && key !== "classic"}
                aria-pressed={(locked ? "classic" : template) === key}
                className={`tap flex flex-col items-center gap-1.5 rounded-[12px] border-2 p-2 disabled:opacity-50 ${(locked ? "classic" : template) === key ? "border-teal-700" : "border-neutral-200 hover:border-teal-brand"}`}
              >
                <Thumb template={key} accent={lookAccent({ template: key, accent }) ?? "#374151"} />
                <span className="text-[12.5px] font-bold text-ink">{label}</span>
              </button>
            ))}
          </div>
          <span className="text-xs text-neutral-600">{locked ? "Classic is free. Modern and Compact come with Documents Plus" : TEMPLATES.find((t) => t[0] === template)![2]}.</span>
        </Card>

        <Card>
          <H2>Logo and colour</H2>
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Your logo" width={48} height={48} className="h-12 w-12 flex-none rounded-[12px] border border-neutral-200 object-contain" />
            ) : (
              <span className="flex h-12 w-12 flex-none items-center justify-center rounded-[12px] border border-dashed border-neutral-300 text-neutral-500">
                <Icon name="plus" size={18} />
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <strong className="text-[13.5px] text-ink">{logoUrl ? (newLogo ? "New logo, not saved yet" : "Your logo") : "No logo yet"}</strong>
              <span className="text-xs text-neutral-600">A square PNG or JPG works best</span>
            </span>
            <label className={`${secondaryAction} min-h-[40px] cursor-pointer ${data.ready && !locked ? "" : "pointer-events-none opacity-50"}`} aria-disabled={locked || undefined}>
              {logoUrl ? "Replace" : "Add logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pickLogo(e.target.files?.[0])} />
            </label>
          </div>
          {logoUrl && (
            <button type="button" onClick={() => { setLogoUrl(null); setNewLogo(null); setDirty(true); }} className="tap self-start text-[12.5px] font-semibold text-teal-700">
              Remove the logo
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Brand colour">
            {SWATCHES.map(([c, label]) => (
              // @contrast-ignore a colour swatch; its name is the label
              <button
                key={c}
                type="button"
                onClick={() => touch(setAccent)(c)}
                disabled={locked}
                aria-label={label}
                aria-pressed={accent?.toUpperCase() === c}
                className="tap h-[34px] w-[34px] flex-none rounded-full disabled:opacity-40"
                style={{ background: c, boxShadow: accent?.toUpperCase() === c ? `0 0 0 3px #fff, 0 0 0 5px ${c}` : "none" }}
              />
            ))}
            <button
              type="button"
              onClick={() => touch(setAccent)(null)}
              aria-pressed={accent === null}
              className={`tap min-h-[34px] rounded-full border-[1.5px] px-3 text-[12.5px] font-semibold ${accent === null ? "border-teal-700 bg-teal-50 text-teal-800" : "border-neutral-200 text-neutral-700"}`}
            >
              No colour
            </button>
          </div>
          <span className="text-xs text-neutral-600">
            {accent ? SWATCHES.find(([c]) => c === accent.toUpperCase())?.[1] ?? `Your colour ${accent}` : "Black and grey, no brand colour"}
          </span>
        </Card>

        <Card>
          <H2>Business details on documents</H2>
          <Field label="Name on documents" value={name} onChange={touch(setName)} placeholder={data.businessName} />
          <Field label="Address" value={address} onChange={touch(setAddress)} placeholder={data.place || "14 Oxford Street, Osu, Accra"} />
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Phone" value={phone} onChange={touch(setPhone)} placeholder="030 296 1144" inputMode="tel" />
            <Field label="TIN" value={tin} onChange={(v) => touch(setTin)(v.toUpperCase())} placeholder="C0012345678" disabled={!data.ready} />
          </div>
          <Field label="Email" value={email} onChange={touch(setEmail)} placeholder="hello@yourbusiness.com" inputMode="email" />
          <span className="text-xs leading-relaxed text-neutral-600">
            Your TIN, or the Ghana Card number you use as one. Pay link and QR on invoices come with online payments.
          </span>
        </Card>

        <Card>
          <H2>Numbering</H2>
          <div className="flex flex-col">
            {KINDS.map((k) => (
              <div key={k.type} className="flex items-center justify-between gap-2 border-b border-neutral-100 py-1.5 text-[13px]">
                <span className="min-w-0 text-ink">{k.label}</span>
                <span className="flex items-center gap-2">
                  <input
                    value={prefixes[k.type] ?? ""}
                    onChange={(e) => touch(setPrefixes)({ ...prefixes, [k.type]: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) })}
                    placeholder={k.standard}
                    disabled={!data.ready || locked}
                    aria-label={`Prefix for ${k.label.toLowerCase()}`}
                    className="mono h-9 w-[72px] rounded-[9px] border border-neutral-200 px-2 text-center text-base uppercase text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none disabled:opacity-50 sm:text-[13px]"
                  />
                  <span className="mono min-w-[128px] whitespace-nowrap text-right text-[11.5px] text-neutral-600">next {numberOf(k.type)}</span>
                </span>
              </div>
            ))}
            <Switch on={year || locked} onFlip={() => touch(setYear)(!year)} title="Add the year" detail={year || locked ? `INV-${new Date().getFullYear()}-0001, starting again each January` : "INV-0001, counting on across the years"} disabled={!data.ready || locked} />
          </div>
          <span className="text-xs leading-relaxed text-neutral-600">
            Numbers never repeat or skip, so every document stays valid evidence. Changing a prefix keeps the count going.
          </span>
        </Card>

        <Card>
          <H2>Terms and signature</H2>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-600">Default terms on every document</span>
            <textarea
              rows={3}
              maxLength={300}
              value={footer}
              onChange={(e) => touch(setFooter)(e.target.value)}
              placeholder="Payment due by the date above. MoMo 024 000 0000, Adwoa Owusu."
              className="w-full resize-y rounded-control border border-neutral-200 px-3 py-2.5 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none sm:text-[13px]"
            />
          </label>
          <Switch on={signatures} onFlip={() => touch(setSignatures)(!signatures)} title="Signature areas" detail="On purchase orders and delivery notes, for both sides to sign" disabled={!data.ready} />
        </Card>

        {error && (
          <p role="alert" className="rounded-control bg-danger-tint px-3 py-2.5 text-[13px] font-semibold text-danger-ink">
            {error}
          </p>
        )}
        <button type="button" onClick={save} disabled={busy || !dirty} className={`${primaryAction} min-h-[46px] justify-center disabled:opacity-60`}>
          {busy ? "Saving the look..." : dirty ? "Save the look" : "Saved"}
        </button>
      </div>

      <div className="flex min-w-0 flex-col gap-3.5 lg:sticky lg:top-[88px]">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <span className="flex flex-col gap-0.5">
            <H2>{SAMPLES.find((s) => s[0] === sample)![2]} · how customers see it</H2>
            <span className="text-xs text-neutral-600">
              {sample === "receipt" ? "A4 when sent by WhatsApp or email. The till prints its own 80mm slip." : "Sent as a link and a PDF. Looks the same on a phone and on paper."}
            </span>
          </span>
          <a
            href={`/api/documents/sample?businessId=${data.businessId}&type=${sample}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${secondaryAction} min-h-[40px]`}
            title={dirty ? "The sample PDF uses the look as last saved" : undefined}
          >
            Download sample PDF
          </a>
        </div>
        {dirty && <span className="-mt-2 text-xs font-semibold text-gold-700">Save the look to see these changes in the sample PDF too.</span>}
        <div className="rounded-[22px] bg-[#e6ebea] p-3 sm:px-8 sm:py-7">
          <div className="mx-auto max-w-[640px]">
            <DocumentPreview look={look} doc={doc} size="lg" />
          </div>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-600">The same look on every document</span>
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
          {SAMPLES.map(([key, label, short]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSample(key)}
              aria-pressed={sample === key}
              className={`tap flex flex-col gap-1.5 rounded-[14px] border-2 bg-white p-2 ${sample === key ? "border-teal-700" : "border-transparent hover:border-neutral-200"}`}
            >
              <span className="flex h-[84px] flex-col overflow-hidden rounded-[6px] border border-[#eef0f2] bg-[#fafafa]">
                {template === "modern" && <span className="h-3.5 flex-none" style={{ background: lookAccent({ template, accent }) ?? "#007A6F" }} />}
                <span className="flex items-center justify-between px-1.5 pt-1.5">
                  <span className="h-3 w-3 rounded-[3px] bg-neutral-200" />
                  <span className="text-[7px] font-extrabold tracking-[0.05em]" style={{ color: template === "modern" ? "#4B5563" : lookAccent({ template, accent }) ?? "#121212" }}>
                    {short}
                  </span>
                </span>
                <span className="mx-1.5 mt-2 h-[3px] rounded bg-neutral-200" />
                <span className="mx-1.5 mt-1 h-[3px] rounded bg-neutral-200" />
                <span className="mx-1.5 mt-1 h-[3px] w-1/2 rounded bg-neutral-200" />
              </span>
              <span className="text-center text-[12px] font-bold text-ink">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <Toast message={toast.message} />
    </div>
  );
}

function sampleDoc(kind: SampleKind, lines: LookData["sample"], number: string): PreviewDocument {
  const rows = lines.map((l) => ({ d: l.description, q: l.quantity, u: kind === "delivery_note" ? 0 : l.unitPrice }));
  switch (kind) {
    case "quotation":
      return { title: "QUOTATION", number, partyLabel: "Prepared for", party: { name: "Ridgeview Suites", sub: "Attn. Dzifa Agbeko, HR" }, meta: [{ k: "Date", v: day() }, { k: "Valid until", v: day(14) }], lines: rows, prices: true };
    case "receipt":
      return { title: "RECEIPT", number, partyLabel: "Received from", party: { name: "Nana Ama Kyei", sub: "Osu counter" }, meta: [{ k: "Paid on", v: day() }, { k: "Paid with", v: "MTN MoMo" }], lines: rows, prices: true, totalLabel: "Total paid" };
    case "purchase_order":
      return { title: "PURCHASE ORDER", number, partyLabel: "Supplier", party: { name: "Kantanka Beauty Supply", sub: "North Industrial Area, Accra" }, meta: [{ k: "Ordered", v: day() }, { k: "Deliver by", v: day(5) }], lines: rows, prices: true, sign: ["Authorised by", "Received by supplier"] };
    case "delivery_note":
      return { title: "DELIVERY NOTE", number, partyLabel: "Deliver to", party: { name: "Glamour Boutique", sub: "Kojo Thompson Rd, Adabraka" }, meta: [{ k: "Dispatched", v: day() }, { k: "Against", v: "Order SH-1037" }], lines: rows.map((r) => ({ ...r, sub: "Check on arrival" })), prices: false, sign: ["Delivered by", "Received by customer"] };
    case "credit_note":
      return { title: "CREDIT NOTE", number, partyLabel: "Issued to", party: { name: "Glamour Boutique", sub: "Kojo Thompson Rd, Adabraka" }, meta: [{ k: "Date", v: day() }, { k: "Credit applied to", v: "An earlier invoice" }], lines: rows.slice(0, 1), prices: true, totalLabel: "Credit", reference: "Reason: two jars damaged in delivery" };
    default:
      return { title: "INVOICE", number, partyLabel: "Bill to", party: { name: "Efua Asamoah", sub: "024 555 0187" }, meta: [{ k: "Issued", v: day() }, { k: "Due", v: day(14) }], lines: rows, prices: true };
  }
}

function Thumb({ template, accent }: { template: Template; accent: string }) {
  return (
    <span className="flex h-[78px] w-full flex-col overflow-hidden rounded-[6px] border border-[#eef0f2] bg-white">
      <span style={{ height: template === "modern" ? 16 : 0, background: accent }} className="flex-none" />
      <span className="flex justify-between px-1.5 pt-1.5">
        <span className="h-2.5 rounded-[3px]" style={{ width: template === "compact" ? 22 : 14, background: template === "modern" ? "#e5e7eb" : accent }} />
        <span className="h-1.5 w-[26px] rounded-[2px]" style={{ background: template === "modern" ? "#d1d5db" : accent }} />
      </span>
      {template !== "modern" && <span className="mx-1.5 mt-1.5 flex-none" style={{ height: 2, background: accent }} />}
      <span className="mx-1.5 mt-1.5 h-1 rounded bg-neutral-200" />
      <span className="mx-1.5 mt-1 h-1 rounded bg-neutral-200" />
      <span className="mx-1.5 mt-1 h-1 w-3/5 rounded bg-neutral-200" />
    </span>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-3 rounded-panel border border-line-brand bg-white p-4 sm:p-[18px]">{children}</section>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-heading text-[16px] font-bold text-ink-heading">{children}</h2>;
}
function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  inputMode?: "tel" | "email";
  disabled?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold text-neutral-700">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        disabled={disabled}
        className="min-h-[44px] w-full rounded-control border border-neutral-200 px-3 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none disabled:opacity-50 sm:text-[13.5px]"
      />
    </label>
  );
}
function Switch({ on, onFlip, title, detail, disabled }: { on: boolean; onFlip: () => void; title: string; detail: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onFlip} disabled={disabled} className="tap flex min-h-[44px] items-center gap-3 py-1.5 text-left disabled:opacity-50">
      <span aria-hidden className={`flex h-[22px] w-[38px] flex-none items-center rounded-full p-0.5 ${on ? "justify-end bg-teal" : "justify-start bg-neutral-300"}`}>
        <span className="h-[18px] w-[18px] rounded-full bg-white shadow-sm" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[13.5px] font-semibold text-ink">{title}</span>
        <span className="text-xs text-neutral-600">{detail}</span>
      </span>
    </button>
  );
}
