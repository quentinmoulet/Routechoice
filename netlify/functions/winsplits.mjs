// Relai WinSplits Online (contourne le CORS + gère la session cookie ASP).
//   GET /api/ws?op=events&from=YYYY-MM-DD&to=YYYY-MM-DD
//   GET /api/ws?op=classes&id=<databaseId>
//   GET /api/ws?op=table&id=<databaseId>&cat=<categoryId>
// Renvoie le HTML brut de WinSplits (re-decode ISO-8859-1 -> UTF-8) ; le client parse.
export const config = { path: "/api/ws" };

const BASE = "https://obasen.orientering.se/winsplits/online/en/";
const UA = "Mozilla/5.0 (Routechoice WinSplits viewer)";

// dd/mm/yyyy attendu par WinSplits a partir d'un YYYY-MM-DD
const toWs = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

// Recupere le cookie de session + valide le test cookie (ct=true), sinon
// la recherche d'evenements renvoie une erreur serveur 500.
// Le cookie est mis en cache au niveau module (reutilise entre invocations
// "chaudes" -> evite le double aller-retour de handshake a chaque appel).
let CACHED = null;
async function session() {
  if (CACHED) return CACHED;
  const r = await fetch(BASE + "default.asp", { headers: { "User-Agent": UA }, redirect: "manual" });
  let raw = "";
  if (typeof r.headers.getSetCookie === "function") raw = (r.headers.getSetCookie()[0] || "");
  if (!raw) raw = r.headers.get("set-cookie") || "";
  const cookie = raw.split(";")[0];
  if (!cookie) throw new Error("session WinSplits indisponible");
  await fetch(BASE + "default.asp?ct=true", { headers: { "User-Agent": UA, Cookie: cookie } });
  CACHED = cookie;
  return cookie;
}

// Decode la reponse en ISO-8859-1 -> chaine UTF-8
async function readLatin1(res) {
  const buf = await res.arrayBuffer();
  return new TextDecoder("iso-8859-1").decode(buf);
}

async function searchEvents(cookie, from, to) {
  const body = new URLSearchParams({
    eventSelectionDateType: "interval",
    eventSelectionDateLast1: "1",
    eventSelectionDateLast2: "month",
    eventSelectionDateInterval1: toWs(from),
    eventSelectionDateInterval2: toWs(to || from),
    eventSelectionEventName: "",
    eventSelectionEventOrganiser: "",
    eventSelectionCountryCode: "ALL",
    eventSelectionEventClassificationInternational: "on",
    eventSelectionEventClassificationNational: "on",
    eventSelectionEventClassificationRegional: "on",
    eventSelectionEventClassificationLocal: "on",
    eventSelectionEventClassificationClub: "on",
    searchEvents: "Search events",
  });
  const r = await fetch(BASE + "events.asp", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return readLatin1(r);
}

async function getPage(cookie, path) {
  const r = await fetch(BASE + path, { headers: { "User-Agent": UA, Cookie: cookie } });
  return readLatin1(r);
}

async function run(op, q, cookie) {
  if (op === "events") return searchEvents(cookie, q.get("from"), q.get("to"));
  if (op === "classes") return getPage(cookie, "classes.asp?databaseId=" + encodeURIComponent(q.get("id")));
  if (op === "table")
    return getPage(
      cookie,
      "table.asp?databaseId=" + encodeURIComponent(q.get("id")) + "&categoryId=" + encodeURIComponent(q.get("cat"))
    );
  return null;
}
const stale = (h) => !h || /cookieError|internal server error/i.test(h);

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const op = q.get("op");
  if (!["events", "classes", "table"].includes(op))
    return new Response(JSON.stringify({ error: "op invalide" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  try {
    let html = await run(op, q, await session());
    if (stale(html)) {          // cookie expire -> nouvelle session, un essai
      CACHED = null;
      html = await run(op, q, await session());
    }
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    });
  }
};
