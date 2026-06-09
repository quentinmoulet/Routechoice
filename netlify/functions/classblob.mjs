// Relai de l'API Livelox (contourne le CORS) — GET /api/classblob?classId=N
export const config = { path: "/api/classblob" };

export default async (req) => {
  const classId = new URL(req.url).searchParams.get("classId");
  if (!classId)
    return json({ error: "classId manquant" }, 400);
  try {
    const r = await fetch("https://www.livelox.com/Data/ClassBlob", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Routechoice",
      },
      body: JSON.stringify({
        classIds: [parseInt(classId, 10)],
        courseIds: null,
        includeMap: true,
        includeCourses: true,
      }),
    });
    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
};

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
