// Relai d'image (les blobs Livelox n'ont pas de CORS) — GET /api/image?url=…
export const config = { path: "/api/image" };

export default async (req) => {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return new Response("url manquante", { status: 400 });
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Routechoice" } });
    if (!r.ok) return new Response("amont " + r.status, { status: 502 });
    const buf = await r.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "content-type": r.headers.get("content-type") || "image/png",
        "cache-control": "public, max-age=86400",
      },
    });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
};
