/* eslint-disable @next/next/no-img-element -- ImageResponse renders plain <img> tags, not next/image */
import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { qrPng } from "./qr";
import { ORG_NAME, type Region } from "../config";
import { NO_PHOTO_DATA_URL } from "../no-photo";

// ID card as a PNG (CR80 card shape, ~300 dpi). QR is always black on white with a quiet zone.
// Delegates get the card in their region's colour (green when the diocese has no region); the Working Committee gets the same layout in deep crimson and
// gold, with a gold "WORKING COMMITTEE" ribbon.
const W = 1012;
const H = 638;

const THEMES = {
  member: { header: "#1e6b45", headerText: "#ffffff", accent: "#e0561b", code: "#1e6b45", label: "DELEGATE", ribbon: null as string | null, bg: "#fffdf9" },
  staff: { header: "#7a1f2b", headerText: "#fff5dc", accent: "#b8860b", code: "#7a1f2b", label: "WORKING COMMITTEE", ribbon: "#d4a017", bg: "#fffaf0" },
};

// Drawn star (the card font has no ★ character).
const STAR =
  "data:image/svg+xml;base64," +
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6z" fill="#3b0d14"/></svg>`).toString("base64");

function band(gold = false) {
  const [a, b, c] = gold ? ["#d4a017", "#7a1f2b", "#b8860b"] : ["#f2a51f", "#e0561b", "#d7322b"];
  return (
    "data:image/svg+xml;base64," +
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="18"><defs><pattern id="p" width="36" height="18" patternUnits="userSpaceOnUse"><rect width="36" height="18" fill="${a}"/><path d="M0 9 L9 0 L18 9 L9 18 Z" fill="${b}"/><path d="M18 9 L27 0 L36 9 L27 18 Z" fill="${c}"/><path d="M6 9 L9 6 L12 9 L9 12 Z M24 9 L27 6 L30 9 L27 12 Z" fill="${a}"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`,
    ).toString("base64")
  );
}

export async function renderIdCard(o: {
  theme: "member" | "staff";
  name: string;
  highlight?: string | null; // position or committee
  lines: (string | null | undefined)[];
  code: string;
  qrToken: string;
  qrMask: number;
  photo?: { bytes: Uint8Array; mime: string } | null;
  region?: Region | null; // delegates only
  download?: boolean;
}) {
  const r = o.theme === "member" ? o.region : null;
  const t = r ? { ...THEMES.member, header: r.color, headerText: r.text, code: r.ink } : THEMES[o.theme];
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public/brand/logo-256.png"))).toString("base64")}`;
  const qr = await qrPng(o.qrToken, o.qrMask, 7);
  const photoUrl = o.photo ? `data:${o.photo.mime};base64,${Buffer.from(o.photo.bytes).toString("base64")}` : null;
  const stripe = band(o.theme === "staff");

  const image = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: t.bg, fontFamily: "sans-serif", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "18px 32px", background: t.header, color: t.headerText }}>
          <img src={logo} width={72} height={74} alt="" />
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontSize: 34, fontWeight: 700 }}>{ORG_NAME}</div>
            <div style={{ fontSize: 20, opacity: 0.9 }}>Youth Congress Management</div>
          </div>
          {t.ribbon ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: t.ribbon, color: "#3b0d14", fontSize: 22, fontWeight: 700, padding: "10px 18px", borderRadius: 8, letterSpacing: 2 }}>
              <img src={STAR} width={22} height={22} alt="" />
              STAFF
            </div>
          ) : null}
          {r ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#ffffff", color: r.ink, padding: "8px 16px", borderRadius: 8 }}>
              <div style={{ fontSize: 13, letterSpacing: 2, color: "#5e6a5f" }}>REGION</div>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>{r.key}</div>
            </div>
          ) : null}
        </div>
        <img src={stripe} width={W} height={18} alt="" />
        <div style={{ display: "flex", flex: 1, padding: "26px 32px", gap: 28, alignItems: "center" }}>
          <img
            src={photoUrl ?? NO_PHOTO_DATA_URL}
            width={210}
            height={250}
            style={{ objectFit: photoUrl ? "cover" : "contain", borderRadius: 12, border: `3px solid ${t.ribbon ?? "#e3d7c6"}`, background: t.bg }}
            alt=""
          />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 6 }}>
            <div style={{ fontSize: 22, color: t.ribbon ? t.header : "#5e6a5f", fontWeight: t.ribbon ? 700 : 400, letterSpacing: t.ribbon ? 2 : 0 }}>{t.label}</div>
            <div style={{ fontSize: 40, fontWeight: 700, color: "#1d2a21", lineHeight: 1.1 }}>{o.name}</div>
            {o.highlight ? <div style={{ fontSize: 22, color: t.accent, fontWeight: 700 }}>{o.highlight}</div> : null}
            {o.lines.filter(Boolean).map((l, i) => (
              <div key={i} style={{ fontSize: 20, color: "#5e6a5f" }}>
                {l}
              </div>
            ))}
            <div style={{ marginTop: 14, fontSize: 30, fontWeight: 700, color: t.code, letterSpacing: 1 }}>{o.code}</div>
          </div>
          <div style={{ display: "flex", background: "#ffffff", padding: 6, borderRadius: 10 }}>
            <img src={qr.url} width={qr.size} height={qr.size} alt="" />
          </div>
        </div>
        <img src={stripe} width={W} height={18} alt="" />
      </div>
    ),
    { width: W, height: H },
  );

  const headers = new Headers(image.headers);
  headers.set("cache-control", "private, no-store");
  if (o.download) headers.set("content-disposition", `attachment; filename="ID card ${o.code}.png"`);
  return new Response(image.body, { status: 200, headers });
}

