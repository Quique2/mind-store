// Piezas de interfaz compartidas por las páginas de administración.
export const NAV_CSS = `
.nav-admin { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; }
.nav-admin a { font-size:12px; font-weight:700; color:#fff; text-decoration:none; background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.35); border-radius:999px; padding:5px 12px; }
.nav-admin a:hover { background:rgba(255,255,255,.3); }
.nav-admin a.actual, .nav-admin a.actual:hover { background:#fff; color:#1C2260; }
`;

export function navAdmin(clave: string, actual: "panel" | "cuentas" | "eventos"): string {
  const q = `?clave=${encodeURIComponent(clave)}`;
  const enlaces: [typeof actual, string, string][] = [
    ["panel", "/admin", "📊 Panel"],
    ["cuentas", "/cuentas", "💰 Cuentas"],
    ["eventos", "/eventos", "🎟️ Eventos"],
  ];
  return `<nav class="nav-admin">${enlaces.map(([k, href, txt]) =>
    `<a href="${href}${q}"${k === actual ? ' class="actual"' : ""}>${txt}</a>`).join("")
  }<a href="/" target="_blank" rel="noopener">🛍️ Tienda ↗</a><a href="${LINKTREE}" target="_blank" rel="noopener">🔗 Linktree ↗</a></nav>`;
}

// pestañas de la sección Eventos: Eventos · Galería · Juntas (van al final del <header>)
export const TABS_CSS = `
.tabs { display:flex; gap:6px; flex-wrap:wrap; margin:18px -22px -28px; padding:0 22px; }
.tabs a { font-size:13px; font-weight:700; color:#fff; text-decoration:none; padding:9px 16px; border-radius:12px 12px 0 0; background:rgba(255,255,255,.14); }
.tabs a:hover { background:rgba(255,255,255,.28); }
.tabs a.actual, .tabs a.actual:hover { background:#F7F5EC; color:#1C2260; }
`;
export function tabsEventos(clave: string | null, actual: "eventos" | "galeria" | "juntas"): string {
  if (!clave) return "";   // vista pública (galería sin clave): sin pestañas privadas
  const q = `?clave=${encodeURIComponent(clave)}`;
  const t: [typeof actual, string, string][] = [
    ["eventos", "/eventos", "🎟️ Eventos"], ["galeria", "/galeria", "🖼️ Galería"], ["juntas", "/juntas", "📋 Juntas"],
  ];
  return `<div class="tabs">${t.map(([k, href, txt]) =>
    `<a href="${href}${q}"${k === actual ? ' class="actual"' : ""}>${txt}</a>`).join("")}</div>`;
}

// enlaces públicos de MIND (los mismos que usa la página de enlaces)
export const LINKTREE = "https://quique2.github.io/mind/";
export const INSTAGRAM = "https://instagram.com/mindmty";
export const WHATSAPP_GRUPO = "https://chat.whatsapp.com/JCP0jVXXtV7GHWBcrnv7wp";
