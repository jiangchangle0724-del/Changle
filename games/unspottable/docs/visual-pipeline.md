# 3D visual pipeline

## Guides applied

This pass uses the workflow in [gamedev-agent-skills](https://github.com/minhhoit/gamedev-agent-skills): lock a small art direction before adding assets, validate a representative target in scene context, record source/license, and protect the mobile frame budget. Relevant guides:

- [Create game assets](https://github.com/minhhoit/gamedev-agent-skills/blob/main/skills/disciplines/create-game-assets/SKILL.md)
- [Art direction reference](https://github.com/minhhoit/gamedev-agent-skills/blob/main/skills/disciplines/create-game-assets/references/art-direction.md)
- [Three.js materials and lighting](https://github.com/minhhoit/gamedev-agent-skills/blob/main/skills/web-engines/threejs-materials-lighting/SKILL.md)
- [Performance optimization](https://github.com/minhhoit/gamedev-agent-skills/blob/main/skills/disciplines/performance-optimization/SKILL.md)

## Art direction and decisions

- Added three original environment panoramas generated with ChatGPT ImageGen: Vancouver Seawall Park, a Vancouver transit concourse, and a Chinese courtyard theatre. The JPEGs are downscaled to 1536×768 at quality 88 (about 250–350 KB each), loaded only for the selected arena, and used as color-managed equirectangular scene backgrounds. Existing real-time arena geometry and character rendering remain in front. The generated source PNGs are kept outside the repository; the optimized runtime assets live in `src/client/art/`.
- Replaced the small procedural crowd figures with three original character designs created with ChatGPT ImageGen. Each transparent 4×4 sheet contains four facing directions and idle, alternating walk, and punch poses. The three sheets are packed into one padded 2400×800 atlas so the renderer loads a single texture; 48 fixed-UV instanced batches select the needed archetype, direction, and pose without a per-character draw call. The crowd still moves and collides through the same server simulation. Generated PNG source sheets remain outside the repository; the optimized combined atlas is `src/client/art/crowd-atlas.png`.
- Keep a readable, toy-scale crowd and original Vancouver / Chinese locations; use original generated character art that does not copy another game's model, logo, or silhouette.
- Use a perspective camera that preserves a 24.5-unit horizontal arena span across landscape aspect ratios. Its current elevated three-quarter angle adds depth without changing the gameplay footprint.
- Use a palette-derived fill light, subtle floor bump from each floor's existing palette map, and one instanced radial alpha map for soft character contact shadows. Realtime shadow maps stay disabled for mobile cost.
- Keep the 18 NPCs plus up to 8 players batched through shared instanced meshes. Adaptive DPR remains the GPU fallback when frame-time samples exceed the budget.

## Blender venue production

`tools/blender/generate_arena_dressing.py` is the editable source for the three in-game architecture sets. It creates only authored mesh geometry and procedural materials in Blender, batches each scene by material, then exports glTF 2.0 binary assets with `EXT_meshopt_compression`. No external model or texture is loaded into the Blender scene. The output files are the original Seawall Park, Transit Hall, and Courtyard Theatre dressing in `src/client/art/*-dressing.glb`; each export remains below 1.1 MB and contains a small, fixed number of material batches. `tests/arenaAssets.test.ts` validates the GLB container, version, compression extension, scene content, and per-file size limit. Three.js decodes the selected dressing with its bundled Meshopt decoder, then removes the blockout geometry; the procedural version remains visible if the GLB request fails.

Regenerate with Blender 5.2 or newer from the game directory:

    blender --background --python tools/blender/generate_arena_dressing.py

The script also renders one Blender preview per environment under `dist/blender-previews/` for visual inspection. Inspect the assets at the live game's actual landscape camera framing as well; the Blender previews are not a substitute for in-browser art review.

A candidate public humanoid GLB was inspected before the generated sprite pass. It had one monochrome jade material and no embedded animation clips; that material/silhouette did not match the crowd direction. It is not bundled. Quaternius publishes a [CC0 Universal Base Characters pack](https://quaternius.com/packs/universalbasecharacters.html) and a separate [CC0 animation library](https://quaternius.itch.io/universal-animation-library); these remain possible future sources for rigged 3D models.

## Quality gate for future assets

Record each imported asset's exact source URL, creator, license, modifications, compressed size, mesh/triangle count, texture sizes, rig and clip inventory, and intended LOD. Inspect new art in the actual 18+8 crowd at phone landscape size. Profile release builds on physical iPhone and iPad hardware with ?fps=1, noting device, OS, browser, arena, and crowd count. The generated-image pass has passed typecheck, unit tests, and build; this update has not yet been verified in a browser or on physical iOS hardware.

This remains an original lightweight web adaptation, not a Steam-art replica. The environment now has original Blender geometry, while the crowd remains animated billboard sprites. A true 3D crowd with authored/authorized rigs, facial variation, richer animation clips, and measured optimization on the target phones is a separate next art milestone. Browser emulation can verify layout and gameplay flows, but iPhone/iPad frame rate must be measured on those physical devices using `?fps=1`.


