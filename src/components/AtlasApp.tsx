"use client";

import { useMemo, useState } from "react";
import { GlobeView } from "@/components/GlobeView";
import { PyramidView, type LayerState } from "@/components/PyramidView";
import { groundPosition, standPosition } from "@/lib/stand";
import {
  dataset,
  formatArcsec,
  formatDms,
  getPyramidModel,
  type BuiltFeature,
} from "@/lib/pyramid-model";

const GROUPS = ["Exterior", "Passages", "Chambers", "Shafts", "Voids", "Intrusions"] as const;

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

export default function AtlasApp() {
  const model = useMemo(() => getPyramidModel(), []);
  const [view, setView] = useState<"globe" | "pyramid">("pyramid");
  const [preset, setPreset] = useState<string>("cutaway");
  const [layers, setLayers] = useState<LayerState>(PRESETS.cutaway);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>("grand-gallery");
  const [mode, setMode] = useState<"orbit" | "walk">("orbit");
  const [standToken, setStandToken] = useState(0);
  const [standAt, setStandAt] = useState(groundPosition(model.baseM));
  const [collide, setCollide] = useState(true);
  const [flyToken, setFlyToken] = useState(0);

  const selected = model.features.find((feature) => feature.id === selectedId) ?? null;
  const needle = query.trim().toLowerCase();
  const features = model.features.filter((feature) => {
    if (!needle) return true;
    return feature.name.toLowerCase().includes(needle) || feature.id.includes(needle);
  });

  function applyPreset(name: string) {
    setPreset(name);
    setLayers(PRESETS[name]);
  }

  function patchLayers(patch: Partial<LayerState>) {
    setPreset("custom");
    setLayers((current) => ({ ...current, ...patch }));
  }

  function choose(id: string) {
    setSelectedId(id);
    if (view !== "pyramid") setView("pyramid");
  }

  function walkOnGround() {
    setView("pyramid");
    setMode("walk");
    setCollide(true);
    setStandAt(groundPosition(model.baseM));
    setStandToken((value) => value + 1);
    window.dispatchEvent(new Event("atlas-lock"));
  }

  function standIn(feature: BuiltFeature) {
    setView("pyramid");
    setMode("walk");
    setCollide(feature.layer !== "interior");
    setStandAt(standPosition(feature, model.baseM));
    setStandToken((value) => value + 1);
    window.dispatchEvent(new Event("atlas-lock"));
    setSelectedId(feature.id);
  }

  return (
    <div className="app">
      <aside className="rail left">
        <div className="rail-scroll">
          <p className="eyebrow">Ancient Atlas</p>
          <h1>Great Pyramid of Khufu</h1>
          <p className="lede">
            {formatDms(model.site.latitude)} N, {formatDms(model.site.longitude)} E. North face{" "}
            {formatArcsec(model.orientationWestArcsec)} west of true north.
          </p>
          <div className="switch" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "globe"} onClick={() => setView("globe")}>
              Globe
            </button>
            <button type="button" aria-pressed={view === "pyramid"} onClick={() => setView("pyramid")}>
              Pyramid
            </button>
          </div>
          {view === "globe" ? (
            <div className="tools">
              <button
                type="button"
                className="preset"
                onClick={() => {
                  setFlyToken((value) => value + 1);
                  window.dispatchEvent(new Event("atlas-fly"));
                }}
              >
                Fly to Giza
              </button>
              <button type="button" className="preset" onClick={() => setView("pyramid")}>
                Enter the pyramid
              </button>
            </div>
          ) : (
            <>
              <h3>Presets</h3>
              <div className="presets">
                {(
                  [
                    ["original", "Original casing"],
                    ["standing", "As it stands"],
                    ["cutaway", "Cutaway"],
                    ["interior", "Interior"],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} type="button" className="preset" aria-pressed={preset === id} onClick={() => applyPreset(id)}>
                    {label}
                  </button>
                ))}
              </div>
              <h3>Layers</h3>
              <ul className="layers">
                <li>
                  <input id="layer-casing" type="checkbox" checked={layers.casing} onChange={(event) => patchLayers({ casing: event.target.checked })} />
                  <label htmlFor="layer-casing">Casing</label>
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
                      onChange={(event) => patchLayers({ casingOpacity: Number(event.target.value) })}
                    />
                  </li>
                ) : null}
                <li>
                  <input id="layer-core" type="checkbox" checked={layers.core} onChange={(event) => patchLayers({ core: event.target.checked })} />
                  <label htmlFor="layer-core">Core masonry</label>
                </li>
                <li>
                  <input id="layer-interior" type="checkbox" checked={layers.interior} onChange={(event) => patchLayers({ interior: event.target.checked })} />
                  <label htmlFor="layer-interior">Interior</label>
                </li>
                <li>
                  <input id="layer-measure" type="checkbox" checked={layers.measurements} onChange={(event) => patchLayers({ measurements: event.target.checked })} />
                  <label htmlFor="layer-measure">Measurements</label>
                </li>
                <li>
                  <input id="layer-notes" type="checkbox" checked={layers.annotations} onChange={(event) => patchLayers({ annotations: event.target.checked })} />
                  <label htmlFor="layer-notes">Annotations</label>
                </li>
                <li>
                  <input id="layer-section" type="checkbox" checked={layers.section} onChange={(event) => patchLayers({ section: event.target.checked })} />
                  <label htmlFor="layer-section">Section plane</label>
                </li>
              </ul>
              <div className="tools">
                <button type="button" className="tool" aria-pressed={mode === "orbit"} onClick={() => setMode("orbit")}>
                  Orbit
                </button>
                <button type="button" className="tool" aria-pressed={mode === "walk"} onClick={walkOnGround}>
                  Walk the ground
                </button>
              </div>
            </>
          )}
          <h3>Features</h3>
          <input
            className="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the monument"
            aria-label="Search features"
          />
          {GROUPS.map((group) => {
            const items = features.filter((feature) => feature.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group}>
                <h3>{group}</h3>
                <ul className="group-list">
                  {items.map((feature) => (
                    <li key={feature.id}>
                      <button type="button" aria-current={feature.id === selectedId} onClick={() => choose(feature.id)}>
                        <span>{feature.name}</span>
                        <small>{feature.accuracy}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </aside>
      <main className="stage">
        {view === "globe" ? <GlobeView flyToken={flyToken} /> : (
          <PyramidView
            layers={layers}
            selectedId={selectedId}
            onSelect={choose}
            mode={mode}
            standToken={standToken}
            standAt={standAt}
            collide={collide}
          />
        )}
        <div className="hud">
          <p>
            {view === "globe"
              ? "Drag to orbit the Earth. The marker is Giza. Blue Marble is a public-domain NASA mosaic, about 20 km a pixel, so the pyramid itself is the next view."
              : mode === "walk"
                ? "Click the view to look. WASD walks, Shift hurries, Esc releases the mouse. The shell keeps you on the pavement; chambers are a place you stand, not a corridor you squeeze through."
                : "Drag to orbit. Click a stone for its sources. The section removes the east side of the shell along the passages. One unit is one metre."}
          </p>
          <p className="credit">NASA Blue Marble · public domain</p>
        </div>
      </main>
      <aside className="rail right">
        <div className="rail-scroll">
          {selected ? (
            <FeatureCard feature={selected} onStand={() => standIn(selected)} />
          ) : (
            <Intro />
          )}
        </div>
      </aside>
    </div>
  );
}

function Intro() {
  const model = getPyramidModel();
  return (
    <>
      <p className="eyebrow">Version 1</p>
      <h2>One pyramid, measured</h2>
      <p className="summary">
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

function FeatureCard({ feature, onStand }: { feature: BuiltFeature; onStand: () => void }) {
  return (
    <>
      <p className="eyebrow">{feature.group}</p>
      <h2>{feature.name}</h2>
      <p>
        <span className={`badge ${feature.accuracy}`}>{feature.accuracy}</span>
        {feature.schematic ? <span className="badge schematic">schematic part</span> : null}
      </p>
      <p className="summary">{feature.summary}</p>
      <div className="tools">
        <button type="button" className="text-button" onClick={onStand}>
          {feature.layer === "interior" ? "Stand here" : "Stand beside it"}
        </button>
      </div>
      {feature.images.length > 0 ? (
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
      ) : (
        <p className="note">No public-domain or Creative Commons photograph is attached to this feature yet.</p>
      )}
      <h3>Measures</h3>
      <ul className="facts">
        {feature.facts.map((fact) => {
          const source = dataset.sources.find((item) => item.id === fact.sourceId);
          return (
            <li key={`${fact.label}-${fact.value}`}>
              <span>{fact.label}</span>
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
      <Disagreements />
    </>
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
