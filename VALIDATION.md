# Validation

The mesh is not the authority. The Khufu ledger is `sites/khufu/site.json`. `src/lib/pyramid-model.ts` turns that ledger into geometry, and `tests/pyramid-model.test.ts` checks the geometry against numbers written out in the test file. A wrong edit to the JSON fails the tests. Run them with:

```bash
npm test
npm run validate
```

`npm test` is the geometry suite. `npm run validate` checks every site package against the schemas in `schema/`: citations, coordinates, orientation, units, unique ids, pictures, and catalog issue numbers. Tolerances below are the ones the geometry tests enforce.

## Frame

- One unit is one metre.
- The origin is the centre of the original casing base, on the pavement.
- +X is east, +Y is up, +Z is north, before the true-north rotation.
- Petrie's inch is converted at exactly 0.0254 m.
- The whole monument is then yawed so the north face points west of true north. Feature coordinates in the JSON are in the pyramid frame, before that yaw.
- Interior inches stay on Petrie's centre. They are not shifted by the 16 mm between his base and Cole's.

## What the tests check

| Quantity | Published value used | Tolerance |
| --- | --- | --- |
| Mean base | (230.253 + 230.454 + 230.391 + 230.357) / 4 = 230.36375 m | 0.01 mm |
| Face angle | 51°52′00″ | exact |
| Original height | (base / 2) × tan(51°52′) | 0.1 mm, and within 20 mm of Petrie's 5,776 in |
| Seked 5½ palms | atan(14/11) | inside 2′ of the face angle |
| Orientation | mean of Cole's four side deviations = 186.25″ west of north | 0.0001″ |
| True-north yaw | north axis moves toward west | sign check |
| Section plane | keeps pyramid-frame X west of the entrance, in world space | sign check |
| Core plane | 9,001.5 in | 0.01 mm |
| Standing height | 138.5 m | exact |
| Base centre | 0.260 m south and 0.377 m east of Dash's mast | round-trip to 10⁻⁶ ° |
| Entrance | 668.2 in up, 287 in east, 524.1 in south of the north casing on Petrie's half-base | 0.01 mm |
| Descending end | −1,181 in, 306 in north, 286.4 in east | 0.01 mm |
| Descending slope | 26°31′23″ | 0.05° |
| Junction | 1,110.64 in along the descending floor | 0.1 mm |
| Ascending end | 852.6 in up, 1,626.8 in north, 287 in east | 0.01 mm |
| Ascending length | 1,546.8 in | 20 mm |
| Queen's Chamber | 205.85 in north–south, 226.47 in east–west, ridge 0.3 in north of centre | 0.1 mm |
| King's Chamber walls | 330.6 / 537.0 south, 305.1 east, 107.7 west; mean floor and ceiling | 0.1 mm |
| King's Chamber inside the original pyramid | all eight corners | 20 mm |
| Low passages | 52 in and 100.8 in on Petrie's wall stations | 1 mm |
| Subterranean Chamber | roof −1,056 in, north wall 40 in south, south wall 366 in south | 1 mm |
| Grand Gallery plumb height | 339 in, measured on the built corbel mesh | 10 mm |
| Relieving stack | five spaces; first floor on the King's ceiling; Campbell's ridge at 2,525 in | 1 mm |
| King's shafts | outer ends on the casing | 20 mm |
| North Face Corridor | 2.02 × 2.18 × 9.06 m, floor at 20 m, 0.84 m inside the casing at ceiling height, every corner inside the pyramid | 10 mm |
| Big Void | horizontal, 30 m, centre 45 m from the Queen's Chamber and above the gallery roof, inside the pyramid | 10 mm on the distance |

Every feature must carry at least one fact whose `sourceId` exists in the ledger. The eight bibliographic ids are required to be present. Photographs must be public domain, CC0, or a Creative Commons licence.

## Compromises, stated so they can be corrected

These are choices, not hidden errors. Each one has a GitHub issue, or is small enough to be named here for a data correction.

