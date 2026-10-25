# Ancient Atlas

An open-source, MIT-licensed 3D atlas of the ancient world. Version 1 is a sourced reconstruction of the **Great Pyramid of Khufu** at Giza: the original shell, the monument as it stands, and the passages, chambers, shafts and voids inside it.

**Live site:** [ancient-atlas-omega.vercel.app](https://ancient-atlas-omega.vercel.app)

The aim is the one a surveyor would recognise. Placement, orientation, scale and size come from published measurements. Where the sources disagree, the dataset records the range and the value that was drawn.

## What you can do

- Open the Earth and fly from space down to Giza, then step into the pyramid. The globe is a local copy of NASA's Blue Marble. It does not call a tile service and it does not need an API key.
- At the pyramid, drag to orbit. **Walk the ground** uses the mouse and WASD on the pavement, and stops at the casing. **Stand here** puts you inside a chamber. Walking the passages themselves is still to be built.
- Turn layers on and off: original casing, core masonry, interior, measurements, annotations, and a section plane that cuts the shell on the east side of the passages.
- Click any feature. The panel gives the measure, the citation, and a public-domain or Creative Commons picture where one is on file.

One unit in the pyramid scene is one metre.

## Run it

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

```bash
npm test          # geometry checked against the published figures
npm run validate  # the same tests
npm run build     # production build
npm start
```

No environment variables are required.

## Stack

Next.js (App Router) and TypeScript, with [three.js](https://github.com/mrdoob/three.js) and [react-three-fiber](https://github.com/pmndrs/react-three-fiber) for both the globe and the pyramid. One renderer, one coordinate story, and nothing that asks for a paid key.

CesiumJS was the other candidate for the globe. Cesium's high-resolution terrain and imagery go through Cesium ion, which is an account and a key. This version vendors a public-domain image instead, and treats the close view as a surveyed model rather than a photograph draped on a globe. Higher-resolution free imagery (for example NASA GIBS) is on the roadmap.

The Earth texture is NASA Visible Earth / Blue Marble, 2048×1024, public domain, saved at `public/textures/land-ocean-ice-2048.jpg`. See `public/textures/ATTRIBUTION.txt`.

## The data

`data/great-pyramid.json` is the ledger. Every dimension the mesh uses is a measure in that file, with a source id and a locator. The builder in `src/lib/pyramid-model.ts` does not invent a second set of numbers.

The surveys behind v1:

| Source | Used for |
| --- | --- |
| Petrie, *The Pyramids and Temples of Gizeh* (1883) | Casing angle, interior positions, passage sections, chambers, shafts |
| Cole, *Determination of the Exact Size and Orientation of the Great Pyramid* (1925) | Base lengths, side azimuths, pavement margin, surviving casing |
| Dash, AERAGRAM (2018), with the 2015 survey noted | WGS84 position of the summit mast and the offset to the base centre |
| Lehner, *The Complete Pyramids* (1997) | Identity of the interior system; not used to override a measured number |
| Morishima, Tayoubi et al., *Nature* (2017) | The Big Void |
| Procureur, Morishima et al., *Nature Communications* (2023) | The North Face Corridor |
| Vyse and Perring (1840), as quoted by Petrie | Apex of the relieving chambers |

`VALIDATION.md` lists every check, the tolerance, and the compromises: the mean square instead of four unequal sides, the schematic well and robbers' tunnel, the horizontal-only Big Void, the even split of the relieving chambers, and the rest. Read that before trusting a coordinate.

## Open work

The gaps in [VALIDATION.md](VALIDATION.md) are filed as issues [404](https://github.com/megalath/ancient-atlas/issues/404) through [416](https://github.com/megalath/ancient-atlas/issues/416). The Sphinx, the rest of the plateau, a timeline, and closer free imagery are [417](https://github.com/megalath/ancient-atlas/issues/417) through [420](https://github.com/megalath/ancient-atlas/issues/420). Khafre is already [#25](https://github.com/megalath/ancient-atlas/issues/25) and Menkaure is [#28](https://github.com/megalath/ancient-atlas/issues/28). Hundreds of other sites are under the regional milestones; please use those instead of opening a duplicate.

The token that opened 404–420 cannot create labels or milestones. Each title starts with the labels it should carry (`accuracy`, `data`, `layer`, `ui`, `roadmap`, `good first issue`) and the milestone it belongs on (`v1 Great Pyramid` or `Roadmap`).

## Contributing

Corrections are welcome, and a correction to a number needs a source. See [CONTRIBUTING.md](CONTRIBUTING.md). The useful issue templates are in `.github/ISSUE_TEMPLATE/`, including **Data correction with source**.

Good first contributions: a public-domain or Creative Commons photograph for a feature that has none, or a check of one Petrie length against Maragioglio and Rinaldi.

## Deploying on Vercel

The repository is a normal Next.js app.

- Framework preset: Next.js
- Build command: `npm run build`
- Install command: `npm install`
- Output: the default Next.js output
- Node.js: 20 or newer
- Environment variables: none
- API keys: none

The Earth image is in the repository, so the deployment does not fetch it at build time. Fonts are downloaded by `next/font` during the build, which needs network access to Google Fonts the first time. That is a build-time fetch of the font files, not a runtime key.

## Licence

[MIT](LICENSE). Code copyright 2026 Latham.

The surveys, papers and photographs stay under their own licences. Picture credits and licence links are on each feature in the dataset and in the panel. NASA Blue Marble is public domain.
