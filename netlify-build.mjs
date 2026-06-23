// Build Netlify partage entre deux sites branches sur CE meme depot.
//   - Site principal (Routechoice)  : aucune variable -> racine = index.html.
//   - Site Splits                   : variable d'env APP=splits (definie dans
//     le dashboard du 2e site) -> on genere un _redirects qui reecrit la
//     racine "/" vers "/splits.html" (l'app Splits s'ouvre donc a la racine).
// Le script ne doit JAMAIS faire echouer le build.
import { writeFileSync, rmSync } from "node:fs";

try {
  if ((process.env.APP || "").toLowerCase() === "splits") {
    // 200! = rewrite FORCE (l'URL reste "/"). Le "!" est indispensable : sans
    // lui Netlify sert index.html (qui existe a la racine) et ignore la regle.
    // /api/* et les autres chemins ne sont pas touches (matche la racine exacte).
    writeFileSync("_redirects", "/    /splits.html    200!\n");
    console.log("Build: site Splits — racine reecrite vers /splits.html");
  } else {
    try { rmSync("_redirects"); } catch {}
    console.log("Build: site principal Routechoice — racine = index.html");
  }
} catch (e) {
  console.warn("netlify-build: avertissement", String(e));
}
