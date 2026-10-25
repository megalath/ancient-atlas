import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";

const root = path.resolve(import.meta.dirname, "..");
const sitesDir = path.join(root, "sites");
const ajv = new Ajv({ allErrors: true, strict: false });
const siteSchema = JSON.parse(fs.readFileSync(path.join(root, "schema/site.schema.json"), "utf8"));
const featuresSchema = JSON.parse(fs.readFileSync(path.join(root, "schema/features.schema.json"), "utf8"));
const sourcesSchema = JSON.parse(fs.readFileSync(path.join(root, "schema/sources.schema.json"), "utf8"));
const validateSite = ajv.compile(siteSchema);
const validateFeatures = ajv.compile(featuresSchema);
const validateSources = ajv.compile(sourcesSchema);

const errors = [];
const OPEN_LICENSE = /CC |CC0|public domain/i;

function fail(message) {
  errors.push(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function schemaErrors(label, validate, data) {
  if (validate(data)) return;
  for (const issue of validate.errors ?? []) {
    fail(`${label} ${issue.instancePath || "/"} ${issue.message}`);
  }
}

function dmsToDegrees(parts) {
  if (!Array.isArray(parts) || parts.length < 3) return null;
  const [deg, arcmin, arcsec] = parts;
  if (![deg, arcmin, arcsec].every((part) => Number.isFinite(part))) return null;
  const sign = deg < 0 || arcmin < 0 || arcsec < 0 ? -1 : 1;
  return sign * (Math.abs(deg) + Math.abs(arcmin) / 60 + Math.abs(arcsec) / 3600);
}

function sentences(text) {
  return String(text)
    .split(/[.!?]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 20);
}

async function issueExists(number) {
  const response = await fetch(`https://api.github.com/repos/megalath/ancient-atlas/issues/${number}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "AncientAtlas-validate",
    },
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    const message = `could not confirm GitHub issue #${number} (HTTP ${response.status})`;
    if (process.env.CI || process.env.GITHUB_ACTIONS) fail(message);
    else console.warn(`warning: ${message}`);
    return true;
  }
  const body = await response.json();
  return !body.pull_request;
}

const ids = fs
  .readdirSync(sitesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(sitesDir, entry.name, "site.json")))
  .map((entry) => entry.name)
  .sort();

if (ids.length === 0) fail("sites/ has no site packages");

const issueChecks = [];

for (const id of ids) {
  const dir = path.join(sitesDir, id);
  const sitePath = path.join(dir, "site.json");
  const featuresPath = path.join(dir, "features.json");
  const sourcesPath = path.join(dir, "sources.json");
  for (const file of [featuresPath, sourcesPath]) {
    if (!fs.existsSync(file)) fail(`${id}: missing ${path.basename(file)}`);
  }
  if (!fs.existsSync(featuresPath) || !fs.existsSync(sourcesPath)) continue;

  const site = readJson(sitePath);
  const featuresFile = readJson(featuresPath);
  const sourcesFile = readJson(sourcesPath);
  schemaErrors(`${id} site.json`, validateSite, site);
  schemaErrors(`${id} features.json`, validateFeatures, featuresFile);
  schemaErrors(`${id} sources.json`, validateSources, sourcesFile);

  if (site.id !== id) fail(`${id}: site.json id "${site.id}" does not match the directory`);
  if (!Array.isArray(sourcesFile.sources) || sourcesFile.sources.length === 0) {
    fail(`${id}: sources.json needs at least one publication`);
  }

  const sourceIds = new Set((sourcesFile.sources ?? []).map((source) => source.id));
  const seenSources = new Set();
  for (const source of sourcesFile.sources ?? []) {
    if (seenSources.has(source.id)) fail(`${id}: duplicate source id ${source.id}`);
    seenSources.add(source.id);
    if (typeof source.url === "string" && !/^https?:\/\//.test(source.url)) {
      fail(`${id}: source ${source.id} url must be http(s)`);
    }
  }

  if (site.builder === "khufu") {
    const inch = site.frame?.inchToMetre;
    if (inch !== 0.0254) fail(`${id}: frame.inchToMetre must be 0.0254`);
    if (site.scale?.unit !== "m" || site.scale?.inchToMetre !== 0.0254) {
      fail(`${id}: scale must be metres, with inchToMetre 0.0254`);
    }
    const latitude = dmsToDegrees(site.site?.mast?.latDms);
    const longitude = dmsToDegrees(site.site?.mast?.lonDms);
    if (latitude === null || latitude < -90 || latitude > 90) fail(`${id}: mast latitude is missing or out of range`);
    if (longitude === null || longitude < -180 || longitude > 180) fail(`${id}: mast longitude is missing or out of range`);
    if (Math.abs(latitude) < 1 && Math.abs(longitude) < 1) fail(`${id}: mast coordinates still look like a placeholder`);
    for (const side of ["north", "south", "east", "west"]) {
      const azimuth = dmsToDegrees(site.angles?.coleAzimuth?.[side]);
      if (azimuth === null) fail(`${id}: angles.coleAzimuth.${side} is not a DMS triple`);
    }
  } else {
    const latitude = site.location?.latitude;
    const longitude = site.location?.longitude;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      fail(`${id}: location.latitude and location.longitude are required`);
    } else if (latitude === 0 && longitude === 0) {
      fail(`${id}: location 0,0 is a placeholder. Cite a real coordinate.`);
    }
    const west = site.orientation?.westOfNorthArcsec;
    if (!Number.isFinite(west) || Math.abs(west) > 180 * 3600) {
      fail(`${id}: orientation.westOfNorthArcsec must be a finite offset within half a turn`);
    }
    if (site.scale?.unit !== "m") fail(`${id}: scale.unit must be m`);
  }

  if (site.catalogIssue === null || site.catalogIssue === undefined) {
    if (site.builder !== "khufu") {
      fail(`${id}: catalogIssue must be the GitHub issue number for this monument (Khufu is the only site that may leave it null)`);
    }
  } else if (!Number.isInteger(site.catalogIssue) || site.catalogIssue < 1) {
    fail(`${id}: catalogIssue must be a positive integer or null`);
  } else {
    issueChecks.push(issueExists(site.catalogIssue).then((ok) => {
      if (!ok) fail(`${id}: GitHub issue #${site.catalogIssue} does not exist on megalath/ancient-atlas`);
    }));
  }

  if (site.measures && typeof site.measures === "object") {
    for (const [key, measure] of Object.entries(site.measures)) {
      if (!measure || typeof measure !== "object" || !("value" in measure)) continue;
      if (typeof measure.sourceId !== "string" || !sourceIds.has(measure.sourceId)) {
        fail(`${id}: measure ${key} needs a sourceId that exists in sources.json`);
      }
      if (measure.unit && !["m", "in", "mm", "deg", "arcmin", "arcsec", "count"].includes(measure.unit)) {
        fail(`${id}: measure ${key} has an unsupported unit ${measure.unit}`);
      }
    }
  }

  const seenFeatures = new Set();
  for (const feature of featuresFile.features ?? []) {
    const where = `${id}/${feature.id ?? "(missing id)"}`;
    if (seenFeatures.has(feature.id)) fail(`${where}: duplicate feature id`);
    seenFeatures.add(feature.id);
    if (sentences(feature.description).length < 2 || String(feature.description).length < 180) {
      fail(`${where}: description must be a few sentences (what it is, dimensions with citations, and what is known or debated)`);
    }
    const links = feature.links ?? [];
    if (!links.some((link) => /wikipedia\.org\/wiki\//.test(link.url ?? ""))) {
      fail(`${where}: needs a Wikipedia Read more link`);
    }
    if (!links.some((link) => link.sourceId || !/wikipedia\.org/.test(link.url ?? ""))) {
      fail(`${where}: needs a scholarly Read more link as well as Wikipedia`);
    }
    for (const link of links) {
      if (link.sourceId && !sourceIds.has(link.sourceId)) fail(`${where}: link sourceId ${link.sourceId} is not in sources.json`);
    }
    for (const fact of feature.facts ?? []) {
      if (!sourceIds.has(fact.sourceId)) fail(`${where}: fact ${fact.label} cites missing source ${fact.sourceId}`);
    }
    if (!Array.isArray(feature.images) || feature.images.length === 0) {
      fail(`${where}: needs at least one openly licensed picture`);
    }
    const seenImages = new Set();
    for (const image of feature.images ?? []) {
      if (seenImages.has(image.id)) fail(`${where}: duplicate image id ${image.id}`);
      seenImages.add(image.id);
      if (!OPEN_LICENSE.test(image.license ?? "") || /copyrighted free use/i.test(image.license ?? "")) {
        fail(`${where}: image ${image.id} must be CC, CC0, or public domain (not "copyrighted free use")`);
      }
      if (!image.author || !image.license || !image.page) {
        fail(`${where}: image ${image.id} needs author, license, and source page`);
      }
      if (typeof image.page === "string" && !image.page.includes("commons.wikimedia.org")) {
        fail(`${where}: image ${image.id} source page must be a Wikimedia Commons file page`);
      }
      if (typeof image.wikimediaUrl === "string" && !image.wikimediaUrl.startsWith("https://upload.wikimedia.org/")) {
        fail(`${where}: image ${image.id} wikimediaUrl must be an upload.wikimedia.org URL`);
      }
      if (!image.wikimediaUrl && !image.file) fail(`${where}: image ${image.id} needs a file or a wikimediaUrl`);
      if (typeof image.file === "string") {
        if (!image.file.startsWith(`/sites/${id}/images/`)) {
          fail(`${where}: image ${image.id} file must live under /sites/${id}/images/`);
        } else if (!fs.existsSync(path.join(root, "public", image.file))) {
          fail(`${where}: image file public${image.file} is missing`);
        }
      }
    }
    if (site.builder === "generic") {
      if (!Array.isArray(feature.geometry) || feature.geometry.length === 0) {
        fail(`${where}: generic sites put metre geometry in an array on the feature`);
      }
    } else if (!feature.geometry || feature.geometry.providedBy !== "builder") {
      fail(`${where}: Khufu geometry is computed by the builder. Set geometry.providedBy to "builder".`);
    }
  }
}

await Promise.all(issueChecks);

if (errors.length > 0) {
  console.error(`validate: ${errors.length} problem${errors.length === 1 ? "" : "s"}`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`validate: ${ids.length} site package${ids.length === 1 ? "" : "s"} ok (${ids.join(", ")})`);
