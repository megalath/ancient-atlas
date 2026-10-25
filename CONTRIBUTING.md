# Contributing

Ancient Atlas is accurate only if the numbers can be traced. A pull request that changes a dimension, a coordinate, or a citation should start from `data/great-pyramid.json` and should say where the new figure comes from.

## A data correction

Open an issue with the **Data correction with source** template, or send a pull request that does all of this:

1. Change the measure in `data/great-pyramid.json`. Keep the previous figure in `disagreements` when the sources still disagree, and say which value is drawn and why.
2. Give the measure a `sourceId` that already exists, or add the publication under `sources` with a stable URL. A blog post that does not cite a survey is not enough.
3. Name the page, section, plate or table in `locator`.
4. Let the mesh follow the JSON. Do not hard-code a second copy of the number in a component.
5. Update `tests/pyramid-model.test.ts` if the published literal it checks has changed, and say so in the pull request.
6. Run `npm test`. The tests compare the built geometry with the published figures.

If you are not sure which source is right, open the issue and leave the mesh alone. Recording the disagreement is more useful than picking silently.

## What counts as a source

Prefer the survey or the paper that measured the thing:

- Petrie 1883, Cole 1925, Dash 2015 and 2018
- Maragioglio and Rinaldi, *L'Architettura delle piramidi menfite*
- Vyse and Perring 1840 for the relieving chambers
- Morishima, Tayoubi et al., *Nature* 2017, and Procureur et al., *Nature Communications* 2023
- A later architectural survey that publishes its own measurements (Gantenbrink, the Djedi project, Hawass, Lehner and Lacau where they give numbers)

Wikipedia is a map to those sources, not a source for a length. Lehner's *Complete Pyramids* is welcome as a synthesis. Where it and Petrie give different numbers, keep Petrie unless you have the measuring notes.

## Pictures

A picture on a feature must be public domain, CC0, or a Creative Commons licence, with the author, the licence, a link to the file page, and a link to the licence. "Copyrighted free use" on Wikimedia is not enough, because the terms are not a Creative Commons licence. Put the record in `media` and list the feature ids it illustrates.

## Code

```bash
npm install
npm test
npm run build
```

The pyramid scene and the globe are both react-three-fiber. Please keep new geometry in metres, in the frame described at the top of `data/great-pyramid.json`: origin at the centre of the casing base, +X east, +Y up, +Z north, before the true-north yaw.

Schematic geometry is allowed when a feature has to be drawn and the survey does not fix it. Set `schematic: true` on the feature, say so in the summary, and do not present the guessed number as a measurement.

## Good first issues

Issues labelled `good first issue` are meant to be finishable without re-deriving the whole monument. A typical one is "check this one length against another survey" or "add a CC-licensed photograph for a feature that has none."

## Conduct

Correct the work, cite the page, and leave the argument where someone else can check it. The point of the project is that a stranger can open the dataset and the test and see why a wall is where it is.