// ---- Youth Congress 2026 delegate ID (portrait, region template from design/ID MSPC 2026) ----
// Templates already carry the artwork and labels; this fills in the name, values, QR and ID number.
const DW = 1252;
const DH = 1772;
// Per region: value text gradient (dark → light) and the name colour inside the coloured bar.
const REGION_INK: Record<string, { from: string; to: string; name: string }> = {
  DADITAMA: { from: "#1d236f", to: "#2362a5", name: "#ffffff" },
  CABUSTAMPRO: { from: "#034625", to: "#1f8a3a", name: "#ffffff" },
  DOPIM: { from: "#a83000", to: "#e8500a", name: "#ffffff" },
  ZAMBASULI: { from: "#8e0e0c", to: "#d63a33", name: "#ffffff" },
  KIDMACO: { from: "#7a4d00", to: "#b97f00", name: "#3b2700" },
};

const assetCache = new Map<string, Buffer>();
async function asset(rel: string) {
  let b = assetCache.get(rel);
  if (!b) {
    b = await readFile(join(process.cwd(), "assets", rel));
    assetCache.set(rel, b);
  }
  return b;
}

// Bigger text for short values, smaller for long ones, so everything fits its box.
const fit = (text: string, sizes: [number, number][]) => sizes.find(([max]) => text.length <= max)?.[1] ?? sizes[sizes.length - 1][1];

