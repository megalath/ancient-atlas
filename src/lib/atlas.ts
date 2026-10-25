import { buildGenericModel, type GenericPackage } from "./generic-site";
import { getPyramidModel, type BuiltFeature, type SceneModel } from "./pyramid-model";
import { sitePackages } from "./site-registry.generated";

export type AtlasSource = {
  id: string;
  authors: string;
  year: number;
  title: string;
  url: string;
  container?: string;
  note?: string;
  kind?: "record" | "testimony" | "estimate";
};

export type TerrainGrid = {
  cols: number;
  rows: number;
  west: number;
  south: number;
  east: number;
  north: number;
  datumM: number;
  heights: string;
  image: string;
  imageWest: number;
  imageSouth: number;
  imageEast: number;
  imageNorth: number;
};

export type AtlasSite = {
  id: string;
  name: string;
  builder: string;
  category: "ancient" | "modern-mysteries";
  wikipedia?: string;
  catalogIssue: number | null;
  latitude: number;
  longitude: number;
  model: SceneModel;
  features: BuiltFeature[];
  sources: AtlasSource[];
  terrain?: TerrainGrid;
};

type PackageSite = {
  id: string;
  name?: string;
  builder?: string;
  category?: "ancient" | "modern-mysteries";
  wikipedia?: string;
  catalogIssue?: number | null;
  terrain?: TerrainGrid;
};

function sourcesOf(pack: (typeof sitePackages)[number]): AtlasSource[] {
  return pack.sources.sources.map((source) => ({
    id: source.id,
    authors: source.authors,
    year: source.year,
    title: source.title,
    url: source.url,
    container: source.container,
    note: source.note,
    kind: "kind" in source && (source.kind === "record" || source.kind === "testimony" || source.kind === "estimate") ? source.kind : undefined,
  }));
}

function khufuSite(): AtlasSite {
  const model = getPyramidModel();
  const pack = sitePackages.find((item) => item.site.id === "khufu");
  const site = pack?.site as PackageSite | undefined;
  return {
    id: "khufu",
    name: site?.name ?? "Great Pyramid of Khufu",
    builder: "khufu",
    category: site?.category ?? "ancient",
    wikipedia: site?.wikipedia,
    catalogIssue: site?.catalogIssue ?? null,
    latitude: model.site.latitude,
    longitude: model.site.longitude,
    model,
    features: model.features,
    sources: pack ? sourcesOf(pack) : [],
  };
}

/** Every folder under sites/ is discovered by the generated registry, not by a hand-written list. */
export function loadAtlas(): AtlasSite[] {
  return sitePackages.map((pack) => {
    const site = pack.site as PackageSite;
    if (site.builder === "khufu") return khufuSite();
    const generic = buildGenericModel(pack as unknown as GenericPackage);
    return {
      id: generic.id,
      name: generic.name,
      builder: site.builder ?? "generic",
      category: site.category ?? "ancient",
      wikipedia: generic.wikipedia,
      catalogIssue: generic.catalogIssue,
      latitude: generic.site.latitude,
      longitude: generic.site.longitude,
      model: generic,
      features: generic.features,
      sources: sourcesOf(pack),
      terrain: site.terrain,
    };
  });
}

export function siteById(sites: AtlasSite[], id: string | null): AtlasSite {
  return sites.find((site) => site.id === id) ?? sites[0];
}
