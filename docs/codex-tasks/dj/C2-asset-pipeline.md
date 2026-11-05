# C2: the dancers' asset pipeline (FBX to GLB, compressed, with a list)

> **过时 · Superseded (Nov 5):** don't send this card. The dancing coach (跟着跳) went another way:
> a CC0 robot with its own dances (`site/public/models/robot.glb`, `Coach3D.tsx`, PR #129) and Name
> That Tune's drawn performer, not Mixamo's characters. There's no FBX pipeline to build. Kept for
> the record.

**Files:** `site/scripts/assets/` (new: everything below), the outputs in `site/public/dancers/`
(the GLBs and `manifest.json`), a test rig `site/tests/fixtures/dj/bounce-120.fbx` (made by your
script), and in `site/package.json` one script, `"assets": "node scripts/assets/build.mjs"`, plus
`@gltf-transform/core` and `@gltf-transform/cli` as dev dependencies at exact versions.
**Output:** `public/dancers/*.glb` and `public/dancers/manifest.json`, shaped as `DancerManifest`
in `types.ts`.
**Command:** `npm run assets -- --fixture` (needs Blender 4.0 or newer on PATH: install it in your
environment; it is not needed in CI, and nothing in CI runs this).

The dance floor (C3, later) shows 4 to 8 dancers from Mixamo: free rigged characters and dances
recorded from real dancers. This card turns Mixamo's FBX downloads into small GLB files the
browser can load, and writes the list C3 reads: which moves there are, how long, at what tempo,
for which styles.

## Inputs

- `site/assets/mixamo/characters/*.fbx`: 4 characters, FBX Binary, T-pose, with skin.
- `site/assets/mixamo/moves/*.fbx`: 12 to 20 dances, FBX Binary, **without skin**, 30 fps, no
  keyframe reduction, "In Place" where Mixamo offers it.
- `site/assets/mixamo/moves.json`: for each move file, the styles it suits (`StyleId`s) and its
  energy (`low`, `mid`, `drop`). Write a first version from the move names and say in the PR it
  needs Steve's eye.
- Steve downloads these from mixamo.com (a free Adobe login); Claude Code puts them on your branch.
  They are never served: only the GLBs are. Until they're there, everything runs on the test rig.

## What it must do

1. `fbx2glb.py`, run as `blender -b --factory-startup -P scripts/assets/fbx2glb.py -- in.fbx out.glb`:
   imports the FBX and exports GLB. A character keeps its armature (Mixamo's `mixamorig:` bone
   names, unchanged), mesh and materials, and no animation; a move keeps only the armature and its
   action, sampled at 30 fps.
2. `build.mjs`: runs that for every input, then compresses with gltf-transform: meshopt geometry,
   textures resized to at most 1024 px and turned into WebP, unused data pruned. Writes
   `public/dancers/<id>.glb`; the id is the file name lowercased, spaces and symbols as `-`.
3. **The move's own tempo.** For each move, measure it from the motion: the hips bone's height over
   the loop has one dip per beat in nearly every dance; find the period (autocorrelation), give
   `bpm` (folded by halves or doubles into 60 to 200, nearest to the middle of its styles' BPM
   ranges, which C1's presets give; until C1 is merged use 100 to 130), `beats` (whole beats in
   the loop) and `seconds`. `bpmFrom: "measured"`, `bpmChecked: false`. Print a line per move with
   the strength of the beat it found, so a weak one can be checked by hand.
4. `manifest.json` (as `DancerManifest`): every character (with its standing height in metres from
   its bounding box) and every move, sorted by id, `made` today's date. A move in `moves.json` but
   not in the folder, or the other way round, stops the build with a message.
5. `make-fixture.py`: a test rig made in Blender (no Mixamo): an armature with bones named
   `mixamorig:Hips`, `mixamorig:Spine`, `mixamorig:LeftFoot`, `mixamorig:RightFoot`, a simple mesh
   skinned to it, and an 8-beat action at exactly 120 BPM (4 s at 30 fps) where the hips dip on
   every beat; saved as `tests/fixtures/dj/bounce-120.fbx` (small: commit it).
6. `--fixture`: runs the whole pipeline on the rig (as a move, into a temporary folder), then checks
   the result.
7. `check.mjs <folder>`: reads every GLB in a folder with `@gltf-transform/core` and checks: each is
   at most 4 MB; a character has one skin and no animation; a move has one animation and no mesh;
   every move's bone names are found in every character; every file is in the manifest and every
   manifest entry has a file. `build.mjs` runs it at the end.
8. Running `npm run assets` twice gives the same files (no timestamps or random ids inside).

## Done when

- `npm run assets -- --fixture` passes: the rig's move comes out with `bpm` 120 (± 1), `beats` 8,
  `seconds` 4.0 (± one frame), one animation and no mesh, under 200 KB.
- If the Mixamo files are on the branch: `npm run assets` passes `check.mjs`, every GLB is at most
  4 MB, and the PR pastes the manifest and a table of the files with their sizes and tempos.
- Nothing outside the files above changes; `npx tsc --noEmit` and `npm run build` pass.
