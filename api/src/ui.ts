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

// enlaces públicos de MIND (los mismos que usa la página de enlaces)
export const LINKTREE = "https://quique2.github.io/mind/";
export const INSTAGRAM = "https://instagram.com/mindmty";
export const WHATSAPP_GRUPO = "https://chat.whatsapp.com/JCP0jVXXtV7GHWBcrnv7wp";
