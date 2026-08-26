// Relai SPORTident Center (contourne le CORS sur les blobs event-files, S3/CloudFront).
//   GET /api/si?op=event&slug=<org>/<year>/<eventSlug>  -> JSON meta evenement (deja CORS-open
//     cote SPORTident, mais on le relaie quand meme pour n'avoir qu'un seul point d'acces)
//   GET /api/si?op=bin&guid=<guid>                       -> octets protobuf (r.1.latest.bin),
//     decompresses gzip automatiquement (fetch Node) ; le client parse le protobuf.
export const config = { path: "/api/si" };

const UA = "Routechoice";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const op = q.get("op");
  try {
    if (op === "event") {
      const slug = q.get("slug");
      if (!slug) return json({ error: "slug manquant" }, 400);
      const url =
        "https://center.sportident.com/api/rest/v1/public/events/slug/" +
        slug.split("/").map(encodeURIComponent).join("/");
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      const body = await r.text();
      return new Response(body, {
        status: r.status,
        headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" },
      });
    }
    if (op === "bin") {
      const guid = q.get("guid");
      if (!guid) return json({ error: "guid manquant" }, 400);
      const url = `https://center.sportident.com/event-files/${encodeURIComponent(guid)}/results/r.1.latest.bin`;
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (!r.ok) return json({ error: "HTTP " + r.status }, 502);
      const buf = await r.arrayBuffer(); // fetch decompresse deja le gzip eventuel
      return new Response(buf, {
        status: 200,
        headers: { "content-type": "application/octet-stream", "cache-control": "no-store", "access-control-allow-origin": "*" },
      });
    }
    return json({ error: "op invalide" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
};
