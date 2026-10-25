import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const id = process.argv[2];
if (!id || process.argv.length > 3) {
  console.error("Usage: npm run new-site -- <site-id>");
  console.error("Example: npm run new-site -- menkaure");
  process.exit(1);
}
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
  console.error("The site id must be lowercase words separated by hyphens, such as menkaure or bent-pyramid.");
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "sites", id);
if (fs.existsSync(dir)) {
  console.error(`sites/${id} already exists.`);
  process.exit(1);
}

fs.mkdirSync(path.join(root, "public", "sites", id, "images"), { recursive: true });
fs.writeFileSync(path.join(root, "public", "sites", id, "images", ".gitkeep"), "");

const site = {
  schemaVersion: 1,
  id,
  name: "Untitled site",
  builder: "generic",
  wikipedia: "",
  catalogIssue: null,
  location: { latitude: 0, longitude: 0 },
  orientation: { westOfNorthArcsec: 0 },
  scale: { unit: "m" },
  metadata: { culture: "", period: "", monument: "", ruler: "" },
};

const features = {
  schemaVersion: 1,
  features: [
    {
      id: "shell",
      name: "Shell",
      group: "Exterior",
      layer: "casing",
      accuracy: "schematic",
      schematic: true,
      material: "casing",
      description: "Replace this placeholder with a few sentences.",
      links: [],
      images: [],
      geometry: [{ kind: "pyramid", base: 10, height: 6 }],
    },
  ],
};

const sources = { schemaVersion: 1, sources: [] };

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "site.json"), `${JSON.stringify(site, null, 2)}\n`);
fs.writeFileSync(path.join(dir, "features.json"), `${JSON.stringify(features, null, 2)}\n`);
fs.writeFileSync(path.join(dir, "sources.json"), `${JSON.stringify(sources, null, 2)}\n`);

const registry = spawnSync(process.execPath, [path.join(root, "scripts/generate-registry.mjs")], { stdio: "inherit" });
if (registry.status !== 0) process.exit(registry.status ?? 1);

console.log(`Created sites/${id}. It does not validate yet. Fill it in, then run npm run validate.`);
console.log("See CONTRIBUTING.md and docs/DATA_FORMAT.md.");
