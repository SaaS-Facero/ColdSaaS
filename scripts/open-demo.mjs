// npm run demo — ouvre le Mode Vidéo (/demo) dans le navigateur par défaut.
// URL lue dans demo.config.json (clé "url"), surchargeable :
//   DEMO_URL=http://localhost:3000/demo npm run demo
// La page elle-même vérifie côté serveur que la session est admin :
// ce script ne fait qu'ouvrir un onglet, il ne donne aucun accès.
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let url = "https://www.coldtrend.com/demo";
try {
  const config = JSON.parse(readFileSync(path.join(__dirname, "..", "demo.config.json"), "utf8"));
  if (typeof config.url === "string" && config.url) url = config.url;
} catch {
  // Config absente ou illisible : URL de production par défaut.
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
console.log(`Mode Vidéo ouvert : ${url}`);
console.log("Raccourcis : R relancer · L ralenti x1,3 · F plein écran");
