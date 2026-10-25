import featureDocs from "../../sites/khufu/features.json";
import siteFile from "../../sites/khufu/site.json";
import sourceFile from "../../sites/khufu/sources.json";

type MeasureKey = keyof typeof siteFile.measures;

export type AtlasLink = {
  label: string;
  url: string;
  sourceId?: string;
};

export type Media = {
  id: string;
  featureIds: string[];
  title: string;
  url: string;
  page: string;
  author: string;
  license: string;
  licenseUrl?: string;
  file?: string;
};

const docs = new Map(featureDocs.features.map((feature) => [feature.id, feature]));

export const dataset = {
  ...siteFile,
  sources: sourceFile.sources,
  media: featureDocs.features.flatMap((feature) =>
    feature.images.map((image) => ({
      id: `${feature.id}-${image.id}`,
      featureIds: [feature.id],
      title: image.title,
      url: image.wikimediaUrl,
      page: image.page,
      author: image.author,
      license: image.license,
      licenseUrl: image.licenseUrl,
    })),
  ),
  summaries: Object.fromEntries(featureDocs.features.map((feature) => [feature.id, feature.description])) as Record<
    string,
    string
  >,
};

export type Vec3 = { x: number; y: number; z: number };

export type Accuracy = "surveyed" | "reconstructed" | "projected" | "schematic";

export type MaterialId =
  | "casing"
  | "core"
  | "passage"
  | "granite"
  | "bedrock"
  | "shaft"
  | "void"
  | "forced"
  | "chevron";

export type Shape =
  | { kind: "pyramid"; base: number; height: number }
  | {
      kind: "stepped";
      base: number;
      height: number;
      apexHeight: number;
      steps: number;
    }
  | { kind: "slab"; y: number; half: number; thickness: number }
  | {
      kind: "remnant";
      length: number;
      height: number;
      base: number;
      pyramidHeight: number;
    }
  | { kind: "axis"; from: Vec3; to: Vec3; width: number; height: number; align?: "floor" | "center" }
  | { kind: "aabb"; min: Vec3; max: Vec3 }
  | {
      kind: "gable";
      centerX: number;
      centerZ: number;
      floorY: number;
      sizeX: number;
      sizeZ: number;
      wall: number;
      ridge: number;
    }
  | {
      kind: "corbel";
      from: Vec3;
      to: Vec3;
      floorWidth: number;
      topWidth: number;
      verticalHeight: number;
      rampVertical: number;
      laps: number;
    };

export type Fact = {
  label: string;
  value: string;
  sourceId: string;
  locator?: string;
};

export type BuiltFeature = {
  id: string;
  name: string;
  group: "Exterior" | "Passages" | "Chambers" | "Shafts" | "Voids" | "Intrusions";
  layer: "casing" | "core" | "interior";
  accuracy: Accuracy;
  schematic: boolean;
  material: MaterialId;
  summary: string;
  description: string;
  links: AtlasLink[];
  facts: Fact[];
  images: Media[];
  sourceIds: string[];
  shapes: Shape[];
  meta: Record<string, number>;
};

export type SceneModel = {
  baseM: number;
  heightM: number;
  currentHeightM: number;
  orientationWestArcsec: number;
  entrance: Vec3;
  features: BuiltFeature[];
};

export type PyramidModel = {
  baseM: number;
  heightM: number;
  faceAngleDeg: number;
  sekedAngleDeg: number;
  orientationWestArcsec: number;
  coreBaseM: number;
  currentHeightM: number;
  site: {
    latitude: number;
    longitude: number;
    mastLatitude: number;
    mastLongitude: number;
  };
  entrance: Vec3;
  descendingEnd: Vec3;
  junction: Vec3;
  ascendingEnd: Vec3;
  gallerySouth: Vec3;
  features: BuiltFeature[];
};

const IN = siteFile.frame.inchToMetre;

function measure(id: MeasureKey) {
  return siteFile.measures[id];
}

function mv(id: MeasureKey): number {
  return measure(id).value;
}

function uncertainty(id: MeasureKey): number {
  const row = measure(id) as { uncertainty?: number };
  return row.uncertainty ?? 0;
}

function inches(id: MeasureKey): number {
  return mv(id) * IN;
}

export function dmsToDegrees(angle: { deg: number; arcmin: number; arcsec: number }): number {
  const sign = angle.deg < 0 || angle.arcmin < 0 || angle.arcsec < 0 ? -1 : 1;
  return sign * (Math.abs(angle.deg) + Math.abs(angle.arcmin) / 60 + Math.abs(angle.arcsec) / 3600);
}

export function partsToDegrees(parts: readonly number[]): number {
  const [d, m, s] = parts;
  const sign = d < 0 ? -1 : 1;
  return sign * (Math.abs(d) + m / 60 + s / 3600);
}

const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);

/** Move a WGS84 point by a local north/east offset in metres. */
export function moveMetres(latDeg: number, lonDeg: number, northM: number, eastM: number) {
  const lat = (latDeg * Math.PI) / 180;
  const sin = Math.sin(lat);
  const denom = 1 - WGS84_E2 * sin * sin;
  const meridional = (WGS84_A * (1 - WGS84_E2)) / Math.pow(denom, 1.5);
  const prime = WGS84_A / Math.sqrt(denom);
  return {
    lat: latDeg + (northM / meridional) * (180 / Math.PI),
    lon: lonDeg + (eastM / (prime * Math.cos(lat))) * (180 / Math.PI),
  };
}

/** Yaw applied to the pyramid so its north face points west of true north. */
export function trueNorthRadians(westOfNorthArcsec: number): number {
  return -(westOfNorthArcsec * Math.PI) / (180 * 3600);
}

export function applyTrueNorth(point: Vec3, westOfNorthArcsec: number): Vec3 {
  const theta = trueNorthRadians(westOfNorthArcsec);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    x: point.x * c + point.z * s,
    y: point.y,
    z: -point.x * s + point.z * c,
  };
}

/**
 * World-space clip plane that keeps the west side of a pyramid-frame X value.
 * Three.js discards points whose signed distance is negative.
 */
export function sectionPlane(
  keepWestOfX: number,
  westOfNorthArcsec: number,
): { normal: Vec3; constant: number } {
  const theta = trueNorthRadians(westOfNorthArcsec);
  return {
    normal: { x: -Math.cos(theta), y: 0, z: Math.sin(theta) },
    constant: keepWestOfX,
  };
}

export function signedDistance(point: Vec3, plane: { normal: Vec3; constant: number }): number {
  return plane.normal.x * point.x + plane.normal.y * point.y + plane.normal.z * point.z + plane.constant;
}