1. **The exterior is a square of Cole's mean side**, not his four unequal sides. The longest and shortest differ by 0.20 m. Azimuths are averaged the same way: the sides are not parallel. Cole's east azimuth is read as 359°54′30″. A damaged scan of his paper can look like 353°, which would be a six-degree error and is rejected.
2. **Height is Cole's base times Petrie's 51°52′.** That is 146.721 m, 11 mm above Petrie's own 5,776 in, inside his ±7 in. The seked of 5½ palms (51°50′34″) is inside his ±2′ and is not the angle drawn.
3. **Orientation is Cole's mean, 3′06.25″ west of north**, not Petrie's casing mean of −3′43″, and not the full unpublished reduction of Dash's 2015 corner survey. The 0.05° yaw is applied, not exaggerated.
4. **Interior inches stay on Petrie's centre.** The 16 mm Cole/Petrie base difference is not applied as a shift. Passage azimuths that wander a few arcminutes from the faces are not modelled; over 100 m that is about 6 cm.
5. **The Queen's Chamber is placed on the passage axis.** Petrie's text, as used here, does not give an independent east–west wall distance. Wikipedia swaps his north–south and east–west; the model follows his wall table (205.85 by 226.47 inches). The passage is joined to the north wall rather than stopped 1.2 inches short of it.
6. **The niche is shifted south of centre by Petrie's 25.2 inch eccentricity.** His lap table mixes N and S suffixes; the direction of the shift should be checked against the plate.
7. **Queen's shafts are Petrie's straight projections.** King's shafts are straight rays at the published outer angles. The mouth height of 0.91 m is reconstructed. Bends and the blocking stones found by Upuaut and Djedi are not drawn. The southern King's shaft really curves.
8. **The well shaft and al-Ma'mun's tunnel are schematics.** Only the well's mouth (35.4 inches from the gallery's north wall) and the passage junction are fixed. The grotto and the forced entrance are drawn so the topology is visible.
9. **The North Face Corridor's 0.84 m is applied inside the casing at ceiling height**, so a vertical void does not poke through the sloping face. The paper measures from the chevron's outer face, which stood behind the lost casing. The difference is of order 1–2 m, and it is the largest placement compromise on an otherwise surveyed void.
10. **The Big Void is the horizontal hypothesis only.** Length is fixed at the published minimum of 30 m. The cross-section is copied from the Grand Gallery. Northing is chosen at 20 m so the centre is 45 m from the Queen's Chamber, the middle of the paper's 40–50 m. No centreline was published. The inclined hypothesis is not drawn. The "21 m above the ground" in the 2017 paper is the detector in the Queen's Chamber, not the void.
11. **Relieving chambers share the King's Chamber plan.** Five voids and four 0.8 m beams split the space under Vyse's apex at 2,525 inches. Individual heights are not Vyse's.
12. **The core is 36 equal visual steps, not the roughly 200 surveyed courses.** The surviving casing is drawn 1.5 m high; only its 20 m length is surveyed. The gallery ramp is 21 inches, one cubit, because Petrie did not publish a single ramp height. The low passages north and south of the Antechamber use a reconstructed height of 41.2 inches; their lengths are his.
13. **There is no terrain model.** The pavement is flat, 0.42 m outside the casing. The internal rock knoll is omitted. The subterranean side recess is omitted. The sarcophagus is omitted.
14. **The globe is NASA Blue Marble** at 2048×1024, public domain, about 20 km a pixel. It is not aerial photography, and it is not a live tile service. No API key is required.
15. **Standing height is 138.5 m.** Procureur et al. 2023 say 139 m, which is a rounded figure.
16. **Maragioglio and Rinaldi are not transcribed.** Where a later plate would decide a Petrie ambiguity, v1 keeps Petrie and says so.

## Globe check

`latLonToVector` is tested against the three.js sphere: longitude 0° on the equator is +X, longitude 90° E is −Z, and Giza falls in the north-east quadrant. That matches `SphereGeometry` with the Blue Marble image, whose prime meridian is in the middle of the file. The texture is not rotated.
