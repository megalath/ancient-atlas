# Site package format

Each monument is a directory `sites/<site-id>/` plus images in `public/sites/<site-id>/images/`. The id is lowercase words separated by hyphens, and it matches the directory name. `scripts/generate-registry.mjs` writes `src/lib/site-registry.generated.ts` from every `sites/*/site.json`. Do not edit the generated file. `npm run dev` and `npm run build` regenerate it.

JSON Schema for the three files lives in `schema/`. `npm run validate` checks the schema and the rules below.

## site.json

| Field | Required | Meaning |
| --- | --- | --- |
| `schemaVersion` | yes | `1` |
| `id` | yes | Same as the directory name |
| `name` | yes | Name shown on the globe and in the heading |
| `builder` | yes | `generic` for a site whose shapes are in `features.json`. `landscape` for terrain, runways, and a separate craft scene. `khufu` is reserved for the Great Pyramid survey reduction |
| `category` | no | `ancient` (the default) or `modern-mysteries`. The globe can filter on it |
| `catalogIssue` | yes | GitHub issue number for this monument, or `null` for Khufu only |
| `wikipedia` | no | URL of the article |
| `location.latitude`, `location.longitude` | generic sites | WGS84 decimal degrees. `0,0` is rejected |
| `orientation.westOfNorthArcsec` | generic sites | North face, west of true north, in arcseconds. A finite value inside half a turn |
| `scale.unit` | yes when `scale` is present | `m` |
| `metadata` | no | culture, period, monument, ruler |
| `measures` | Khufu | Ledger of published numbers. Each entry with a `value` has a `unit` and a `sourceId` |
| `frame` | Khufu | Origin at the centre of the casing base. +X east, +Y up, +Z north, before yaw. `inchToMetre` is `0.0254` |

Khufu stores the mast as DMS in `site.mast.latDms` and `site.mast.lonDms` instead of `location`. The builder turns that into decimal degrees. A generic site uses `location` directly.

Units on a measure are `m`, `in`, `mm`, `deg`, `arcmin`, `arcsec`, or `count`.

## sources.json

```json
{
  "schemaVersion": 1,
  "sources": [
    {
      "id": "petrie1883",
      "authors": "W. M. Flinders Petrie",
      "year": 1883,
      "title": "The Pyramids and Temples of Gizeh",
      "container": "Field & Tuer, London",
      "url": "https://www.ronaldbirdsall.com/gizeh/petrie/index.htm",
      "note": "What this publication is used for."
    }
  ]
}
```

Ids are unique. Every `sourceId` on a measure, a fact, or a link must be one of these ids.

## features.json

One object per named part:

| Field | Meaning |
| --- | --- |
| `id` | Unique inside the site. Used in `?feature=` |
| `name` | Label in the list and on the model |
| `group` | `Exterior`, `Passages`, `Chambers`, `Shafts`, `Voids`, `Intrusions`, `Terrain`, `Airfield`, `Installation`, `Craft`, or `Claims` |
| `layer` | `casing`, `core`, `interior`, or a landscape layer: `terrain`, `airfield`, `buildings`, `boundary`, `s4`, `hull`, `craft-interior` |
| `evidence` | `verified`, `testimony`, or `estimated`. Omitted means `verified`. A testimony or estimated feature cannot carry a verified fact. A verified fact cannot cite a testimony source. An estimated fact must say it is estimated |
| `scene` | `monument`, `terrain`, or `sport-model`. `sport-model` opens the craft cutaway instead of the landscape |
| `accuracy` | `surveyed`, `reconstructed`, `projected`, or `schematic` |
| `schematic` | `true` when a drawn number is not a published measurement |
| `material` | `casing`, `core`, `passage`, `granite`, `bedrock`, `shaft`, `void`, `forced`, or `chevron` |
| `description` | Several sentences. What it is, the dimensions with the citation, and what is known or debated. At least two sentences and 180 characters |
| `links` | Read more. One Wikipedia URL and at least one scholarly URL. A scholarly link may set `sourceId` |
| `images` | At least one. See below |
| `facts` | Optional rows of `label`, `value`, `sourceId`, `locator`. Khufu’s facts are produced by the builder from the ledger |
| `geometry` | Generic sites: a non-empty array of shapes in metres. Khufu: `{ "providedBy": "builder" }` |

### Images

```json
{
  "id": "gallery-adler",
  "title": "Looking up the Grand Gallery",
  "file": "/sites/khufu/images/gallery-adler.jpg",
  "wikimediaUrl": "https://upload.wikimedia.org/wikipedia/commons/a/ae/Great_Pyramid_of_Giza_Grand_Gallery.jpg",
  "page": "https://commons.wikimedia.org/wiki/File:Great_Pyramid_of_Giza_Grand_Gallery.jpg",
  "author": "Keith Adler",
  "license": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0"
}
```

`license` matches Creative Commons (`CC BY`, `CC BY-SA`, `CC0`) or `Public domain`. "Copyrighted free use" fails validation. A Commons picture uses a Commons `page` and a `wikimediaUrl` on `upload.wikimedia.org`. An open-data picture (Sentinel-2, a CC0 diagram) uses an https provider page and a local `file`. The panel prints the title, author, and licence under the image.

Prefer a photograph of the real feature and, where one exists, a section or diagram. Two or three images is the useful number.

### Geometry

Generic shapes use the same kinds as the Khufu builder:

- `{ "kind": "pyramid", "base": 230, "height": 146 }`
- `{ "kind": "stepped", "base": 100, "height": 60, "apexHeight": 70, "steps": 6 }`
- `{ "kind": "slab", "y": 0, "half": 120, "thickness": 0.5 }`
- `{ "kind": "aabb", "min": { "x": -2, "y": 0, "z": -5 }, "max": { "x": 2, "y": 4, "z": 5 } }`
- `{ "kind": "axis", "from": { "x": 0, "y": 1, "z": 10 }, "to": { "x": 0, "y": 8, "z": -10 }, "width": 1, "height": 1.2 }`

`base` and `height` are metres. The first pyramid or stepped solid is the shell used for the ground walk.

## What the validator rejects

- A feature with a short description, no picture, a picture without author, licence, and source page, a non-open licence, or a missing image file
- A feature without a Wikipedia link and a scholarly link
- A measure, fact, or link whose `sourceId` is not in `sources.json`
- Duplicate feature, source, or image ids
- Latitude or longitude outside WGS84, or the placeholder `0,0`
- An orientation that is not a finite arcsecond count
- A `catalogIssue` that is not a positive integer, or that is not an issue in `megalath/ancient-atlas` (Khufu may use `null`)
- A directory name that does not match `id`

`npm test` repeats the description, picture, and source rule against the built Khufu model, and checks that the feature ids in `features.json` are the ids the builder draws.
