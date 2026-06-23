#!/usr/bin/env python3
"""
Routechoice — petit serveur local.

Lance l'appli ET relaie les requêtes Livelox (bloquées par CORS depuis un
navigateur) pour permettre le chargement automatique depuis un simple lien.

Usage :
    python server.py
puis ouvrir http://localhost:8765/  dans le navigateur.

Endpoints proxy :
    GET /api/classblob?classId=1177812   -> JSON Livelox (carte + postes + échelle)
    GET /api/image?url=<URL encodée>      -> octets de l'image carte
"""
import http.server, socketserver, urllib.request, urllib.parse, json, os, uuid

SHARE_DIR = None  # défini sous __main__
_WS = {"opener": None}  # cache de la session WinSplits (cookie ASP)


class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

PORT = 8765
DIR = os.path.dirname(os.path.abspath(__file__))
UA = "Mozilla/5.0 (Routechoice)"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=DIR, **k)

    def log_message(self, *a):  # silencieux
        pass

    def _send(self, code, body, ctype):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/api/classblob":
            return self._class_blob(urllib.parse.parse_qs(u.query))
        if u.path == "/api/image":
            return self._image(urllib.parse.parse_qs(u.query))
        if u.path == "/api/ws":
            return self._winsplits(urllib.parse.parse_qs(u.query))
        if u.path == "/api/share":
            sid = (urllib.parse.parse_qs(u.query).get("id") or [""])[0]
            fp = os.path.join(SHARE_DIR, os.path.basename(sid) + ".json")
            if sid and os.path.exists(fp):
                with open(fp, "rb") as f:
                    return self._send(200, f.read(), "application/json")
            return self._send(404, '{"error":"partage introuvable"}', "application/json")
        # sinon : fichiers statiques (index.html, etc.)
        return super().do_GET()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/api/share":
            try:
                ln = int(self.headers.get("Content-Length", "0"))
                data = self.rfile.read(ln)
                os.makedirs(SHARE_DIR, exist_ok=True)
                sid = uuid.uuid4().hex[:10]
                with open(os.path.join(SHARE_DIR, sid + ".json"), "wb") as f:
                    f.write(data)
                return self._send(200, json.dumps({"id": sid}), "application/json")
            except Exception as e:
                return self._send(502, json.dumps({"error": str(e)}), "application/json")
        return self._send(404, "not found", "text/plain")

    def _class_blob(self, qs):
        cid = (qs.get("classId") or [None])[0]
        if not cid:
            return self._send(400, '{"error":"classId manquant"}', "application/json")
        try:
            body = json.dumps({
                "classIds": [int(cid)],
                "courseIds": None,
                "includeMap": True,
                "includeCourses": True,
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://www.livelox.com/Data/ClassBlob",
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Requested-With": "XMLHttpRequest",
                    "User-Agent": UA,
                },
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                return self._send(200, r.read(), "application/json")
        except Exception as e:
            return self._send(502, json.dumps({"error": str(e)}), "application/json")

    def _winsplits(self, qs):
        # Relai WinSplits Online : session cookie ASP + recherche/affichage.
        op = (qs.get("op") or [""])[0]
        if op not in ("events", "classes", "table"):
            return self._send(400, '{"error":"op invalide"}', "application/json")
        try:
            html = self._ws_run(op, qs)
            if (not html) or ("cookieError" in html) or ("internal server error" in html.lower()):
                _WS["opener"] = None  # cookie expire -> nouvelle session, un essai
                html = self._ws_run(op, qs)
            return self._send(200, html, "text/html; charset=utf-8")
        except Exception as e:
            return self._send(502, json.dumps({"error": str(e)}), "application/json")

    def _ws_session(self):
        # Opener avec cookie de session, mis en cache (handshake une seule fois).
        if _WS.get("opener"):
            return _WS["opener"]
        import http.cookiejar
        base = "https://obasen.orientering.se/winsplits/online/en/"
        cj = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
        hdr = {"User-Agent": UA}
        opener.open(urllib.request.Request(base + "default.asp", headers=hdr), timeout=30).read()
        opener.open(urllib.request.Request(base + "default.asp?ct=true", headers=hdr), timeout=30).read()
        _WS["opener"] = opener
        return opener

    def _ws_run(self, op, qs):
        import re
        base = "https://obasen.orientering.se/winsplits/online/en/"
        hdr = {"User-Agent": UA}
        opener = self._ws_session()

        def iso2ws(iso):
            m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", iso or "")
            return "%s/%s/%s" % (m.group(3), m.group(2), m.group(1)) if m else ""

        if op == "events":
            frm = (qs.get("from") or [""])[0]
            to = (qs.get("to") or [frm])[0]
            form = urllib.parse.urlencode({
                "eventSelectionDateType": "interval",
                "eventSelectionDateLast1": "1",
                "eventSelectionDateLast2": "month",
                "eventSelectionDateInterval1": iso2ws(frm),
                "eventSelectionDateInterval2": iso2ws(to),
                "eventSelectionEventName": "",
                "eventSelectionEventOrganiser": "",
                "eventSelectionCountryCode": "ALL",
                "eventSelectionEventClassificationInternational": "on",
                "eventSelectionEventClassificationNational": "on",
                "eventSelectionEventClassificationRegional": "on",
                "eventSelectionEventClassificationLocal": "on",
                "eventSelectionEventClassificationClub": "on",
                "searchEvents": "Search events",
            }).encode("ascii")
            req = urllib.request.Request(base + "events.asp", data=form, headers=hdr)
        elif op == "classes":
            cid = (qs.get("id") or [""])[0]
            req = urllib.request.Request(base + "classes.asp?databaseId=" + urllib.parse.quote(cid), headers=hdr)
        else:  # table
            cid = (qs.get("id") or [""])[0]
            cat = (qs.get("cat") or [""])[0]
            req = urllib.request.Request(
                base + "table.asp?databaseId=" + urllib.parse.quote(cid) + "&categoryId=" + urllib.parse.quote(cat),
                headers=hdr)

        return opener.open(req, timeout=60).read().decode("iso-8859-1")

    def _image(self, qs):
        url = (qs.get("url") or [None])[0]
        if not url:
            return self._send(400, "url manquante", "text/plain")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
                ct = r.headers.get("Content-Type", "image/png")
            return self._send(200, data, ct)
        except Exception as e:
            return self._send(502, str(e), "text/plain")


if __name__ == "__main__":
    SHARE_DIR = os.path.join(DIR, "shares")
    with ThreadingServer(("", PORT), Handler) as httpd:
        print("Routechoice  ->  http://localhost:%d/" % PORT)
        print("(Ctrl+C pour arreter)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
