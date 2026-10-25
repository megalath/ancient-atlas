import { buildGenericModel, type GenericPackage } from "./generic-site";
import { getPyramidModel, type BuiltFeature, type SceneModel } from "./pyramid-model";
import { sitePackages } from "./site-registry.generated";

export type AtlasSite = {
  id: string;
  name: string;
  wikipedia?: string;
  catalogIssue: number | null;
  latitude: number;
  longitude: number;
  model: SceneModel;
  features: BuiltFeature[];
};

function khufuSite(): AtlasSite {
  const model = getPyramidModel();
  const pack = sitePackages.find((item) => item.site.id === "khufu");
  return {
    id: "khufu",
    name: pack?.site.name ?? "Great Pyramid of Khufu",
    wikipedia: pack?.site.wikipedia,
    catalogIssue: pack?.site.catalogIssue ?? null,
    latitude: model.site.latitude,
    longitude: model.site.longitude,
    model,
    features: model.features,
  };
}

/** Every folder under sites/ is discovered by the generated registry, not by a hand-written list. */
export function loadAtlas(): AtlasSite[] {
  return sitePackages.map((pack) => {
    if (pack.site.builder === "khufu") return khufuSite();
    const generic = buildGenericModel(pack as unknown as GenericPackage);
    return {
      id: generic.id,
      name: generic.name,
      wikipedia: generic.wikipedia,
      catalogIssue: generic.catalogIssue,
      latitude: generic.site.latitude,
      longitude: generic.site.longitude,
      model: generic,
      features: generic.features,
    };
  });
}

export function siteById(sites: AtlasSite[], id: string | null): AtlasSite {
  return sites.find((site) => site.id === id) ?? sites[0];
}
