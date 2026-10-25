"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { GlobeView } from "@/components/GlobeView";
import { LandscapeView } from "@/components/LandscapeView";
import { PyramidView, type LayerState } from "@/components/PyramidView";
import { loadAtlas, siteById, type AtlasSite, type AtlasSource } from "@/lib/atlas";
import { featureBounds } from "@/lib/bounds";
import { groundPosition, standPosition } from "@/lib/stand";
import {
  dataset,
  formatArcsec,
  formatDms,
  getPyramidModel,
  type BuiltFeature,
} from "@/lib/pyramid-model";

const GROUPS = [
  "Exterior",
  "Passages",
  "Chambers",
  "Shafts",
  "Voids",
  "Intrusions",
  "Terrain",
  "Airfield",
  "Installation",
  "Craft",
  "Claims",
] as const;

type CategoryFilter = "all" | "ancient" | "modern-mysteries";

const PRESETS: Record<string, LayerState> = {
  original: {
    casing: true,
    core: false,
    interior: false,
    measurements: true,
    annotations: true,
    section: false,
    casingOpacity: 1,
  },
  standing: {
    casing: false,
    core: true,
    interior: false,
    measurements: true,
    annotations: false,
    section: false,
    casingOpacity: 1,
  },
  cutaway: {
    casing: true,
    core: true,
    interior: true,
    measurements: true,
    annotations: true,
    section: true,
    casingOpacity: 0.12,
  },
  interior: {
    casing: false,
    core: false,
    interior: true,
    measurements: false,
    annotations: true,
    section: false,
    casingOpacity: 1,
  },
};

type Sheet = "layers" | "features" | "info";

function readQuery() {
  if (typeof window === "undefined") return { site: null as string | null, feature: null as string | null, view: null as string | null };
  const params = new URLSearchParams(window.location.search);
  return { site: params.get("site"), feature: params.get("feature"), view: params.get("view") };
}

function useCompact() {
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 860px)").matches : false,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 860px)");
    const apply = () => setCompact(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return compact;
}

