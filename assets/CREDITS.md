# Asset credits

Every shipped asset gets one row in the table at the end of this file: file, what it is, author or source, license, and link. `tools/zanatomy_export_blender.py` appends rows automatically when it exports anatomy meshes. CI fails if `assets/manifest.json` is out of date.

## Rules

- **Anatomy** (`assets/anatomy/`): derived from Z-Anatomy (CC BY-SA 4.0), which derives from BodyParts3D (CC BY-SA 2.1 Japan). Derivatives stay CC BY-SA and credit both projects. ShareAlike applies to these files, not to the code.
- **Molecular** (`assets/molecular/`): prefer CC0 or public-domain files from NIH 3D, RCSB PDB and PubChem. Record each file's license individually, and cite every PDB ID.
- **Never** add a NonCommercial (NC) asset, such as many AnatomyTOOL models or the CC BY-NC-SA copies of BodyParts3D.

## Data references (not redistributed)

| Item | Used for | Source | License / terms | Link |
|---|---|---|---|---|
| PubChem CID 33032 (glutamate), 977 (O₂), 280 (CO₂) | Formulas and bonding checked for the glutamate and gas scenes; geometry is built from idealized bond lengths | National Library of Medicine | Public domain (U.S. government work) | https://pubchem.ncbi.nlm.nih.gov/ |
| PDB 1BNA (Dickerson dodecamer) | Sequence shown in the DNA scene; geometry follows standard B-DNA dimensions, not these coordinates | Drew et al., 1981; RCSB PDB | CC0 1.0 (PDB archive data) | https://www.rcsb.org/structure/1BNA |

## Software and fonts

| Item | License | Link |
|---|---|---|
| three.js | MIT | https://github.com/mrdoob/three.js |
| Atkinson Hyperlegible Next (Braille Institute) | SIL Open Font License 1.1 | https://www.brailleinstitute.org/freefont/ |
| Literata (TypeTogether for Google) | SIL Open Font License 1.1 | https://github.com/googlefonts/literata |

## Shipped assets

Milestone 1 ships no external 3D assets. All geometry is generated in code (`src/scenes/`, `src/library/`) and is covered by the MIT license.

| File | Description | Source / author | License | Link |
|---|---|---|---|---|
