// npm run demo — ouvre le site public (accueil, d'où part le quiz) dans le
// navigateur par défaut. Aucun paramètre dans l'URL : le Mode Vidéo s'active
// tout seul si ce navigateur a été armé depuis /admin (cookie ct_vm) ET que
// la session Supabase est celle d'un admin (vérifié côté serveur).
// Ce script ne donne aucun accès, il ouvre juste un onglet.
// URL lue dans demo.config.json (clé "url"), surchargeable :
//   DEMO_URL=http://localhost:3000/ npm run demo
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let url = "https://www.coldtrend.com/";
try {
  const config = JSON.parse(readFileSync(path.join(__dirname, "..", "demo.config.json"), "utf8"));
  if (typeof config.url === "string" && config.url) url = config.url;
} catch {
  // Config absente ou illisible : accueil de production par défaut.
}
if (process.env.DEMO_URL) url = process.env.DEMO_URL;

if (!/^https?:[/][/]/.test(url)) {
  console.error(`URL invalide : ${url}`);
  process.exit(1);
}

const [cmd, args] =
  process.platform === "win32"
    ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin"
      ? ["open", [url]]
      : ["xdg-open", [url]];

spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
console.log(`Ouvert : ${url}`);
console.log("Mode Vidéo actif si ce navigateur est armé depuis /admin (bouton Mode Vidéo) avec un compte admin.");
console.log("Raccourcis : R réinitialiser · L ralenti x1,3");
