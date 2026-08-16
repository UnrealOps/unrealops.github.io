import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "dist");
const requiredFiles = [
  "index.html",
  "styles.css",
  "script.js",
  "assets/hero.jpg",
  "assets/hero-horizon.jpg",
  "assets/unrealops-logo-flat.png",
  "assets/island-tutorials.png",
  "assets/island-open-source.png",
  "assets/island-fab.png",
  "assets/island-video.png",
  "assets/game/player-idle.png",
  "assets/game/player-run.png",
  "assets/game/player-shoot.png",
  "assets/game/player-idle-clean.png",
  "assets/game/player-run-clean.png",
  "assets/game/player-shoot-clean.png",
  "assets/game/ghost-move.png",
  "assets/game/ghost-cast.png",
  "assets/game/ghost-move-clean.png",
  "assets/game/ghost-cast-clean.png",
  "assets/unrealops-banner.jpg",
  "assets/og.jpg",
  "assets/favicon.png",
];

const html = await readFile(join(root, "index.html"), "utf8");

for (const file of requiredFiles) {
  await readFile(join(root, file));
}

for (const requiredText of ["<title>", "<main", "name=\"description\"", "og:image"]) {
  if (!html.includes(requiredText)) {
    throw new Error(`index.html is missing required content: ${requiredText}`);
  }
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const entry of ["index.html", "styles.css", "script.js", "assets", "LICENSE"]) {
  await cp(join(root, entry), join(output, entry), { recursive: true });
}

await writeFile(join(output, ".nojekyll"), "");
console.log(`Built ${requiredFiles.length} verified site files in dist/`);