export function casingHalfWidth(y: number, base: number, height: number): number {
  if (y >= height) return 0;
  return (base / 2) * (1 - y / height);
}

export function insideOriginalPyramid(point: Vec3, base: number, height: number): boolean {
  if (point.y < -0.02 || point.y > height + 0.02) return false;
  const half = casingHalfWidth(Math.max(0, point.y), base, height);
  return Math.abs(point.x) <= half + 0.02 && Math.abs(point.z) <= half + 0.02;
}

function v(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return v(a.x + b.x, a.y + b.y, a.z + b.z);
}

function scale(a: Vec3, s: number): Vec3 {
  return v(a.x * s, a.y * s, a.z * s);
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return v(a.x - b.x, a.y - b.y, a.z - b.z);
}

function dist(a: Vec3, b: Vec3): number {
  const d = sub(a, b);
  return Math.hypot(d.x, d.y, d.z);
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return add(a, scale(sub(b, a), t));
}

function metres(n: number, digits = 2): string {
  return `${n.toFixed(digits)} m`;
}

function fact(label: string, value: string, id: MeasureKey): Fact {
  const row = measure(id);
  return { label, value, sourceId: row.sourceId, locator: row.locator };
}

function angleFact(
  label: string,
  angle: { deg: number; arcmin: number; arcsec: number; sourceId: string; locator?: string },
): Fact {
  return {
    label,
    value: formatDms(dmsToDegrees(angle)),
    sourceId: angle.sourceId,
    locator: angle.locator,
  };
}

export function formatArcsec(arcsec: number): string {
  const sign = arcsec < 0 ? "−" : "";
  const abs = Math.abs(arcsec);
  const minutes = Math.floor(abs / 60);
  const seconds = abs - minutes * 60;
  const text =
    Math.abs(seconds - Math.round(seconds)) < 1e-6
      ? String(Math.round(seconds)).padStart(2, "0")
      : seconds.toFixed(2).padStart(5, "0");
  return `${sign}${minutes}′${text}″`;
}

export function formatDms(degrees: number): string {
  const sign = degrees < 0 ? "−" : "";
  let rest = Math.abs(degrees);
  let d = Math.floor(rest);
  rest = (rest - d) * 60;
  let m = Math.floor(rest + 1e-8);
  let s = Math.round((rest - m) * 60);
  if (s === 60) {
    s = 0;
    m += 1;
  }
  if (m === 60) {
    m = 0;
    d += 1;
  }
  return `${sign}${d}°${String(m).padStart(2, "0")}′${String(s).padStart(2, "0")}″`;
}

function imagesFor(id: string): Media[] {
  const doc = docs.get(id);
  if (!doc) return [];
  return doc.images.map((image) => ({
    id: image.id,
    featureIds: [id],
    title: image.title,
    url: image.file,
    page: image.page,
    author: image.author,
    license: image.license,
    licenseUrl: image.licenseUrl,
    file: image.file,
  }));
}

function feature(input: Omit<BuiltFeature, "images" | "sourceIds" | "summary" | "description" | "links"> & { summary?: string }): BuiltFeature {
  const doc = docs.get(input.id);
  const description = doc?.description ?? input.summary ?? dataset.summaries[input.id] ?? input.name;
  const links = (doc?.links ?? []).map((link) => ({
    label: link.label,
    url: link.url,
    sourceId: "sourceId" in link ? link.sourceId : undefined,
  }));
  const sourceIds = Array.from(
    new Set([...input.facts.map((item) => item.sourceId), ...links.flatMap((link) => (link.sourceId ? [link.sourceId] : []))]),
  );
  return {
    ...input,
    name: doc?.name ?? input.name,
    summary: description,
    description,
    images: imagesFor(input.id),
    links,
    sourceIds,
  };
}

function coleMeanBase(): number {
  return (mv("cole.north.m") + mv("cole.south.m") + mv("cole.east.m") + mv("cole.west.m")) / 4;
}

