import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import dataset from "../data/great-pyramid.json";
import {
  buildCorbelGeometry,
  floorPlumbHeight,
  passageFrame,
} from "../src/lib/geometry";
import { latLonToVector } from "../src/lib/globe";
import {
  aabbCorners,
  applyTrueNorth,
  buildPyramidModel,
  casingHalfWidth,
  coleOrientationWestArcsec,
  featureById,
  insideOriginalPyramid,
  moveMetres,
  sectionPlane,
  signedDistance,
  type Shape,
} from "../src/lib/pyramid-model";

const IN = 0.0254;
const model = buildPyramidModel();

function shape<K extends Shape["kind"]>(id: string, kind: K): Extract<Shape, { kind: K }> {
  const found = featureById(model, id).shapes.find((item) => item.kind === kind);
  if (!found || found.kind !== kind) throw new Error(`${id} has no ${kind}`);
  return found as Extract<Shape, { kind: K }>;
}

function dist(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe("exterior, from Cole 1925 and Petrie 1883", () => {
  it("uses the mean of Cole's four casing sides", () => {
    const mean = (230.253 + 230.454 + 230.391 + 230.357) / 4;
    expect(mean).toBeCloseTo(230.36375, 5);
    expect(model.baseM).toBeCloseTo(mean, 5);
    expect(shape("original-casing", "pyramid").base).toBeCloseTo(mean, 5);
    expect(Math.max(230.253, 230.454, 230.391, 230.357) - Math.min(230.253, 230.454, 230.391, 230.357)).toBeGreaterThan(0.1);
  });

  it("derives the height from Petrie's 51°52′ face on that base", () => {
    const face = 51 + 52 / 60;
    expect(model.faceAngleDeg).toBeCloseTo(face, 8);
    const height = (model.baseM / 2) * Math.tan((face * Math.PI) / 180);
    expect(model.heightM).toBeCloseTo(height, 4);
    expect(Math.abs(model.heightM - 5776 * IN)).toBeLessThan(0.02);
    expect(model.heightM).toBeGreaterThan(146.6);
    expect(model.heightM).toBeLessThan(146.8);
  });

  it("keeps the seked of 5½ palms inside Petrie's ±2 arcminutes", () => {
    const seked = (Math.atan(14 / 11) * 180) / Math.PI;
    expect(model.sekedAngleDeg).toBeCloseTo(seked, 6);
    expect(Math.abs(seked - (51 + 52 / 60)) * 60).toBeLessThan(2);
  });

  it("turns the mean of Cole's four azimuths 3′06.25″ west of north", () => {
    expect(coleOrientationWestArcsec()).toBeCloseTo(186.25, 4);
    expect(model.orientationWestArcsec).toBeCloseTo(186.25, 4);
    expect(applyTrueNorth({ x: 0, y: 0, z: 1 }, 186.25).x).toBeLessThan(0);
  });

  it("clips the east of the passage plane and keeps the west", () => {
    const plane = sectionPlane(model.entrance.x, model.orientationWestArcsec);
    const kept = applyTrueNorth({ x: model.entrance.x - 1, y: 20, z: 0 }, model.orientationWestArcsec);
    const cut = applyTrueNorth({ x: model.entrance.x + 1, y: 20, z: 0 }, model.orientationWestArcsec);
    expect(signedDistance(kept, plane)).toBeGreaterThan(0);
    expect(signedDistance(cut, plane)).toBeLessThan(0);
  });

  it("sets the core to Petrie's 9,001.5 inch plane and a 138.5 m top", () => {
    expect(model.coreBaseM).toBeCloseTo(9001.5 * IN, 5);
    expect(model.currentHeightM).toBe(138.5);
    expect(shape("core-masonry", "stepped").base).toBeCloseTo(9001.5 * IN, 5);
    expect(shape("core-masonry", "stepped").height).toBe(138.5);
    expect(shape("core-masonry", "stepped").steps).toBe(36);
  });
});

describe("site, from Dash 2018", () => {
  it("places the base centre a fraction of a metre from the summit mast", () => {
    const mastLat = 29 + 58 / 60 + 45.0557 / 3600;
    const mastLon = 31 + 8 / 60 + 3.11209 / 3600;
    expect(model.site.mastLatitude).toBeCloseTo(mastLat, 8);
    expect(model.site.mastLongitude).toBeCloseTo(mastLon, 8);
    const back = moveMetres(model.site.latitude, model.site.longitude, 0.26, -0.377);
    expect(back.lat).toBeCloseTo(mastLat, 6);
    expect(back.lon).toBeCloseTo(mastLon, 6);
    const offset = moveMetres(mastLat, mastLon, -0.26, 0.377);
    expect(offset.lat).toBeCloseTo(model.site.latitude, 8);
    expect(offset.lon).toBeCloseTo(model.site.longitude, 8);
  });

  it("round-trips a one-kilometre offset", () => {
    const moved = moveMetres(model.site.latitude, model.site.longitude, 1000, -250);
    const back = moveMetres(moved.lat, moved.lon, -1000, 250);
    expect(Math.abs(back.lat - model.site.latitude)).toBeLessThan(1e-6);
    expect(Math.abs(back.lon - model.site.longitude)).toBeLessThan(1e-6);
  });
});

describe("passages and chambers, from Petrie chapter 7", () => {
  it("puts the original doorway where Petrie measured it", () => {
    expect(model.entrance.y).toBeCloseTo(668.2 * IN, 5);
    expect(model.entrance.x).toBeCloseTo(287 * IN, 5);
    expect(model.entrance.z).toBeCloseTo((9068.8 / 2 - 524.1) * IN, 5);
    expect(model.descendingEnd.y).toBeCloseTo(-1181 * IN, 5);
    expect(model.descendingEnd.z).toBeCloseTo(306 * IN, 5);
    expect(model.descendingEnd.x).toBeCloseTo(286.4 * IN, 5);
  });

  it("holds the descending floor within 0.05° of 26°31′23″", () => {
    const dy = model.entrance.y - model.descendingEnd.y;
    const horizontal = Math.hypot(
      model.entrance.x - model.descendingEnd.x,
      model.entrance.z - model.descendingEnd.z,
    );
    const degrees = (Math.atan2(dy, horizontal) * 180) / Math.PI;
    const published = 26 + 31 / 60 + 23 / 3600;
    expect(Math.abs(degrees - published)).toBeLessThan(0.05);
    expect(dist(model.entrance, model.junction)).toBeCloseTo(1110.64 * IN, 4);
  });

  it("ends the ascending passage on Petrie's gallery door, within 2 cm of 1,546.8 inches", () => {
    expect(model.ascendingEnd.y).toBeCloseTo(852.6 * IN, 5);
    expect(model.ascendingEnd.z).toBeCloseTo(1626.8 * IN, 5);
    expect(model.ascendingEnd.x).toBeCloseTo(287 * IN, 5);
    expect(Math.abs(dist(model.junction, model.ascendingEnd) - 1546.8 * IN)).toBeLessThan(0.02);
  });

  it("keeps Petrie's north-to-south order from the gallery to the King's Chamber", () => {
    const queen = shape("queens-chamber", "gable");
    const ante = shape("antechamber", "aabb");
    const king = shape("kings-chamber", "aabb");
    expect(model.ascendingEnd.z).toBeGreaterThan(queen.centerZ);
    expect(queen.centerZ).toBeGreaterThan(model.gallerySouth.z);
    expect(model.gallerySouth.z).toBeGreaterThan(ante.max.z);
    expect(ante.min.z).toBeGreaterThan(king.max.z);
    expect(model.gallerySouth.y).toBeCloseTo(1689 * IN, 5);
    expect(model.gallerySouth.z).toBeCloseTo(-61.7 * IN, 5);
    expect(model.gallerySouth.x).toBeCloseTo(284.4 * IN, 5);
  });

  it("follows Petrie's Queen's Chamber, not the swapped secondary axes", () => {
    const queen = shape("queens-chamber", "gable");
    expect(queen.sizeZ).toBeCloseTo(205.85 * IN, 5);
    expect(queen.sizeX).toBeCloseTo(226.47 * IN, 5);
    expect(Math.abs(queen.centerZ - 0.3 * IN)).toBeLessThan(0.001);
    expect(Math.abs(queen.centerZ)).toBeLessThan(0.02);
    expect(queen.floorY).toBeCloseTo(834.4 * IN, 5);
    expect(queen.ridge).toBeCloseTo(245.1 * IN, 5);
    expect(queen.wall).toBeCloseTo(184.47 * IN, 5);
  });

  it("sets the niche south of the chamber midline", () => {
    const bands = featureById(model, "queens-niche").shapes.filter((item) => item.kind === "aabb");
    expect(bands).toHaveLength(5);
    const first = bands[0];
    if (first.kind !== "aabb") throw new Error("niche");
    const centerZ = (first.min.z + first.max.z) / 2;
    expect(centerZ).toBeCloseTo(shape("queens-chamber", "gable").centerZ - 25.2 * IN, 4);
    expect(first.max.x - first.min.x).toBeCloseTo(41.07 * IN, 4);
  });

  it("uses Petrie's present King's Chamber walls and the mean floor and ceiling", () => {
    const king = shape("kings-chamber", "aabb");
    expect(king.min.z).toBeCloseTo(-537 * IN, 5);
    expect(king.max.z).toBeCloseTo(-330.6 * IN, 5);
    expect(king.max.x).toBeCloseTo(305.1 * IN, 5);
    expect(king.min.x).toBeCloseTo(-107.7 * IN, 5);
    expect(king.min.y).toBeCloseTo(((1691.4 + 1693.7) / 2) * IN, 5);
    expect(king.max.y).toBeCloseTo(((1921.6 + 1923.7) / 2) * IN, 5);
    for (const corner of aabbCorners(king.min, king.max)) {
      expect(insideOriginalPyramid(corner, model.baseM, model.heightM)).toBe(true);
    }
  });

  it("spans 52 inches into the Antechamber and 100.8 inches on into the King's Chamber", () => {
    const north = shape("kings-north-passage", "axis");
    const south = shape("kings-south-passage", "axis");
    expect(Math.abs(north.from.z - north.to.z)).toBeCloseTo(52 * IN, 4);
    expect(Math.abs(south.from.z - south.to.z)).toBeCloseTo(100.8 * IN, 4);
    expect(featureById(model, "kings-north-passage").accuracy).toBe("reconstructed");
  });

  it("puts the Subterranean Chamber below the pavement and south of centre", () => {
    const pit = shape("subterranean-chamber", "aabb");
    expect(pit.max.y).toBeLessThan(0);
    expect(pit.max.z).toBeLessThan(0);
    expect(pit.max.y).toBeCloseTo(-1056 * IN, 4);
    expect(pit.min.z).toBeCloseTo(-366 * IN, 4);
    expect(pit.max.z).toBeCloseTo(-40 * IN, 4);
  });
});

describe("shafts, relieving chambers, and the published voids", () => {
  it("gives the Grand Gallery Petrie's plumb height, not the perpendicular passage height", () => {
    const gallery = shape("grand-gallery", "corbel");
    expect(gallery.verticalHeight).toBeCloseTo(339 * IN, 5);
    expect(gallery.floorWidth).toBeCloseTo(82.5 * IN, 5);
    expect(gallery.topWidth).toBeCloseTo(41.1 * IN, 5);
    expect(gallery.laps).toBe(7);
    const positions = buildCorbelGeometry(gallery).getAttribute("position");
    let maxPlumb = 0;
    const point = new Vector3();
    for (let i = 0; i < positions.count; i += 1) {
      point.fromBufferAttribute(positions, i);
      maxPlumb = Math.max(maxPlumb, floorPlumbHeight(gallery.from, gallery.to, point));
    }
    expect(maxPlumb).toBeCloseTo(339 * IN, 2);
    const frame = passageFrame(gallery.from, gallery.to);
    expect(frame.cosSlope).toBeLessThan(0.95);
  });

  it("stacks five relieving spaces under Vyse's 2,525 inch apex", () => {
    const names = ["davison", "wellington", "nelson", "arbuthnot", "campbell"] as const;
    const floors = names.map((id) => featureById(model, id).meta.floorY);
    expect(floors[0]).toBeCloseTo(shape("kings-chamber", "aabb").max.y, 4);
    for (let i = 0; i < floors.length - 1; i += 1) expect(floors[i + 1]).toBeGreaterThan(floors[i]);
    const campbell = shape("campbell", "gable");
    expect(campbell.floorY + campbell.ridge).toBeCloseTo(2525 * IN, 3);
    for (const id of names) expect(featureById(model, id).schematic).toBe(true);
  });

  it("meets the casing with the King's Chamber shafts", () => {
    for (const id of ["kings-north-shaft", "kings-south-shaft"]) {
      const shaft = shape(id, "axis");
      expect(shaft.align).toBe("center");
      const half = casingHalfWidth(shaft.to.y, model.baseM, model.heightM);
      expect(Math.abs(Math.abs(shaft.to.z) - half)).toBeLessThan(0.02);
      expect(shaft.to.y).toBeGreaterThan(shaft.from.y);
      expect(shaft.to.y).toBeLessThan(model.heightM);
    }
  });

  it("places the North Face Corridor behind the casing, inside the original pyramid", () => {
    const box = shape("north-face-corridor", "aabb");
    expect(box.max.x - box.min.x).toBeCloseTo(2.02, 5);
    expect(box.max.y - box.min.y).toBeCloseTo(2.18, 5);
    expect(box.max.z - box.min.z).toBeCloseTo(9.06, 5);
    expect(box.min.y).toBeCloseTo(20, 5);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(model.entrance.x, 4);
    const half = casingHalfWidth(box.max.y, model.baseM, model.heightM);
    expect(Math.abs(half - box.max.z - 0.84)).toBeLessThan(0.01);
    for (const corner of aabbCorners(box.min, box.max)) {
      expect(insideOriginalPyramid(corner, model.baseM, model.heightM)).toBe(true);
    }
  });

  it("draws only the horizontal Big Void hypothesis, above the gallery and 40–50 m from the Queen", () => {
    const box = shape("big-void", "aabb");
    const feature = featureById(model, "big-void");
    expect(box.max.z - box.min.z).toBeGreaterThanOrEqual(30);
    expect(box.max.z - box.min.z).toBeCloseTo(30, 5);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(20, 5);
    expect(feature.meta.distanceM).toBeGreaterThanOrEqual(40);
    expect(feature.meta.distanceM).toBeLessThanOrEqual(50);
    expect(feature.meta.distanceM).toBeCloseTo(45, 2);
    expect(feature.schematic).toBe(true);
    const gallery = shape("grand-gallery", "corbel");
    expect(box.min.y).toBeGreaterThan(gallery.to.y + gallery.verticalHeight);
    for (const corner of aabbCorners(box.min, box.max)) {
      expect(insideOriginalPyramid(corner, model.baseM, model.heightM)).toBe(true);
    }
  });
});

describe("the ledger behind the mesh", () => {
  const required = [
    "original-casing",
    "core-masonry",
    "casing-remnant-north",
    "pavement",
    "descending-passage",
    "subterranean-passage",
    "subterranean-chamber",
    "subterranean-south-passage",
    "ascending-passage",
    "granite-plugs",
    "queens-passage",
    "queens-chamber",
    "queens-niche",
    "queens-north-shaft",
    "queens-south-shaft",
    "grand-gallery",
    "antechamber",
    "kings-north-passage",
    "kings-south-passage",
    "kings-chamber",
    "kings-north-shaft",
    "kings-south-shaft",
    "davison",
    "wellington",
    "nelson",
    "arbuthnot",
    "campbell",
    "well-shaft",
    "mamun-tunnel",
    "north-face-chevron",
    "north-face-corridor",
    "big-void",
  ];

  it("builds every feature in the v1 scope once", () => {
    expect(new Set(model.features.map((item) => item.id)).size).toBe(model.features.length);
    for (const id of required) expect(model.features.some((item) => item.id === id)).toBe(true);
  });

  it("cites a source that exists for every fact", () => {
    const sourceIds = new Set(dataset.sources.map((source) => source.id));
    for (const id of ["petrie1883", "cole1925", "dash2018", "dash2015", "lehner1997", "scanpyramids2017", "scanpyramids2023", "vyse1840"]) {
      expect(sourceIds.has(id)).toBe(true);
    }
    for (const feature of model.features) {
      expect(feature.facts.length).toBeGreaterThan(0);
      expect(feature.summary.length).toBeGreaterThan(40);
      expect(feature.sourceIds.length).toBeGreaterThan(0);
      for (const sourceId of feature.sourceIds) expect(sourceIds.has(sourceId)).toBe(true);
    }
    for (const measure of Object.values(dataset.measures)) expect(sourceIds.has(measure.sourceId)).toBe(true);
  });

  it("marks the unsurveyed reconstructions and keeps the photographs openly licensed", () => {
    for (const id of ["well-shaft", "mamun-tunnel", "north-face-chevron", "casing-remnant-north"]) {
      expect(featureById(model, id).schematic).toBe(true);
    }
    expect(featureById(model, "descending-passage").schematic).toBe(false);
    expect(featureById(model, "kings-chamber").schematic).toBe(false);
    for (const media of dataset.media) {
      expect(media.license).toMatch(/CC |CC0|public domain/i);
      expect(media.license.toLowerCase()).not.toContain("copyrighted free use");
      expect(media.url.startsWith("https://upload.wikimedia.org/")).toBe(true);
    }
  });
});

describe("globe placement", () => {
  it("puts the equator at Greenwich on +X and Giza in the north-east quadrant", () => {
    const greenwich = latLonToVector(0, 0, 1);
    expect(greenwich.x).toBeCloseTo(1, 6);
    expect(greenwich.z).toBeCloseTo(0, 6);
    expect(latLonToVector(90, 0, 1).y).toBeCloseTo(1, 6);
    expect(latLonToVector(0, 90, 1).z).toBeCloseTo(-1, 6);
    const giza = latLonToVector(model.site.latitude, model.site.longitude, 1);
    expect(giza.x).toBeGreaterThan(0);
    expect(giza.y).toBeGreaterThan(0);
    expect(giza.z).toBeLessThan(0);
    expect(Math.abs(giza.x)).toBeGreaterThan(Math.abs(giza.z));
  });
});
