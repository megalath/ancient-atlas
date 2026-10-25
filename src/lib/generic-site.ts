import type { Accuracy, BuiltFeature, Evidence, MaterialId, Media, SceneId, SceneModel, Shape, Vec3 } from "./pyramid-model";

type GenericImage = {
  id: string;
  title: string;
  file?: string;
  wikimediaUrl?: string;
  url?: string;
  page: string;
  author: string;
  license: string;
  licenseUrl?: string;
};

type GenericFeature = {
  id: string;
  name: string;
  group: BuiltFeature["group"];
  layer: BuiltFeature["layer"];
  accuracy: Accuracy;
  schematic?: boolean;
  material: MaterialId;
  evidence?: Evidence;
  scene?: SceneId;
  parent?: string;
  anchor?: { x: number; z: number };
  description: string;
  links?: BuiltFeature["links"];
  facts?: BuiltFeature["facts"];
  images?: GenericImage[];
  geometry?: Shape[] | { providedBy?: string };
};

export type GenericPackage = {
  site: {
    id: string;
    name: string;
    builder?: string;
    wikipedia?: string;
    catalogIssue?: number | null;
    entryFeature?: string;
    location?: { latitude: number; longitude: number };
    orientation?: { westOfNorthArcsec: number };
  };
  features: { features: GenericFeature[] };
};

function asImages(feature: GenericFeature): Media[] {
  return (feature.images ?? []).map((image) => ({
    id: image.id,
    featureIds: [feature.id],
    title: image.title,
    url: image.file || image.url || image.wikimediaUrl || "",
    page: image.page,
    author: image.author,
    license: image.license,
    licenseUrl: image.licenseUrl,
    file: image.file,
  }));
}

function shapesOf(feature: GenericFeature): Shape[] {
  return Array.isArray(feature.geometry) ? feature.geometry : [];
}

/** A site whose geometry is written in metres in features.json. */
export function buildGenericModel(pack: GenericPackage): SceneModel & {
  id: string;
  name: string;
  wikipedia?: string;
  catalogIssue: number | null;
  site: { latitude: number; longitude: number };
} {
  const latitude = pack.site.location?.latitude ?? 0;
  const longitude = pack.site.location?.longitude ?? 0;
  const features: BuiltFeature[] = pack.features.features.map((feature) => {
    const shapes = shapesOf(feature);
    return {
      id: feature.id,
      name: feature.name,
      group: feature.group,
      layer: feature.layer,
      accuracy: feature.accuracy,
      schematic: Boolean(feature.schematic),
      material: feature.material,
      evidence: feature.evidence ?? "verified",
      scene: feature.scene ?? "monument",
      parent: feature.parent,
      anchor: feature.anchor,
      summary: feature.description,
      description: feature.description,
      links: feature.links ?? [],
      facts: feature.facts ?? [],
      images: asImages(feature),
      sourceIds: Array.from(new Set((feature.facts ?? []).map((fact) => fact.sourceId))),
      shapes,
      meta: {},
    };
  });
  const shell = features.find((feature) => feature.shapes.some((shape) => shape.kind === "pyramid" || shape.kind === "stepped"));
  const shellShape = shell?.shapes.find((shape) => shape.kind === "pyramid" || shape.kind === "stepped");
  const baseM = shellShape && (shellShape.kind === "pyramid" || shellShape.kind === "stepped") ? shellShape.base : 10;
  const heightM = shellShape && (shellShape.kind === "pyramid" || shellShape.kind === "stepped") ? shellShape.height : 6;
  const entrance: Vec3 = { x: 0, y: heightM * 0.15, z: baseM / 2 };
  return {
    id: pack.site.id,
    name: pack.site.name,
    wikipedia: pack.site.wikipedia,
    catalogIssue: pack.site.catalogIssue ?? null,
    baseM,
    heightM,
    currentHeightM: heightM,
    orientationWestArcsec: pack.site.orientation?.westOfNorthArcsec ?? 0,
    entrance,
    features,
    site: { latitude, longitude },
  };
}