export function coleOrientationWestArcsec(): number {
  const az = dataset.angles.coleAzimuth;
  const deviation = (side: "north" | "south" | "east" | "west") => {
    const azimuth = partsToDegrees(az[side]);
    const cardinal = side === "east" || side === "west" ? 360 : 90;
    return (cardinal - azimuth) * 3600;
  };
  const values = [deviation("north"), deviation("south"), deviation("east"), deviation("west")];
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rayToCasing(
  origin: Vec3,
  angleDeg: number,
  north: boolean,
  base: number,
  height: number,
): Vec3 {
  const radians = (angleDeg * Math.PI) / 180;
  const dy = Math.sin(radians);
  const dz = (north ? 1 : -1) * Math.cos(radians);
  const sign = north ? 1 : -1;
  const half = base / 2;
  const k = (sign * half) / height;
  const t = (sign * half - k * origin.y - origin.z) / (dz + k * dy);
  return v(origin.x, origin.y + t * dy, origin.z + t * dz);
}

export function buildPyramidModel(): PyramidModel {
  const baseM = coleMeanBase();
  const faceAngleDeg = dmsToDegrees(dataset.angles.face);
  const faceRad = (faceAngleDeg * Math.PI) / 180;
  const heightM = (baseM / 2) * Math.tan(faceRad);
  const sekedAngleDeg = (Math.atan(14 / 11) * 180) / Math.PI;
  const orientationWestArcsec = coleOrientationWestArcsec();
  const coreBaseM = inches("core.mean.in");
  const currentHeightM = mv("current.height.m");
  const mastLatitude = partsToDegrees(dataset.site.mast.latDms);
  const mastLongitude = partsToDegrees(dataset.site.mast.lonDms);
  const baseCenter = moveMetres(
    mastLatitude,
    mastLongitude,
    dataset.site.baseCenterFromMastMetres.north,
    dataset.site.baseCenterFromMastMetres.east,
  );

  const petrieHalfIn = mv("petrie.base.mean.in") / 2;
  const entrance = v(
    inches("desc.entrance.east.in"),
    inches("desc.entrance.floor.in"),
    (petrieHalfIn - mv("desc.entrance.inset.in")) * IN,
  );
  const descendingEnd = v(
    inches("desc.end.east.in"),
    inches("desc.end.level.in"),
    inches("desc.end.north.in"),
  );
  const descendRad = (dmsToDegrees(dataset.angles.descending) * Math.PI) / 180;
  const junctionDistanceM = mv("desc.junction.in") * IN;
  const junction = v(
    entrance.x,
    entrance.y - junctionDistanceM * Math.sin(descendRad),
    entrance.z - junctionDistanceM * Math.cos(descendRad),
  );
  const ascendingEnd = v(inches("asc.end.east.in"), inches("asc.end.level.in"), inches("asc.end.north.in"));
  const gallerySouth = v(inches("gal.s.east.in"), inches("gal.s.level.in"), -inches("gal.s.south.in"));
  const passageWidth = inches("passage.width.in");
  const passageHeight = inches("passage.height.in");

  const features: BuiltFeature[] = [];

  features.push(
    feature({
      id: "original-casing",
      name: "Original casing",
      group: "Exterior",
      layer: "casing",
      accuracy: "reconstructed",
      schematic: false,
      material: "casing",
      facts: [
        fact("Mean base", metres(baseM, 3), "cole.north.m"),
        fact("North side", `${mv("cole.north.m").toFixed(3)} m`, "cole.north.m"),
        fact("East side", `${mv("cole.east.m").toFixed(3)} m`, "cole.east.m"),
        fact("South side", `${mv("cole.south.m").toFixed(3)} m`, "cole.south.m"),
        fact("West side", `${mv("cole.west.m").toFixed(3)} m`, "cole.west.m"),
        angleFact("Face angle", dataset.angles.face),
        fact("Derived height", metres(heightM, 3), "petrie.height.in"),
        fact(
          "Petrie's height",
          `${mv("petrie.height.in")} ± ${uncertainty("petrie.height.in")} in (${metres(inches("petrie.height.in"), 3)})`,
          "petrie.height.in",
        ),
        fact("Seked, for comparison", `5½ palms, ${formatDms(sekedAngleDeg)}`, "petrie.angle.uncertainty.arcmin"),
        fact("Orientation", `${formatArcsec(orientationWestArcsec)} west of true north`, "cole.north.m"),
        fact("Petrie's orientation", "−3′43″ (223″ west of north)", "petrie.orientation.arcsec"),
      ],
      shapes: [{ kind: "pyramid", base: baseM, height: heightM }],
      meta: { baseM, heightM, faceAngleDeg },
    }),
  );

  features.push(
    feature({
      id: "core-masonry",
      name: "Core masonry, as it stands",
      group: "Exterior",
      layer: "core",
      accuracy: "reconstructed",
      schematic: false,
      material: "core",
      facts: [
        fact("Mean core plane", metres(coreBaseM, 3), "core.mean.in"),
        fact("Standing height drawn", metres(currentHeightM, 1), "current.height.m"),
        fact("Visual steps", `${mv("visual.steps")} equal steps; about 200 real courses`, "visual.steps"),
      ],
      shapes: [
        {
          kind: "stepped",
          base: coreBaseM,
          height: currentHeightM,
          apexHeight: (coreBaseM / 2) * Math.tan(faceRad),
          steps: mv("visual.steps"),
        },
      ],
      meta: { coreBaseM, currentHeightM },
    }),
  );

  features.push(
    feature({
      id: "casing-remnant-north",
      name: "North casing still in place",
      group: "Exterior",
      layer: "core",
      accuracy: "surveyed",
      schematic: true,
      material: "casing",
      facts: [
        fact("Length still in place", metres(mv("remnant.length.m"), 0), "remnant.length.m"),
        fact("Drawn height", metres(mv("remnant.height.m"), 1), "remnant.height.m"),
      ],
      shapes: [
        {
          kind: "remnant",
          length: mv("remnant.length.m"),
          height: mv("remnant.height.m"),
          base: baseM,
          pyramidHeight: heightM,
        },
      ],
      meta: {},
    }),
  );

  features.push(
    feature({
      id: "pavement",
      name: "Pavement",
      group: "Exterior",
      layer: "casing",
      accuracy: "surveyed",
      schematic: false,
      material: "casing",
      facts: [fact("Margin outside the casing", metres(mv("pavement.margin.m"), 2), "pavement.margin.m")],
      shapes: [
        {
          kind: "slab",
          y: 0,
          half: baseM / 2 + mv("pavement.margin.m"),
          thickness: 0.25,
        },
      ],
      meta: {},
    }),
  );

  features.push(
    feature({
      id: "descending-passage",
      name: "Original entrance and Descending Passage",
      group: "Passages",
      layer: "interior",
      accuracy: "surveyed",
      schematic: false,
      material: "passage",
      facts: [
        fact("Doorway above pavement", `${mv("desc.entrance.floor.in")} in (${metres(entrance.y, 3)})`, "desc.entrance.floor.in"),
        fact("East of centre", `${mv("desc.entrance.east.in")} in (${metres(entrance.x, 3)})`, "desc.entrance.east.in"),
        fact("South of the north casing", `${mv("desc.entrance.inset.in")} in`, "desc.entrance.inset.in"),
        angleFact("Slope", dataset.angles.descending),
        fact("Width", `${mv("passage.width.in")} in (${metres(passageWidth, 3)})`, "passage.width.in"),
        fact("Perpendicular height", `${mv("passage.height.in")} in (${metres(passageHeight, 3)})`, "passage.height.in"),
        fact("South end, level", `${mv("desc.end.level.in")} in (${metres(descendingEnd.y, 2)})`, "desc.end.level.in"),
        fact("South end, north of centre", `${mv("desc.end.north.in")} in`, "desc.end.north.in"),
      ],
      shapes: [{ kind: "axis", from: entrance, to: descendingEnd, width: passageWidth, height: passageHeight }],
      meta: { lengthM: dist(entrance, descendingEnd) },
    }),
  );

  const subNorthZ = -inches("sub.n.south.in");
  const subSouthZ = -inches("sub.s.south.in");
  features.push(
    feature({
      id: "subterranean-passage",
      name: "Passage to the Subterranean Chamber",
      group: "Passages",
      layer: "interior",
      accuracy: "surveyed",
      schematic: false,
      material: "bedrock",
      facts: [
        fact("Width", `${mv("sub.pass.w.in")} in`, "sub.pass.w.in"),
        fact("Height", `${mv("sub.pass.h.in")} in`, "sub.pass.h.in"),
      ],
      shapes: [
        {
          kind: "axis",
          from: descendingEnd,
          to: v(descendingEnd.x, descendingEnd.y, subNorthZ),
          width: inches("sub.pass.w.in"),
          height: inches("sub.pass.h.in"),
        },
      ],
      meta: {},
    }),
  );

  const subRoof = -inches("sub.roof.below.in");
  const subFloor = subRoof - inches("sub.below.roof.in");
  features.push(
    feature({
      id: "subterranean-chamber",
      name: "Subterranean Chamber",
      group: "Chambers",
      layer: "interior",
      accuracy: "surveyed",
      schematic: false,
      material: "bedrock",
      facts: [
        fact("North wall", `${mv("sub.n.south.in")} in south of centre`, "sub.n.south.in"),
        fact("South wall", `${mv("sub.s.south.in")} in south of centre`, "sub.s.south.in"),
        fact("Roof below pavement", `${mv("sub.roof.below.in")} in (${metres(-subRoof, 2)})`, "sub.roof.below.in"),
        fact("Eastern floor below the roof", `${mv("sub.below.roof.in")} in`, "sub.below.roof.in"),
      ],
      shapes: [
        {
          kind: "aabb",
          min: v(-inches("sub.w.in"), subFloor, subSouthZ),
          max: v(inches("sub.e.in"), subRoof, subNorthZ),
        },
      ],
      meta: {},
    }),
  );

  features.push(
    feature({
      id: "subterranean-south-passage",
      name: "South drift from the Subterranean Chamber",
      group: "Passages",
      layer: "interior",
      accuracy: "surveyed",
      schematic: false,
      material: "bedrock",
      facts: [
        fact("End", `${mv("sub.south.end.in")} in south of centre`, "sub.south.end.in"),
        fact("Rough width", `${mv("sub.south.w.in")} in`, "sub.south.w.in"),
        fact("Rough height", `${mv("sub.south.h.in")} in`, "sub.south.h.in"),
      ],
      shapes: [
        {
          kind: "axis",
          from: v(descendingEnd.x, subFloor, subSouthZ),
          to: v(descendingEnd.x, subFloor, -inches("sub.south.end.in")),
          width: inches("sub.south.w.in"),
          height: inches("sub.south.h.in"),
        },
      ],
      meta: {},
    }),
  );

  features.push(
    feature({
      id: "ascending-passage",
      name: "Ascending Passage",
      group: "Passages",
      layer: "interior",
      accuracy: "surveyed",
      schematic: false,
      material: "passage",
      facts: [
        fact("Branches at", `${mv("desc.junction.in")} in along the descending floor`, "desc.junction.in"),
        fact("Slope length cited", `${mv("asc.length.in")} in (${metres(inches("asc.length.in"), 2)})`, "asc.length.in"),
        fact("Upper end, level", `${mv("asc.end.level.in")} in (${metres(ascendingEnd.y, 2)})`, "asc.end.level.in"),
        fact("Upper end, north of centre", `${mv("asc.end.north.in")} in`, "asc.end.north.in"),
        fact("Upper end, east of centre", `${mv("asc.end.east.in")} in`, "asc.end.east.in"),
        fact("Width", `${mv("passage.width.in")} in`, "passage.width.in"),
        fact("Perpendicular height", `${mv("passage.height.in")} in`, "passage.height.in"),
      ],
      shapes: [{ kind: "axis", from: junction, to: ascendingEnd, width: passageWidth, height: passageHeight }],
      meta: { lengthM: dist(junction, ascendingEnd) },
    }),
  );

  const ascLen = dist(junction, ascendingEnd);
  const plugFrom = lerp(junction, ascendingEnd, (mv("plug.from.in") * IN) / ascLen);
  const plugTo = lerp(junction, ascendingEnd, (mv("plug.to.in") * IN) / ascLen);
  features.push(
    feature({
      id: "granite-plugs",
      name: "Granite plugs",
      group: "Passages",
      layer: "interior",
      accuracy: "surveyed",
      schematic: false,
      material: "granite",
      facts: [
        fact("Lower end", `${mv("plug.from.in")} in from the floor intersection`, "plug.from.in"),
        fact("Ancient upper end", `${mv("plug.to.in")} in from the intersection`, "plug.to.in"),
        fact("Width at the lower end", `${mv("plug.width.in")} in`, "plug.width.in"),
      ],
      shapes: [
        {
          kind: "axis",
          from: plugFrom,
          to: plugTo,
          width: inches("plug.width.in"),
          height: passageHeight * 0.98,
        },
      ],
      meta: {},
    }),
  );

  const queenCenterZ = inches("qc.center.north.in");
  const queenNorthWallZ = queenCenterZ + inches("qc.ns.in") / 2;
  const stepZ = ascendingEnd.z - mv("qc.pass.step.in") * IN;
  const queenPassageHeight = (mv("qc.pass.roof.in") - mv("qc.pass.flat.in")) * IN;
  const queenLowerHeight = (mv("qc.pass.roof.in") - mv("qc.pass.after.in")) * IN;
  features.push(
    feature({
      id: "queens-passage",
      name: "Passage to the Queen's Chamber",
      group: "Passages",
      layer: "interior",
      accuracy: "surveyed",
      schematic: false,
      material: "passage",
      facts: [
        fact("Flat floor", `${mv("qc.pass.flat.in")} in`, "qc.pass.flat.in"),
        fact("Step", `${mv("qc.pass.step.in")} in from the gallery door`, "qc.pass.step.in"),
        fact("Floor south of the step", `${mv("qc.pass.after.in")} in`, "qc.pass.after.in"),
        fact("Roof at the door", `${mv("qc.pass.roof.in")} in`, "qc.pass.roof.in"),
      ],
      shapes: [
        {
          kind: "axis",
          from: v(ascendingEnd.x, inches("qc.pass.flat.in"), ascendingEnd.z),
          to: v(ascendingEnd.x, inches("qc.pass.before.in"), stepZ),
          width: passageWidth,
          height: queenPassageHeight,
        },
        {
          kind: "axis",
          from: v(ascendingEnd.x, inches("qc.pass.after.in"), stepZ),
          to: v(ascendingEnd.x, inches("qc.floor.in"), queenNorthWallZ),
          width: passageWidth,
          height: queenLowerHeight,
        },
      ],
      meta: {},
    }),
  );

  const queen = {
    cx: ascendingEnd.x,
    cz: queenCenterZ,
    floor: inches("qc.floor.in"),
    sizeX: inches("qc.ew.in"),
    sizeZ: inches("qc.ns.in"),
    wall: inches("qc.wall.in"),
    ridge: inches("qc.ridge.in"),
  };
  features.push(
    feature({
      id: "queens-chamber",
      name: "Queen's Chamber",
      group: "Chambers",
      layer: "interior",
      accuracy: "surveyed",
      schematic: false,
      material: "passage",
      facts: [
        fact("East–west", `${mv("qc.ew.in")} in (${metres(queen.sizeX, 3)})`, "qc.ew.in"),
        fact("North–south", `${mv("qc.ns.in")} in (${metres(queen.sizeZ, 3)})`, "qc.ns.in"),
        fact("Floor", `${mv("qc.floor.in")} in (${metres(queen.floor, 2)})`, "qc.floor.in"),
        fact("Walls", `${mv("qc.wall.in")} in`, "qc.wall.in"),
        fact("Ridge above the floor", `${mv("qc.ridge.in")} in`, "qc.ridge.in"),
        fact("Ridge north of centre", `${mv("qc.center.north.in")} in`, "qc.center.north.in"),
        fact("East–west centre", "Placed on the passage axis, 287 in east of centre", "asc.end.east.in"),
      ],
      shapes: [
        {
          kind: "gable",
          centerX: queen.cx,
          centerZ: queen.cz,
          floorY: queen.floor,
          sizeX: queen.sizeX,
          sizeZ: queen.sizeZ,
          wall: queen.wall,
          ridge: queen.ridge,
        },
      ],
      meta: { centerX: queen.cx, centerY: queen.floor + queen.ridge / 2, centerZ: queen.cz },
    }),
  );

  const nicheBands: Array<{ y0: number; y1: number; width: MeasureKey }> = [
    { y0: 0, y1: mv("niche.h0.in"), width: "niche.w0.in" },
    { y0: mv("niche.h0.in"), y1: mv("niche.h1.in"), width: "niche.w1.in" },
    { y0: mv("niche.h1.in"), y1: mv("niche.h2.in"), width: "niche.w2.in" },
    { y0: mv("niche.h2.in"), y1: mv("niche.h3.in"), width: "niche.w3.in" },
    { y0: mv("niche.h3.in"), y1: mv("niche.h4.in"), width: "niche.w4.in" },
  ];
  const nicheCenterZ = queen.cz - inches("niche.eccentricity.in");
  const nicheEast = queen.cx + queen.sizeX / 2;
  features.push(
    feature({
      id: "queens-niche",
      name: "Niche in the Queen's Chamber",
      group: "Chambers",
      layer: "interior",
      accuracy: "surveyed",
      schematic: false,
      material: "passage",
      facts: [
        fact("Depth", `${mv("niche.depth.in")} in`, "niche.depth.in"),
        fact("Offset of the centre", `${mv("niche.eccentricity.in")} in`, "niche.eccentricity.in"),
        fact("Width at the floor", `${mv("niche.w0.in")} in`, "niche.w0.in"),
        fact("Width at the top", `${mv("niche.w4.in")} in`, "niche.w4.in"),
      ],
      shapes: nicheBands.map((band) => {
        const halfW = inches(band.width) / 2;
        return {
          kind: "aabb" as const,
          min: v(nicheEast, queen.floor + band.y0 * IN, nicheCenterZ - halfW),
          max: v(nicheEast + inches("niche.depth.in"), queen.floor + band.y1 * IN, nicheCenterZ + halfW),
        };
      }),
      meta: { centerZ: nicheCenterZ },
    }),
  );

  const queenSouthWallZ = queen.cz - queen.sizeZ / 2;
  const northMouthY = queen.floor + (mv("qc.nshaft.top.in") - mv("qc.nshaft.h.in") / 2) * IN;
  const northShaftSection = ((mv("qc.nshaft.w.in") + mv("qc.nshaft.h.in")) / 2) * IN;
  const northBend = v(queen.cx, northMouthY, queenNorthWallZ + inches("qc.nshaft.horizontal.in"));
  const northExit = v(queen.cx, inches("qc.nshaft.exit.level.in"), inches("qc.nshaft.exit.centre.in"));
  features.push(
    feature({
      id: "queens-north-shaft",
      name: "Queen's Chamber north shaft",
      group: "Shafts",
      layer: "interior",
      accuracy: "projected",
      schematic: false,
      material: "shaft",
      facts: [
        fact("Horizontal run", `${mv("qc.nshaft.horizontal.in")} in`, "qc.nshaft.horizontal.in"),
        angleFact("Then upward", dataset.angles.qcNorthShaft),
        fact("Section", `${mv("qc.nshaft.w.in")} by ${mv("qc.nshaft.h.in")} in`, "qc.nshaft.h.in"),
        fact("Petrie's projected floor", `${mv("qc.nshaft.exit.level.in")} in up, ${mv("qc.nshaft.exit.centre.in")} in from centre`, "qc.nshaft.exit.level.in"),
      ],
      shapes: [
        {
          kind: "axis",
          from: v(queen.cx, northMouthY, queenNorthWallZ),
          to: northBend,
          width: northShaftSection,
          height: northShaftSection,
          align: "center",
        },
        { kind: "axis", from: northBend, to: northExit, width: northShaftSection, height: northShaftSection, align: "center" },
      ],
      meta: {},
    }),
  );

  const southMouthY = queen.floor + (mv("qc.nshaft.top.in") - mv("qc.sshaft.h.in") / 2) * IN;
  const southSection = ((mv("qc.nshaft.w.in") + mv("qc.sshaft.h.in")) / 2) * IN;
  const southBend = v(queen.cx, southMouthY, queenSouthWallZ - inches("qc.sshaft.horizontal.in"));
  const southExit = v(queen.cx, inches("qc.sshaft.exit.level.in"), -inches("qc.sshaft.exit.centre.in"));
  features.push(
    feature({
      id: "queens-south-shaft",
      name: "Queen's Chamber south shaft",
      group: "Shafts",
      layer: "interior",
      accuracy: "projected",
      schematic: false,
      material: "shaft",
      facts: [
        fact("Horizontal run", `${mv("qc.sshaft.horizontal.in")} in`, "qc.sshaft.horizontal.in"),
        angleFact("Then upward", dataset.angles.qcSouthShaft),
        fact("Projected floor", `${mv("qc.sshaft.exit.level.in")} in up, ${mv("qc.sshaft.exit.centre.in")} in from centre`, "qc.sshaft.exit.level.in"),
      ],
      shapes: [
        {
          kind: "axis",
          from: v(queen.cx, southMouthY, queenSouthWallZ),
          to: southBend,
          width: southSection,
          height: southSection,
          align: "center",
        },
        { kind: "axis", from: southBend, to: southExit, width: southSection, height: southSection, align: "center" },
      ],
      meta: {},
    }),
  );

  features.push(
    feature({
      id: "grand-gallery",
      name: "Grand Gallery",
      group: "Passages",
      layer: "interior",
      accuracy: "surveyed",
      schematic: false,
      material: "passage",
      facts: [
        fact("South end, level", `${mv("gal.s.level.in")} in (${metres(gallerySouth.y, 2)})`, "gal.s.level.in"),
        fact("South end, south of centre", `${mv("gal.s.south.in")} in`, "gal.s.south.in"),
        fact("South end, east of centre", `${mv("gal.s.east.in")} in`, "gal.s.east.in"),
        fact("Width at the walls", `${mv("gal.bottom.in")} in (${metres(inches("gal.bottom.in"), 2)})`, "gal.bottom.in"),
        fact("Width at the ceiling", `${mv("gal.top.in")} in (${metres(inches("gal.top.in"), 2)})`, "gal.top.in"),
        fact("Vertical height", `${mv("gal.height.in")} in (${metres(inches("gal.height.in"), 2)})`, "gal.height.in"),
        fact("Corbel laps", `${mv("gal.laps")}`, "gal.laps"),
      ],
      shapes: [
        {
          kind: "corbel",
          from: ascendingEnd,
          to: gallerySouth,
          floorWidth: inches("gal.bottom.in"),
          topWidth: inches("gal.top.in"),
          verticalHeight: inches("gal.height.in"),
          rampVertical: inches("gal.ramp.in"),
          laps: mv("gal.laps"),
        },
      ],
      meta: { lengthM: dist(ascendingEnd, gallerySouth) },
    }),
  );

  const anteX = gallerySouth.x;
  const anteFloor = inches("ant.floor.in");
  const anteNorthZ = -inches("ant.n.south.in");
  const anteSouthZ = -inches("ant.s.south.in");
  features.push(
    feature({
      id: "antechamber",
      name: "Antechamber",
      group: "Chambers",
      layer: "interior",
      accuracy: "surveyed",
      schematic: false,
      material: "granite",
      facts: [
        fact("Length", `${mv("ant.length.in")} in`, "ant.length.in"),
        fact("Breadth", `${mv("ant.width.in")} in`, "ant.width.in"),
        fact("Height", `${mv("ant.height.in")} in`, "ant.height.in"),
        fact("North end", `${mv("ant.n.south.in")} in south of centre`, "ant.n.south.in"),
        fact("South end", `${mv("ant.s.south.in")} in south of centre`, "ant.s.south.in"),
        fact("Floor", `${mv("ant.floor.in")} in`, "ant.floor.in"),
      ],
      shapes: [
        {
          kind: "aabb",
          min: v(anteX - inches("ant.width.in") / 2, anteFloor, anteSouthZ),
          max: v(anteX + inches("ant.width.in") / 2, anteFloor + inches("ant.height.in"), anteNorthZ),
        },
      ],
      meta: {},
    }),
  );

  const lowW = inches("lowpass.width.in");
  const lowH = inches("lowpass.height.in");
  const kingNorthZ = -inches("kc.n.south.in");
  features.push(
    feature({
      id: "kings-north-passage",
      name: "Passage into the Antechamber",
      group: "Passages",
      layer: "interior",
      accuracy: "reconstructed",
      schematic: false,
      material: "passage",
      facts: [
        fact("From the gallery's south wall", `${mv("gal.s.south.in")} in south of centre`, "gal.s.south.in"),
        fact("To the Antechamber", `${mv("ant.n.south.in")} in south of centre`, "ant.n.south.in"),
        fact("Reconstructed height", `${mv("lowpass.height.in")} in`, "lowpass.height.in"),
      ],
      shapes: [
        {
          kind: "axis",
          from: v(anteX, anteFloor, gallerySouth.z),
          to: v(anteX, anteFloor, anteNorthZ),
          width: lowW,
          height: lowH,
        },
      ],
      meta: {},
    }),
  );
  features.push(
    feature({
      id: "kings-south-passage",
      name: "Passage into the King's Chamber",
      group: "Passages",
      layer: "interior",
      accuracy: "reconstructed",
      schematic: false,
      material: "granite",
      facts: [
        fact("From the Antechamber", `${mv("ant.s.south.in")} in south of centre`, "ant.s.south.in"),
        fact("To the King's Chamber", `${mv("kc.n.south.in")} in south of centre`, "kc.n.south.in"),
        fact("Reconstructed height", `${mv("lowpass.height.in")} in`, "lowpass.height.in"),
      ],
      shapes: [
        {
          kind: "axis",
          from: v(anteX, anteFloor, anteSouthZ),
          to: v(anteX, anteFloor, kingNorthZ),
          width: lowW,
          height: lowH,
        },
      ],
      meta: {},
    }),
  );

  const kingFloor = ((mv("kc.floor.low.in") + mv("kc.floor.high.in")) / 2) * IN;
  const kingCeil = ((mv("kc.ceil.low.in") + mv("kc.ceil.high.in")) / 2) * IN;
  const kingMin = v(-inches("kc.w.west.in"), kingFloor, -inches("kc.s.south.in"));
  const kingMax = v(inches("kc.e.east.in"), kingCeil, -inches("kc.n.south.in"));
  features.push(
    feature({
      id: "kings-chamber",
      name: "King's Chamber",
      group: "Chambers",
      layer: "interior",
      accuracy: "surveyed",
      schematic: false,
      material: "granite",
      facts: [
        fact("North wall", `${mv("kc.n.south.in")} in south of centre`, "kc.n.south.in"),
        fact("South wall", `${mv("kc.s.south.in")} in south of centre`, "kc.s.south.in"),
        fact("East wall", `${mv("kc.e.east.in")} in east of centre`, "kc.e.east.in"),
        fact("West wall", `${mv("kc.w.west.in")} in west of centre`, "kc.w.west.in"),
        fact("Floor", `${mv("kc.floor.low.in")}–${mv("kc.floor.high.in")} in (${metres(kingFloor, 2)})`, "kc.floor.low.in"),
        fact("Ceiling", `${mv("kc.ceil.low.in")}–${mv("kc.ceil.high.in")} in (${metres(kingCeil, 2)})`, "kc.ceil.high.in"),
      ],
      shapes: [{ kind: "aabb", min: kingMin, max: kingMax }],
      meta: {
        centerX: (kingMin.x + kingMax.x) / 2,
        centerY: (kingFloor + kingCeil) / 2,
        centerZ: (kingMin.z + kingMax.z) / 2,
      },
    }),
  );

  const shaftSection = ((mv("kc.shaft.w.in") + mv("kc.shaft.h.in")) / 2) * IN;
  const kingCenterX = (kingMin.x + kingMax.x) / 2;
  const northShaftStart = v(kingCenterX, kingFloor + mv("kc.shaft.mouth.m"), kingMax.z);
  const southShaftStart = v(kingCenterX, kingFloor + mv("kc.shaft.mouth.m"), kingMin.z);
  const northShaftEnd = rayToCasing(northShaftStart, dmsToDegrees(dataset.angles.kcNorthShaft), true, baseM, heightM);
  const southShaftEnd = rayToCasing(southShaftStart, dmsToDegrees(dataset.angles.kcSouthShaft), false, baseM, heightM);
  features.push(
    feature({
      id: "kings-north-shaft",
      name: "King's Chamber north shaft",
      group: "Shafts",
      layer: "interior",
      accuracy: "projected",
      schematic: false,
      material: "shaft",
      facts: [
        angleFact("Outer angle used", dataset.angles.kcNorthShaft),
        fact("Section", `${mv("kc.shaft.w.in")} by ${mv("kc.shaft.h.in")} in`, "kc.shaft.w.in"),
        fact("Mouth above the floor", metres(mv("kc.shaft.mouth.m"), 2), "kc.shaft.mouth.m"),
      ],
      shapes: [{ kind: "axis", from: northShaftStart, to: northShaftEnd, width: shaftSection, height: shaftSection, align: "center" }],
      meta: {},
    }),
  );
  features.push(
    feature({
      id: "kings-south-shaft",
      name: "King's Chamber south shaft",
      group: "Shafts",
      layer: "interior",
      accuracy: "projected",
      schematic: false,
      material: "shaft",
      facts: [
        angleFact("Mean of the measured portions", dataset.angles.kcSouthShaft),
        fact("Section", `${mv("kc.shaft.w.in")} by ${mv("kc.shaft.h.in")} in`, "kc.shaft.h.in"),
        fact("Mouth above the floor", metres(mv("kc.shaft.mouth.m"), 2), "kc.shaft.mouth.m"),
      ],
      shapes: [{ kind: "axis", from: southShaftStart, to: southShaftEnd, width: shaftSection, height: shaftSection, align: "center" }],
      meta: {},
    }),
  );

  const relieveNames: Array<[string, string]> = [
    ["davison", "Davison's Chamber"],
    ["wellington", "Wellington's Chamber"],
    ["nelson", "Nelson's Chamber"],
    ["arbuthnot", "Lady Arbuthnot's Chamber"],
    ["campbell", "Campbell's Chamber"],
  ];
  const apexY = inches("relieve.apex.in");
  const beam = mv("relieve.beam.m");
  const voidHeight = (apexY - kingCeil - 4 * beam) / 5;
  relieveNames.forEach(([id, name], index) => {
    const floorY = kingCeil + index * (voidHeight + beam);
    const isTop = index === relieveNames.length - 1;
    const shapes: Shape[] = isTop
      ? [
          {
            kind: "gable",
            centerX: (kingMin.x + kingMax.x) / 2,
            centerZ: (kingMin.z + kingMax.z) / 2,
            floorY,
            sizeX: kingMax.x - kingMin.x,
            sizeZ: kingMax.z - kingMin.z,
            wall: voidHeight * 0.55,
            ridge: apexY - floorY,
          },
        ]
      : [
          {
            kind: "aabb",
            min: v(kingMin.x, floorY, kingMin.z),
            max: v(kingMax.x, floorY + voidHeight, kingMax.z),
          },
        ];
    features.push(
      feature({
        id,
        name,
        group: "Chambers",
        layer: "interior",
        accuracy: "schematic",
        schematic: true,
        material: "granite",
        summary: dataset.summaries["relieving-chambers"],
        facts: [
          fact("Top of the stack", `${mv("relieve.apex.in")} in (${metres(apexY, 2)})`, "relieve.apex.in"),
          fact("Spacer used between voids", metres(beam, 2), "relieve.beam.m"),
        ],
        shapes,
        meta: { floorY, index },
      }),
    );
  });

  const galleryLength = dist(ascendingEnd, gallerySouth);
  const wellMouth = lerp(ascendingEnd, gallerySouth, (mv("well.mouth.in") * IN) / galleryLength);
  wellMouth.x -= inches("gal.top.in") / 2;
  const grotto = v(wellMouth.x - 2.2, 6, wellMouth.z - 0.8);
  const descendLength = dist(entrance, descendingEnd);
  const junctionT = dist(entrance, junction) / descendLength;
  const join = lerp(entrance, descendingEnd, junctionT + 0.45 * (1 - junctionT));
  join.x -= passageWidth / 2;
  features.push(
    feature({
      id: "well-shaft",
      name: "Well shaft",
      group: "Passages",
      layer: "interior",
      accuracy: "schematic",
      schematic: true,
      material: "bedrock",
      facts: [
        fact("Mouth from the gallery's north wall", `${mv("well.mouth.in")} in`, "well.mouth.in"),
      ],
      shapes: [
        { kind: "axis", from: wellMouth, to: grotto, width: 0.72, height: 0.72, align: "center" },
        {
          kind: "aabb",
          min: v(grotto.x - 0.9, grotto.y - 0.6, grotto.z - 0.8),
          max: v(grotto.x + 0.9, grotto.y + 1.4, grotto.z + 0.8),
        },
        { kind: "axis", from: grotto, to: join, width: 0.72, height: 0.72, align: "center" },
      ],
      meta: { mouthX: wellMouth.x, mouthY: wellMouth.y, mouthZ: wellMouth.z },
    }),
  );

  const sillY = mv("mamun.entrance.m");
  const sill = v(0, sillY, casingHalfWidth(sillY, baseM, heightM));
  const mamunBend = v(0, sillY, junction.z);
  const mamunSize = mv("mamun.width.m");
  features.push(
    feature({
      id: "mamun-tunnel",
      name: "Al-Ma'mun's tunnel",
      group: "Intrusions",
      layer: "interior",
      accuracy: "schematic",
      schematic: true,
      material: "forced",
      facts: [
        fact("Drawn sill", metres(sillY, 1), "mamun.entrance.m"),
        fact("Drawn section", metres(mamunSize, 1), "mamun.width.m"),
      ],
      shapes: [
        { kind: "axis", from: sill, to: mamunBend, width: mamunSize, height: mamunSize },
        { kind: "axis", from: mamunBend, to: junction, width: mamunSize, height: mamunSize },
      ],
      meta: {},
    }),
  );

  const chevronRise = mv("chevron.rise.m");
  const chevronBaseY = entrance.y + 0.85;
  const chevronZ = casingHalfWidth(chevronBaseY, baseM, heightM) - mv("chevron.thickness.m") * 0.35;
  const chevronApex = v(entrance.x, chevronBaseY + chevronRise, chevronZ - 0.35);
  features.push(
    feature({
      id: "north-face-chevron",
      name: "North-face chevron",
      group: "Exterior",
      layer: "interior",
      accuracy: "schematic",
      schematic: true,
      material: "chevron",
      facts: [
        fact("Block thickness", metres(mv("chevron.thickness.m"), 2), "chevron.thickness.m"),
        fact("Drawn span", metres(mv("chevron.span.m"), 1), "chevron.span.m"),
      ],
      shapes: [
        {
          kind: "axis",
          from: v(entrance.x - mv("chevron.span.m") / 2, chevronBaseY, chevronZ),
          to: chevronApex,
          width: mv("chevron.thickness.m"),
          height: 0.85,
          align: "center",
        },
        {
          kind: "axis",
          from: v(entrance.x + mv("chevron.span.m") / 2, chevronBaseY, chevronZ),
          to: chevronApex,
          width: mv("chevron.thickness.m"),
          height: 0.85,
          align: "center",
        },
      ],
      meta: {},
    }),
  );

  const nfcTop = mv("nfc.floor.m") + mv("nfc.h.m");
  const nfcNorthZ = casingHalfWidth(nfcTop, baseM, heightM) - mv("nfc.behind.m");
  const nfcSouthZ = nfcNorthZ - mv("nfc.l.m");
  features.push(
    feature({
      id: "north-face-corridor",
      name: "North Face Corridor",
      group: "Voids",
      layer: "interior",
      accuracy: "surveyed",
      schematic: false,
      material: "void",
      facts: [
        fact("Width", `${mv("nfc.w.m")} ± ${uncertainty("nfc.w.m")} m`, "nfc.w.m"),
        fact("Height", `${mv("nfc.h.m")} ± ${uncertainty("nfc.h.m")} m`, "nfc.h.m"),
        fact("Length", `${mv("nfc.l.m")} ± ${uncertainty("nfc.l.m")} m`, "nfc.l.m"),
        fact("Floor above the ground", `about ${mv("nfc.floor.m")} m`, "nfc.floor.m"),
        fact("Behind the chevron face", `${mv("nfc.behind.m")} ± ${uncertainty("nfc.behind.m")} m`, "nfc.behind.m"),
      ],
      shapes: [
        {
          kind: "aabb",
          min: v(entrance.x - mv("nfc.w.m") / 2, mv("nfc.floor.m"), nfcSouthZ),
          max: v(entrance.x + mv("nfc.w.m") / 2, nfcTop, nfcNorthZ),
        },
      ],
      meta: { northZ: nfcNorthZ, floorY: mv("nfc.floor.m"), centerX: entrance.x },
    }),
  );

  const queenCenter = v(queen.cx, queen.floor + queen.ridge / 2, queen.cz);
  const voidZ = mv("bv.center.north.m");
  const voidX = (ascendingEnd.x + gallerySouth.x) / 2;
  const horizontal = Math.hypot(voidX - queenCenter.x, voidZ - queenCenter.z);
  const target = mv("bv.distance.m");
  const rise = Math.sqrt(Math.max(0, target * target - horizontal * horizontal));
  const voidCenterY = queenCenter.y + rise;
  const voidHeightM = inches("gal.height.in");
  const voidWidthM = inches("gal.bottom.in");
  const voidFloor = voidCenterY - voidHeightM / 2;
  features.push(
    feature({
      id: "big-void",
      name: "ScanPyramids Big Void",
      group: "Voids",
      layer: "interior",
      accuracy: "reconstructed",
      schematic: true,
      material: "void",
      facts: [
        fact("Minimum length", metres(mv("bv.length.m"), 0), "bv.length.m"),
        fact("Distance used from the Queen's Chamber", metres(target, 0), "bv.distance.m"),
        fact("Cross-section", "Taken from the Grand Gallery: wall width and vertical height", "gal.bottom.in"),
        fact("Northing chosen", `${mv("bv.center.north.m")} m north of centre`, "bv.center.north.m"),
      ],
      shapes: [
        {
          kind: "aabb",
          min: v(voidX - voidWidthM / 2, voidFloor, voidZ - mv("bv.length.m") / 2),
          max: v(voidX + voidWidthM / 2, voidFloor + voidHeightM, voidZ + mv("bv.length.m") / 2),
        },
      ],
      meta: {
        centerX: voidX,
        centerY: voidCenterY,
        centerZ: voidZ,
        floorY: voidFloor,
        distanceM: Math.hypot(voidX - queenCenter.x, voidCenterY - queenCenter.y, voidZ - queenCenter.z),
      },
    }),
  );

  return {
    baseM,
    heightM,
    faceAngleDeg,
    sekedAngleDeg,
    orientationWestArcsec,
    coreBaseM,
    currentHeightM,
    site: {
      latitude: baseCenter.lat,
      longitude: baseCenter.lon,
      mastLatitude,
      mastLongitude,
    },
    entrance,
    descendingEnd,
    junction,
    ascendingEnd,
    gallerySouth,
    features,
  };
}

export function featureById(model: PyramidModel, id: string): BuiltFeature {
  const found = model.features.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown feature ${id}`);
  return found;
}

export function shapeCenter(shape: Shape): Vec3 {
  switch (shape.kind) {
    case "pyramid":
      return v(0, shape.height * 0.35, 0);
    case "stepped":
      return v(0, shape.height * 0.45, 0);
    case "slab":
      return v(0, shape.y, 0);
    case "remnant":
      return v(0, shape.height / 2, shape.base / 2 - 1);
    case "axis":
    case "corbel":
      return lerp(shape.from, shape.to, 0.5);
    case "aabb":
      return v(
        (shape.min.x + shape.max.x) / 2,
        (shape.min.y + shape.max.y) / 2,
        (shape.min.z + shape.max.z) / 2,
      );
    case "gable":
      return v(shape.centerX, shape.floorY + shape.ridge / 2, shape.centerZ);
  }
}

export function featureAnchor(item: BuiltFeature): Vec3 {
  return shapeCenter(item.shapes[0]);
}

export function aabbCorners(min: Vec3, max: Vec3): Vec3[] {
  const corners: Vec3[] = [];
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) corners.push(v(x, y, z));
    }
  }
  return corners;
}

let cached: PyramidModel | null = null;

export function getPyramidModel(): PyramidModel {
  if (!cached) cached = buildPyramidModel();
  return cached;
}
