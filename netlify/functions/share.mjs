// Partage d'événement — POST /api/share (sauve l'état, renvoie {id}) ; GET ?id= (relit)
// Stockage via Netlify Blobs (gratuit, persistant, zéro config sur Netlify).
import { getStore } from "@netlify/blobs";

export const config = { path: "/api/share" };

export default async (req) => {
  const store = getStore("shares");
  if (req.method === "POST") {
    const body = await req.text();
    if (body.length > 9_000_000) return json({ error: "trop volumineux" }, 413);
    const id = Math.random().toString(36).slice(2, 12);
    await store.set(id, body);
    return json({ id });
  }
  const id = new URL(req.url).searchParams.get("id");
  const data = id ? await store.get(id) : null;
  if (!data) return json({ error: "partage introuvable" }, 404);
  return new Response(data, { headers: { "content-type": "application/json" } });
};

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
