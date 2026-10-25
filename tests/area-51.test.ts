import fs from "node:fs";
import { describe, expect, it } from "vitest";
import featuresFile from "../sites/area-51/features.json";
import siteFile from "../sites/area-51/site.json";
import sourcesFile from "../sites/area-51/sources.json";
import { enuDistance, metresPerDegLon, METRES_PER_DEG_LAT } from "../src/lib/enu";
import { getPyramidModel } from "../src/lib/pyramid-model";

const FT = 0.3048;
const features = featuresFile.features;

function feature(id: string) {
  const found = features.find((item) => item.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

describe("Area 51 geography", () => {
  it("pins the airport on the Wikipedia coordinate", () => {
    expect(siteFile.location.latitude).toBeCloseTo(37 + 14 / 60, 8);
    expect(siteFile.location.longitude).toBeCloseTo(-(115 + 48 / 60 + 30 / 3600), 8);
  });

  it("draws runway 14/32 at the published length, on the imagery", () => {
    const runway = feature("runway-14-32");
    const paved = runway.geometry[0];
    if (paved.kind !== "runway") throw new Error("expected a runway");
    const length = enuDistance(paved.from, paved.to);
    expect(length).toBeGreaterThan(3656);
    expect(length).toBeLessThan(3658);
    expect(paved.from.z).toBeGreaterThan(paved.to.z);

    const mid = { x: (paved.from.x + paved.to.x) / 2, z: (paved.from.z + paved.to.z) / 2 };
    const latitude = siteFile.location.latitude + mid.z / METRES_PER_DEG_LAT;
    const longitude = siteFile.location.longitude + mid.x / metresPerDegLon(siteFile.location.latitude);
    const frame = siteFile.terrain;
    expect(latitude).toBeGreaterThan(frame.imageSouth);
    expect(latitude).toBeLessThan(frame.imageNorth);
    expect(longitude).toBeGreaterThan(frame.imageWest);
    expect(longitude).toBeLessThan(frame.imageEast);
    expect(feature("groom-lake").evidence).toBe("verified");
  });

  it("reads a SRTM elevation at the airport within 30 m of the published 1,370 m", () => {
    const buffer = fs.readFileSync("public/sites/area-51/terrain/heights.i16");
    const copy = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(copy).set(buffer);
    const heights = new Int16Array(copy);
    const frame = siteFile.terrain;
    expect(heights.length).toBe(frame.cols * frame.rows);
    const col = Math.round(((siteFile.location.longitude - frame.west) / (frame.east - frame.west)) * (frame.cols - 1));
    const row = Math.round(((frame.north - siteFile.location.latitude) / (frame.north - frame.south)) * (frame.rows - 1));
    const elevation = heights[row * frame.cols + col];
    expect(Math.abs(elevation - 1370)).toBeLessThan(30);
  });
});

describe("Sport Model dimensions", () => {
  it("uses Lazar's stated diameter, height, reactor plate, and three amplifiers", () => {
    const hull = feature("sport-model").geometry[0];
    if (hull.kind !== "disc") throw new Error("expected a disc");
    expect(hull.radius * 2).toBeCloseTo(40 * FT, 6);
    expect(hull.height).toBeCloseTo(15.5 * FT, 6);

    const plate = feature("reactor").geometry[0];
    if (plate.kind !== "cylinder") throw new Error("expected the reactor plate");
    expect(plate.radius * 2).toBeCloseTo(18 * 0.0254, 6);
    expect(feature("gravity-amplifiers").geometry).toHaveLength(3);

    const heightFact = feature("sport-model").facts.find((fact) => fact.label === "Drawn height");
    expect(heightFact?.evidence).toBe("estimated");
    expect(heightFact?.value.toLowerCase()).toContain("estimated");
    expect(feature("reactor").facts.find((fact) => fact.label === "Reactor plate")?.evidence).toBe("testimony");
  });
});

describe("evidence labels", () => {
  it("never presents testimony or an estimate as verified", () => {
    const kinds = new Map(sourcesFile.sources.map((source) => [source.id, source.kind ?? "record"]));
    for (const item of features) {
      expect(["verified", "testimony", "estimated"]).toContain(item.evidence);
      for (const fact of item.facts ?? []) {
        const evidence = fact.evidence ?? "verified";
        if (item.evidence !== "verified") expect(evidence).not.toBe("verified");
        if (evidence === "verified") expect(kinds.get(fact.sourceId)).not.toBe("testimony");
        if (evidence === "testimony") expect(kinds.get(fact.sourceId)).toBe("testimony");
        if (evidence === "estimated") expect(fact.value.toLowerCase()).toContain("estimated");
      }
      if (item.id.startsWith("s4")) {
        expect(item.evidence).toBe("testimony");
        expect(item.description.toLowerCase()).toContain("no public evidence confirms");
      }
    }
  });

  it("anchors the Sport Model on the S-4 bays", () => {
    const craft = feature("sport-model");
    const hangars = feature("s4-hangars");
    expect(craft.parent).toBe("s4-hangars");
    expect(feature("reactor").parent).toBe("sport-model");
    expect(siteFile.entryFeature).toBe("groom-lake");
    const middle = hangars.geometry[4];
    if (middle.kind !== "aabb" || !craft.anchor) throw new Error("expected the middle bay and an anchor");
    const doorX = (middle.min.x + middle.max.x) / 2;
    const doorZ = (middle.min.z + middle.max.z) / 2;
    expect(Math.hypot(craft.anchor.x - doorX, craft.anchor.z - doorZ)).toBeLessThan(40);
  });

  it("keeps the pyramid record verified", () => {
    for (const item of getPyramidModel().features) {
      expect(item.evidence).toBe("verified");
    }
  });
});
