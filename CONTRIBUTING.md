# Add a site to the atlas

Ancient Atlas is a folder of site packages. Khufu, in `sites/khufu/`, is the reference. A new monument is another folder. The globe and the feature list pick it up from that folder. You do not edit a component to register it.

The definition of done is the checklist in the pull request template. `npm test`, `npm run validate`, and `npm run build` all have to pass. A feature panel that has no description, no openly licensed picture, or no source fails validation.

## 1. Pick an issue

The pinned master index is [issue 448](https://github.com/megalath/ancient-atlas/issues/448). Each pyramid still to be built has its own open issue. Comment there so two people do not survey the same monument. Khufu has no catalog issue because it is already the reference model. Every other site sets `catalogIssue` to that issue’s number.

## 2. Scaffold

```bash
npm install
npm run new-site -- menkaure
```

That writes:

```
sites/menkaure/site.json
sites/menkaure/features.json
sites/menkaure/sources.json
public/sites/menkaure/images/.gitkeep
```

The template does not validate. The coordinates are `0,0`, the description is a placeholder, and there is no picture and no source. Replace them. Do not open a pull request that still contains the placeholder.

## 3. Fill in the data, with sources

Read [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md) while you edit.

- `site.json` holds the place, the orientation, the unit, and the survey ledger. One unit is one metre. Latitude and longitude are WGS84 decimal degrees of a point you can cite. `orientation.westOfNorthArcsec` is how far the north face points west of true north. `catalogIssue` is the GitHub issue number.
- `sources.json` is the bibliography. A length needs the survey or the paper that measured it, with a stable URL and a page, section, plate, or table. Wikipedia is not a source for a length.
- `features.json` has one object per named part. The description is a few sentences: what it is, its dimensions with the citation named in the prose, and what is known or still debated. Every feature has at least one picture and a **Read more** list with a Wikipedia article and the scholarly source.

Pictures come from Wikimedia Commons and are CC, CC0, or public domain. "Copyrighted free use" is not accepted. Record the file URL, the author, the licence, the licence URL, and the Commons file page. Save the file under `public/sites/<id>/images/` and point `file` at `/sites/<id>/images/...`.

For a generic site, `geometry` is an array of shapes in metres. The frame matches Khufu: origin at the centre of the base, +X east, +Y up, +Z north, before the true-north yaw. Set `schematic: true` when a shape has to be drawn and the survey does not fix it, and say so in the description.

Khufu’s geometry is computed in `src/lib/pyramid-model.ts` from `site.json`. Its features keep `"geometry": { "providedBy": "builder" }`. Do not copy a second set of metres into `features.json`.

A correction to a number Khufu already draws goes in `sites/khufu/site.json`, keeps the previous figure under `disagreements` when the sources still disagree, and updates `tests/pyramid-model.test.ts` if a published literal changed.

## 4. Validate

```bash
npm run validate
npm test
```

`npm run validate` checks the schema, unique ids, a citation on every measure, coordinate ranges, orientation, metres as the unit, the description, the picture and its licence, the Read more links, that the image file is in the repo, and that `catalogIssue` is a real issue on this repository. `npm test` checks Khufu’s built geometry against the published figures, and that every feature still has a description, a licensed picture, and a source.

## 5. Preview

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The new site is a marker on the globe. Click a feature. The panel shows the description, at least one picture with the author and licence under it, and the Read more links. The address bar becomes `?site=<id>&feature=<feature-id>`. Reload that URL and the same feature comes back.

Check a phone-sized window as well, or the Playwright projects:

```bash
npx playwright install chromium
npm run test:e2e
```

On a narrow screen the list and the info panel are a bottom sheet, not a page below the canvas. Tap targets are at least 44 pixels. One finger orbits, a pinch zooms, two fingers pan.

## 6. Open the pull request

Use the pull request template. Include screenshots of the feature panel on desktop and on a phone. The test plan is `npm test`, `npm run validate`, and `npm run build`. End the description with `Closes #N`, using the catalog issue. Do not close an issue if the site is only a placeholder.

## Pictures, code, and conduct

A picture on a feature must be public domain, CC0, or a Creative Commons licence, with the author, the licence, a link to the file page, and a link to the licence.

```bash
npm install
npm test
npm run validate
npm run build
```

Keep new geometry in metres. Schematic geometry is allowed when a feature has to be drawn and the survey does not fix it.

Correct the work, cite the page, and leave the argument where someone else can check it. The point of the project is that a stranger can open the package and see why a wall is where it is.