export default function AtlasApp() {
  const sites = useMemo(() => loadAtlas(), []);
  const compact = useCompact();
  const initial = useMemo(() => readQuery(), []);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const visibleSites = sites.filter((item) => category === "all" || item.category === category);
  const [siteId, setSiteId] = useState<string>(
    initial.site && sites.some((item) => item.id === initial.site) ? initial.site : (sites.find((item) => item.id === "khufu")?.id ?? sites[0].id),
  );
  const site = siteById(sites, siteId);
  const model = site.model;
  const [view, setView] = useState<"globe" | "pyramid">(initial.view === "globe" && !initial.feature ? "globe" : "pyramid");
  const [preset, setPreset] = useState<string>("cutaway");
  const [layers, setLayers] = useState<LayerState>(PRESETS.cutaway);
  const [query, setQuery] = useState("");
  const [siteQuery, setSiteQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initial.feature ?? "grand-gallery");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mode, setMode] = useState<"orbit" | "walk">("orbit");
  const [standToken, setStandToken] = useState(0);
  const [standAt, setStandAt] = useState(groundPosition(model.baseM));
  const [collide, setCollide] = useState(true);
  const [flyToken, setFlyToken] = useState(0);
  const [focusToken, setFocusToken] = useState(() => (initial.feature ? 1 : 0));
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const stick = useRef({ x: 0, y: 0 });
  const restored = useRef(false);
  const pendingEnter = useRef<string | null>(null);
  const siteMatches = sites.filter((item) => {
    const needle = siteQuery.trim().toLowerCase();
    if (!needle) return true;
    return item.name.toLowerCase().includes(needle) || item.id.includes(needle) || item.category.replace("-", " ").includes(needle);
  });

  useEffect(() => {
    for (const node of document.querySelectorAll(".sheet, .rail.right .rail-scroll")) {
      if (!(node instanceof HTMLElement)) continue;
      const image = node.querySelector(".feature-lead img");
      node.scrollTop = 0;
      if (!(image instanceof HTMLElement)) continue;
      const scroller = node.getBoundingClientRect();
      const picture = image.getBoundingClientRect();
      if (picture.top >= scroller.top && picture.bottom <= scroller.bottom + 1) continue;
      const description = node.querySelector(".description");
      const overflow = picture.bottom - scroller.bottom + 12;
      if (overflow <= 0) continue;
      const descriptionTop = description instanceof HTMLElement ? description.getBoundingClientRect().top : scroller.top;
      const room = descriptionTop - scroller.top - 4;
      node.scrollTop = Math.max(0, Math.min(overflow, room));
    }
  }, [selectedId, sheet]);

  const selected = site.features.find((feature) => feature.id === selectedId) ?? null;
  const hovered = site.features.find((feature) => feature.id === hoveredId) ?? null;
  const pickInterior =
    layers.interior && ((!layers.casing && !layers.core) || layers.section || layers.casingOpacity < 0.45);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const requested = readQuery().feature;
    if (!requested) return;
    const owner = sites.find((item) => item.features.some((feature) => feature.id === requested));
    if (!owner) return;
    const feature = owner.features.find((item) => item.id === requested);
    setSiteId(owner.id);
    setSelectedId(requested);
    setView("pyramid");
    if (feature && feature.layer === "interior") {
      setPreset("cutaway");
      setLayers(PRESETS.cutaway);
    }
    setFocusToken((value) => (value > 0 ? value : 1));
    if (window.matchMedia("(max-width: 860px)").matches) setSheet("info");
  }, [sites]);

  function revealInterior(feature: BuiltFeature) {
    const inside = feature.layer === "interior" || feature.layer === "craft-interior" || feature.layer === "s4" || feature.scene === "sport-model";
    if (!inside) return;
    setLayers((current) => {
      const shellOn = current.casing || current.core;
      if (!shellOn) return { ...current, interior: true, annotations: true };
      return {
        ...current,
        interior: true,
        annotations: true,
        section: true,
        casingOpacity: Math.min(current.casingOpacity, 0.16),
      };
    });
    setPreset("custom");
  }

  function writeUrl(nextSite: string, featureId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("site", nextSite);
    url.searchParams.set("feature", featureId);
    url.searchParams.delete("view");
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
  }

  function enterSite(id: string) {
    const next = siteById(sites, id);
    const entryId =
      next.entryFeature && next.features.some((item) => item.id === next.entryFeature) ? next.entryFeature : (next.features[0]?.id ?? null);
    setSiteId(next.id);
    setView("pyramid");
    setSelectedId(entryId);
    setMode("orbit");
    setFocusToken((value) => value + 1);
    if (entryId) writeUrl(next.id, entryId);
    if (compact) setSheet("info");
  }

  function beginFly(id: string) {
    const next = siteById(sites, id);
    pendingEnter.current = next.id;
    setCategory("all");
    setSiteId(next.id);
    setView("globe");
    setFlyToken((value) => value + 1);
    window.dispatchEvent(new Event("atlas-fly"));
  }

  function onFlyArrived() {
    const id = pendingEnter.current;
    if (!id) return;
    pendingEnter.current = null;
    enterSite(id);
  }

  function followCrumb(key: string, featureId: string | null) {
    if (key === "globe") {
      pendingEnter.current = null;
      setMode("orbit");
      setView("globe");
      return;
    }
    if (featureId) focusFeature(featureId);
  }

  function focusFeature(id: string) {
    const feature = site.features.find((item) => item.id === id);
    if (!feature) return;
    setSelectedId(id);
    setView("pyramid");
    setMode("orbit");
    revealInterior(feature);
    setFocusToken((value) => value + 1);
    writeUrl(site.id, id);
    if (compact) setSheet("info");
  }

  function applyPreset(name: string) {
    setPreset(name);
    setLayers(PRESETS[name]);
  }

  function patchLayers(patch: Partial<LayerState>) {
    setPreset("custom");
    setLayers((current) => ({ ...current, ...patch }));
  }

  function walkOnGround() {
    setView("pyramid");
    setMode("walk");
    setCollide(true);
    if (site.builder === "landscape") {
      const feature = site.features.find((item) => item.id === selectedId);
      if (feature?.anchor) setStandAt({ x: feature.anchor.x, y: 1.7, z: feature.anchor.z });
      else if (feature) setStandAt(featureBounds(feature).center);
      else setStandAt({ x: 0, y: 1.7, z: 0 });
    } else {
      setStandAt(groundPosition(model.baseM));
    }
    setStandToken((value) => value + 1);
    window.dispatchEvent(new Event("atlas-lock"));
    if (compact) setSheet(null);
  }

  function standIn(feature: BuiltFeature) {
    setView("pyramid");
    setMode("walk");
    setCollide(feature.layer !== "interior");
    setStandAt(standPosition(feature, model.baseM));
    setStandToken((value) => value + 1);
    window.dispatchEvent(new Event("atlas-lock"));
    setSelectedId(feature.id);
    writeUrl(site.id, feature.id);
    if (compact) setSheet(null);
  }

  const featureList = (
    <FeatureList
      features={site.features}
      query={query}
      onQuery={setQuery}
      selectedId={selectedId}
      onSelect={focusFeature}
    />
  );
  const layerControls = (
    <LayerControls
      view={view}
      onView={setView}
      preset={preset}
      onPreset={applyPreset}
      layers={layers}
      onPatch={patchLayers}
      mode={mode}
      onOrbit={() => setMode("orbit")}
      onWalk={walkOnGround}
      onFly={() => {
        setFlyToken((value) => value + 1);
        window.dispatchEvent(new Event("atlas-fly"));
      }}
      sites={visibleSites}
      siteId={site.id}
      onSite={view === "globe" ? beginFly : enterSite}
      category={category}
      onCategory={setCategory}
      landscape={site.builder === "landscape"}
      craft={selected?.scene === "sport-model"}
    />
  );
  const crumbItems = locationCrumbs(site, selected, view);
  const panel = selected ? (
    <FeatureCard feature={selected} sources={site.sources} khufu={site.id === "khufu"} onStand={() => standIn(selected)} />
  ) : (
    <Intro khufu={site.id === "khufu"} />
  );

  return (
    <div className={compact ? "app is-compact" : "app"}>
      {compact ? null : (
        <aside className="rail left">
          <div className="rail-scroll">
            <Brand site={site} />
            {layerControls}
            {featureList}
          </div>
        </aside>
      )}
      <main className="stage">
        <nav className="crumbs" aria-label="Location">
          {crumbItems.map((item, index) => {
            const label = item.key === "globe" && view !== "globe" ? "Back to globe" : item.label;
            const current = index === crumbItems.length - 1;
            return (
              <span key={item.key} className="crumb">
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                {current ? (
                  <span aria-current="page">{label}</span>
                ) : (
                  <button type="button" onClick={() => followCrumb(item.key, item.featureId)}>
                    {label}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
        {view === "globe" ? (
          <form
            className="site-jump"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              if (siteMatches[0]) beginFly(siteMatches[0].id);
            }}
          >
            <label htmlFor="site-search">Search sites</label>
            <input
              id="site-search"
              value={siteQuery}
              onChange={(event) => setSiteQuery(event.target.value)}
              placeholder="Search every site"
              autoComplete="off"
            />
            <ul>
              {siteMatches.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => beginFly(item.id)}>
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          </form>
        ) : null}
        {view === "globe" ? (
          <GlobeView
            sites={visibleSites.map((item) => ({
              id: item.id,
              name: item.name,
              latitude: item.latitude,
              longitude: item.longitude,
            }))}
            latitude={site.latitude}
            longitude={site.longitude}
            flyToken={flyToken}
            mobile={compact}
            onEnter={beginFly}
            onArrived={onFlyArrived}
          />
        ) : site.builder === "landscape" ? (
          <LandscapeView
            site={site}
            layers={layers}
            selectedId={selectedId}
            onSelect={focusFeature}
            onHover={setHoveredId}
            focusToken={focusToken}
            mobile={compact}
            mode={mode}
            stick={stick}
            standToken={standToken}
            standAt={standAt}
          />
        ) : (
          <PyramidView
            model={model}
            layers={layers}
            selectedId={selectedId}
            onSelect={focusFeature}
            onHover={setHoveredId}
            mode={mode}
            standToken={standToken}
            standAt={standAt}
            collide={collide}
            focusToken={focusToken}
            mobile={compact}
            stick={stick}
            pickInterior={pickInterior}
          />
        )}
        {hovered && hovered.id !== selectedId ? (
          <p className="hover-chip" role="status">
            {hovered.name}
          </p>
        ) : null}
        {compact && mode === "walk" && view === "pyramid" ? <Joystick stick={stick} /> : null}
        {compact && sheet === null && selected ? (
          <button type="button" className="selection-bar" onClick={() => setSheet("info")}>
            {selected.name}
          </button>
        ) : null}
        {compact && sheet ? (
          <section className="sheet" aria-label={sheet === "info" ? "Feature information" : sheet}>
            {sheet === "layers" ? (
              <>
                <Brand site={site} />
                {layerControls}
              </>
            ) : null}
            {sheet === "features" ? featureList : null}
            {sheet === "info" ? panel : null}
          </section>
        ) : null}
        {compact ? (
          <nav className="dock" aria-label="Panels">
            <button type="button" aria-pressed={sheet === "layers"} onClick={() => setSheet(sheet === "layers" ? null : "layers")}>
              Layers
            </button>
            <button type="button" aria-pressed={sheet === "features"} onClick={() => setSheet(sheet === "features" ? null : "features")}>
              Features
            </button>
            <button type="button" aria-pressed={sheet === "info"} onClick={() => setSheet(sheet === "info" ? null : "info")}>
              Info
            </button>
            <button type="button" aria-pressed={mode === "walk"} onClick={() => (mode === "walk" ? setMode("orbit") : walkOnGround())}>
              {mode === "walk" ? "Orbit" : "Walk"}
            </button>
          </nav>
        ) : (
          <div className="hud">
            <p>
              {view === "globe"
                ? "Drag to spin the Earth from site to site. Search, or tap a marker, to fly down."
                : mode === "walk"
                  ? "Click the view to look. WASD walks, Shift hurries, Esc releases the mouse. On a phone, drag to look, use the joystick, or tap the ground."
                  : "Drag to orbit. Pinch to zoom, two fingers to pan. Click a feature for its description, pictures, and sources."}
            </p>
            <p className="credit">
              {view === "globe"
                ? "NASA Blue Marble · public domain"
                : site.builder === "landscape"
                  ? "Sentinel-2 cloudless, EOX, CC BY 4.0 · SRTM public domain"
                  : "Survey figures are cited in the panel"}
            </p>
          </div>
        )}
      </main>
      {compact ? null : (
        <aside className="rail right">
          <div className="rail-scroll">{panel}</div>
        </aside>
      )}
    </div>
  );
}

function locationCrumbs(site: AtlasSite, selected: BuiltFeature | null, view: "globe" | "pyramid") {
  const items: { key: string; label: string; featureId: string | null }[] = [{ key: "globe", label: "Globe", featureId: null }];
  if (view === "globe") return items;
  const entry = site.entryFeature && site.features.some((item) => item.id === site.entryFeature) ? site.entryFeature : (site.features[0]?.id ?? null);
  items.push({ key: "site", label: site.name, featureId: entry });
  if (!selected) return items;
  const chain: BuiltFeature[] = [];
  const guard = new Set<string>();
  let current: BuiltFeature | undefined = selected;
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    chain.push(current);
    const parentId: string | undefined = current.parent;
    current = parentId ? site.features.find((item) => item.id === parentId) : undefined;
  }
  chain.reverse();
  for (const feature of chain) items.push({ key: feature.id, label: feature.name, featureId: feature.id });
  return items;
}

function Brand({ site }: { site: AtlasSite }) {
  const category = site.category === "modern-mysteries" ? "Modern mysteries" : "Ancient sites";
  return (
    <>
      <p className="eyebrow">Ancient Atlas · {category}</p>
      <h1>{site.name}</h1>
      <p className="lede">
        {formatDms(Math.abs(site.latitude))} {site.latitude >= 0 ? "N" : "S"}, {formatDms(Math.abs(site.longitude))}{" "}
        {site.longitude >= 0 ? "E" : "W"}.
        {site.builder === "khufu"
          ? ` North face ${formatArcsec(site.model.orientationWestArcsec)} west of true north.`
          : " Open imagery and published lengths. Testimony is marked as testimony."}
      </p>
    </>
  );
}

function LayerControls({
  view,
  onView,
  preset,
  onPreset,
  layers,
  onPatch,
  mode,
  onOrbit,
  onWalk,
  onFly,
  sites,
  siteId,
  onSite,
  category,
  onCategory,
  landscape,
  craft,
}: {
  view: "globe" | "pyramid";
  onView: (view: "globe" | "pyramid") => void;
  preset: string;
  onPreset: (name: string) => void;
  layers: LayerState;
  onPatch: (patch: Partial<LayerState>) => void;
  mode: "orbit" | "walk";
  onOrbit: () => void;
  onWalk: () => void;
  onFly: () => void;
  sites: AtlasSite[];
  siteId: string;
  onSite: (id: string) => void;
  category: CategoryFilter;
  onCategory: (category: CategoryFilter) => void;
  landscape: boolean;
  craft: boolean;
}) {
  return (
    <>
      <div className="switch" role="group" aria-label="View">
        <button type="button" aria-pressed={view === "globe"} onClick={() => onView("globe")}>
          Globe
        </button>
        <button type="button" aria-pressed={view === "pyramid"} onClick={() => onView("pyramid")}>
          {landscape ? "Site" : "Pyramid"}
        </button>
      </div>
      <div className="switch categories" role="group" aria-label="Site categories">
        {(
          [
            ["all", "All"],
            ["ancient", "Ancient sites"],
            ["modern-mysteries", "Modern mysteries"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={category === id} onClick={() => onCategory(id)}>
            {label}
          </button>
        ))}
      </div>
      {sites.length > 1 ? (
        <>
          <h3>Sites</h3>
          <ul className="group-list">
            {sites.map((item) => (
              <li key={item.id}>
                <button type="button" aria-current={item.id === siteId} aria-label={item.name} onClick={() => onSite(item.id)}>
                  <span>{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {view === "globe" ? (
        <div className="tools">
          <button type="button" className="preset" onClick={onFly}>
            Fly to this site
          </button>
          <button type="button" className="preset" onClick={() => onView("pyramid")}>
            {landscape ? "Enter the site" : "Enter the monument"}
          </button>
        </div>
      ) : (
        <>
          <h3>Presets</h3>
          <div className="presets">
            {(landscape
              ? [
                  ["original", "Terrain"],
                  ["standing", "Airfield"],
                  ["cutaway", "Cutaway"],
                  ["interior", "Interior"],
                ]
              : [
                  ["original", "Original casing"],
                  ["standing", "As it stands"],
                  ["cutaway", "Cutaway"],
                  ["interior", "Interior"],
                ]
            ).map(([id, label]) => (
              <button key={id} type="button" className="preset" aria-pressed={preset === id} onClick={() => onPreset(id)}>
                {label}
              </button>
            ))}
          </div>
          <h3>Layers</h3>
          <ul className="layers">
            <li>
              <input id="layer-casing" type="checkbox" checked={layers.casing} onChange={(event) => onPatch({ casing: event.target.checked })} />
              <label htmlFor="layer-casing">{craft ? "Hull" : landscape ? "Terrain" : "Casing"}</label>
            </li>
            {layers.casing ? (
              <li className="slider">
                <label htmlFor="casing-opacity">Opacity</label>
                <input
                  id="casing-opacity"
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.01}
                  value={layers.casingOpacity}
                  onChange={(event) => onPatch({ casingOpacity: Number(event.target.value) })}
                />
              </li>
            ) : null}
            {craft ? null : (
              <li>
                <input id="layer-core" type="checkbox" checked={layers.core} onChange={(event) => onPatch({ core: event.target.checked })} />
                <label htmlFor="layer-core">{landscape ? "Airfield and base" : "Core masonry"}</label>
              </li>
            )}
            <li>
              <input id="layer-interior" type="checkbox" checked={layers.interior} onChange={(event) => onPatch({ interior: event.target.checked })} />
              <label htmlFor="layer-interior">{craft ? "Craft interior" : landscape ? "S-4 (testimony)" : "Interior"}</label>
            </li>
            <li>
              <input id="layer-measure" type="checkbox" checked={layers.measurements} onChange={(event) => onPatch({ measurements: event.target.checked })} />
              <label htmlFor="layer-measure">{landscape && !craft ? "Restricted boundary" : "Measurements"}</label>
            </li>
            <li>
              <input id="layer-notes" type="checkbox" checked={layers.annotations} onChange={(event) => onPatch({ annotations: event.target.checked })} />
              <label htmlFor="layer-notes">Annotations</label>
            </li>
            <li>
              <input id="layer-section" type="checkbox" checked={layers.section} onChange={(event) => onPatch({ section: event.target.checked })} />
              <label htmlFor="layer-section">{landscape ? "Cutaway" : "Section plane"}</label>
            </li>
          </ul>
          <div className="tools">
            <button type="button" className="tool" aria-pressed={mode === "orbit"} onClick={onOrbit}>
              Orbit
            </button>
            <button type="button" className="tool" aria-pressed={mode === "walk"} onClick={onWalk}>
              Walk the ground
            </button>
          </div>
        </>
      )}
    </>
  );
}

function FeatureList({
  features,
  query,
  onQuery,
  selectedId,
  onSelect,
}: {
  features: BuiltFeature[];
  query: string;
  onQuery: (value: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const needle = query.trim().toLowerCase();
  const visible = features.filter((feature) => {
    if (!needle) return true;
    return (
      feature.name.toLowerCase().includes(needle) ||
      feature.id.includes(needle) ||
      feature.description.toLowerCase().includes(needle)
    );
  });
  return (
    <>
      <h3>Features</h3>
      <input
        className="search"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder="Search the monument"
        aria-label="Search features"
      />
      {GROUPS.map((group) => {
        const items = visible.filter((feature) => feature.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group}>
            <h3>{group}</h3>
            <ul className="group-list">
              {items.map((feature) => (
                <li key={feature.id}>
                  <button type="button" aria-label={feature.name} aria-current={feature.id === selectedId} onClick={() => onSelect(feature.id)}>
                    <span>{feature.name}</span>
                    <small aria-hidden="true">{feature.evidence}</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function Intro({ khufu }: { khufu: boolean }) {
  if (!khufu) {
    return (
      <>
        <p className="eyebrow">Site</p>
        <h2>Choose a feature</h2>
        <p className="description">Select a named part of the monument. The panel gives a description, the dimensions with their citations, pictures, and further reading.</p>
      </>
    );
  }
  const model = getPyramidModel();
  return (
    <>
      <p className="eyebrow">Version 1</p>
      <h2>One pyramid, measured</h2>
      <p className="description">
        The shell is Cole’s mean base of {model.baseM.toFixed(3)} m and Petrie’s casing angle of {formatDms(model.faceAngleDeg)},
        which fixes the original height at {model.heightM.toFixed(3)} m. The core is drawn to {model.currentHeightM.toFixed(1)} m.
        Interior positions are Petrie’s inches, converted at exactly 25.4 mm, and left on his centre.
      </p>
      <Disagreements />
      <h3>Sources</h3>
      <ul className="facts">
        {dataset.sources.map((source) => (
          <li key={source.id}>
            <strong>
              {source.authors}, {source.year}
            </strong>
            <span>{source.title}</span>
            <cite>
              <a href={source.url}>{source.container ?? source.url}</a>
            </cite>
          </li>
        ))}
      </ul>
    </>
  );
}

function FeatureCard({
  feature,
  sources,
  khufu,
  onStand,
}: {
  feature: BuiltFeature;
  sources: AtlasSource[];
  khufu: boolean;
  onStand: () => void;
}) {
  return (
    <article className="feature-panel" data-testid="feature-panel">
      <p className="eyebrow">{feature.group}</p>
      <h2>{feature.name}</h2>
      <p>
        <span className={`badge ${feature.evidence}`}>{feature.evidence}</span>
        <span className={`badge ${feature.accuracy}`}>{feature.accuracy}</span>
        {feature.schematic ? <span className="badge schematic">schematic part</span> : null}
      </p>
      <p className="description">{feature.description}</p>
      {khufu ? (
        <div className="tools">
          <button type="button" className="text-button" onClick={onStand}>
            {feature.layer === "interior" ? "Stand here" : "Stand beside it"}
          </button>
        </div>
      ) : null}
      <div className="figures">
        {feature.images.map((image) => (
          <figure key={image.id}>
            <img src={image.url} alt={image.title} />
            <figcaption>
              {image.title}. {image.author}, {image.license}.{" "}
              <a href={image.page}>Source</a>
              {image.licenseUrl ? (
                <>
                  {" "}
                  · <a href={image.licenseUrl}>licence</a>
                </>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>
      <h3>Read more</h3>
      <ul className="read-more">
        {feature.links.map((link) => (
          <li key={link.url}>
            <a href={link.url}>{link.label}</a>
          </li>
        ))}
      </ul>
      <h3>Measures</h3>
      <ul className="facts">
        {feature.facts.map((fact) => {
          const source = sources.find((item) => item.id === fact.sourceId) ?? dataset.sources.find((item) => item.id === fact.sourceId);
          const evidence = fact.evidence ?? "verified";
          return (
            <li key={`${fact.label}-${fact.value}`}>
              <span>
                {fact.label} <span className={`badge ${evidence}`}>{evidence}</span>
              </span>
              <strong>{fact.value}</strong>
              <cite>
                {source ? (
                  <a href={source.url}>
                    {source.authors.split(",")[0]} {source.year}
                  </a>
                ) : (
                  fact.sourceId
                )}
                {fact.locator ? ` · ${fact.locator}` : ""}
              </cite>
            </li>
          );
        })}
      </ul>
      {khufu ? <Disagreements /> : null}
    </article>
  );
}

function Disagreements() {
  return (
    <details>
      <summary>Where the sources differ</summary>
      {dataset.disagreements.map((row) => (
        <div className="disagree" key={row.quantity}>
          <strong>{row.quantity}</strong>
          <p>Chosen: {row.chosen}</p>
          <p>Range: {row.range}</p>
          <p>{row.why}</p>
        </div>
      ))}
    </details>
  );
}

function Joystick({ stick }: { stick: MutableRefObject<{ x: number; y: number }> }) {
  const pad = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef(false);

  function place(clientX: number, clientY: number) {
    const rect = pad.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = (clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const dy = (clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    const len = Math.hypot(dx, dy);
    const scale = len > 1 ? 1 / len : 1;
    const x = dx * scale;
    const y = dy * scale;
    stick.current = { x, y: -y };
    if (knob.current) knob.current.style.transform = `translate(calc(-50% + ${x * 32}px), calc(-50% + ${y * 32}px))`;
  }

  function end() {
    active.current = false;
    stick.current = { x: 0, y: 0 };
    if (knob.current) knob.current.style.transform = "translate(-50%, -50%)";
  }

  return (
    <div
      className="joystick"
      ref={pad}
      role="application"
      aria-label="Walk joystick"
      onPointerDown={(event) => {
        active.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        place(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (active.current) place(event.clientX, event.clientY);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="joystick-knob" ref={knob} />
    </div>
  );
}