export async function renderDelegateCard(o: {
  region: string | null;
  name: string;
  memberNo: string;
  diocese: string;
  parishAssignment: string | null;
  dynamicGroup: string | null;
  communityImmersion: string | null;
  qrToken: string;
  qrMask: number;
  download?: boolean;
}) {
  const key = o.region && REGION_INK[o.region] ? o.region : "DADITAMA";
  const ink = REGION_INK[key];
  const [bg, medium, bold] = await Promise.all([asset(`id-templates/${key}.jpg`), asset("fonts/dm-sans-latin-500-normal.woff"), asset("fonts/dm-sans-latin-700-normal.woff")]);
  // Largest whole-pixel QR that fits beside the labels (about 2 cm when printed).
  const modules = (await qrPng(o.qrToken, o.qrMask, 1)).size;
  const qr = await qrPng(o.qrToken, o.qrMask, Math.max(4, Math.floor(222 / modules)));
  const dash = (v: string | null) => (v && v.trim() ? v.trim() : "-");
  const gradient = { backgroundImage: `linear-gradient(90deg, ${ink.from}, ${ink.to})`, backgroundClip: "text", color: "transparent" } as const;
  const parish = dash(o.parishAssignment);
  const immersion = dash(o.communityImmersion);

  const image = new ImageResponse(
    (
      <div style={{ width: DW, height: DH, display: "flex", position: "relative", fontFamily: "DM Sans" }}>
        <img src={`data:image/jpeg;base64,${bg.toString("base64")}`} width={DW} height={DH} style={{ position: "absolute", left: 0, top: 0 }} alt="" />
        {/* Name in the coloured bar */}
        <div style={{ position: "absolute", left: 175, top: 812, width: 922, height: 131, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", color: ink.name, fontWeight: 700, fontSize: fit(o.name, [[18, 70], [24, 60], [30, 50], [99, 42]]), letterSpacing: 1, textAlign: "center", lineHeight: 1.05 }}>{o.name}</div>
        </div>
        {/* Diocese */}
        <div style={{ position: "absolute", left: 174, top: 1068, width: 600, display: "flex" }}>
          <div style={{ display: "flex", ...gradient, fontWeight: 700, fontSize: fit(o.diocese, [[14, 64], [22, 56], [99, 48]]), lineHeight: 1.08, paddingBottom: 6 }}>{o.diocese}</div>
        </div>
        {/* Parish assignment */}
        <div style={{ position: "absolute", left: 174, top: 1248, width: 600, display: "flex" }}>
          <div style={{ display: "flex", ...gradient, fontWeight: 700, fontSize: fit(parish, [[16, 64], [30, 54], [99, 44]]), lineHeight: 1.08, paddingBottom: 6 }}>{parish}</div>
        </div>
        {/* QR code with the ID number under it */}
        <div style={{ position: "absolute", left: 1092 - qr.size, top: 1174 - qr.size, display: "flex" }}>
          <img src={qr.url} width={qr.size} height={qr.size} alt="" />
        </div>
        {/* ID number, small, no wider than the word DELEGATE above it */}
        <div style={{ position: "absolute", left: 0, top: 986, width: DW, display: "flex", justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: 17, fontWeight: 500, color: "#333333", letterSpacing: 0.5 }}>{o.memberNo}</div>
        </div>
        {/* Dynamic group */}
        <div style={{ position: "absolute", right: 1252 - 1078, top: 1206, width: 300, display: "flex", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", fontWeight: 700, fontSize: fit(dash(o.dynamicGroup), [[3, 66], [8, 54], [99, 40]]), color: "#111111", lineHeight: 1 }}>{dash(o.dynamicGroup)}</div>
        </div>
        {/* Community immersion */}
        <div style={{ position: "absolute", right: 1252 - 1078, top: 1324, width: 330, display: "flex", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", fontWeight: 700, fontSize: fit(immersion, [[12, 58], [22, 46], [99, 36]]), color: "#111111", lineHeight: 0.95, textAlign: "right" }}>{immersion}</div>
        </div>
      </div>
    ),
    {
      width: DW,
      height: DH,
      fonts: [
        { name: "DM Sans", data: medium, weight: 500, style: "normal" },
        { name: "DM Sans", data: bold, weight: 700, style: "normal" },
      ],
    },
  );

  const headers = new Headers(image.headers);
  headers.set("cache-control", "private, no-store");
  if (o.download) headers.set("content-disposition", `attachment; filename="ID ${o.memberNo}.png"`);
  return new Response(image.body, { status: 200, headers });
}

