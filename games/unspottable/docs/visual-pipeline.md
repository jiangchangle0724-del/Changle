# 3D visual pipeline

## Guides applied

This pass uses the workflow in [gamedev-agent-skills](https://github.com/minhhoit/gamedev-agent-skills): lock a small art direction before adding assets, validate a representative target in scene context, record source/license, and protect the mobile frame budget. Relevant guides:

- [Create game assets](https://github.com/minhhoit/gamedev-agent-skills/blob/main/skills/disciplines/create-game-assets/SKILL.md)
- [Art direction reference](https://github.com/minhhoit/gamedev-agent-skills/blob/main/skills/disciplines/create-game-assets/references/art-direction.md)
- [Three.js materials and lighting](https://github.com/minhhoit/gamedev-agent-skills/blob/main/skills/web-engines/threejs-materials-lighting/SKILL.md)
- [Performance optimization](https://github.com/minhhoit/gamedev-agent-skills/blob/main/skills/disciplines/performance-optimization/SKILL.md)

## Art direction and decisions

- Keep a readable, toy-scale crowd and original Vancouver / Chinese locations; do not mix in a model whose silhouette and material language belongs to another game.
- Use a perspective camera that preserves a 24.5-unit horizontal arena span across landscape aspect ratios. Its current elevated three-quarter angle adds depth without changing the gameplay footprint.
- Use a palette-derived fill light, subtle floor bump from each floor's existing palette map, and one instanced radial alpha map for soft character contact shadows. Realtime shadow maps stay disabled for mobile cost.
- Keep the 18 NPCs plus up to 8 players batched through shared instanced meshes. Adaptive DPR remains the GPU fallback when frame-time samples exceed the budget.

A candidate public humanoid GLB was inspected before changing the crowd. It had one monochrome jade material and no embedded animation clips; that material/silhouette did not match the current multi-outfit crowd. It is not bundled. Quaternius publishes a [CC0 Universal Base Characters pack](https://quaternius.com/packs/universalbasecharacters.html) and a separate [CC0 animation library](https://quaternius.itch.io/universal-animation-library); these are possible future sources, not current game dependencies.

## Quality gate for future assets

Record each imported asset's exact source URL, creator, license, modifications, compressed size, mesh/triangle count, texture sizes, rig and clip inventory, and intended LOD. Inspect it in the actual 18+8 crowd at phone landscape size before replacing the procedural character. Profile release builds on physical iPhone and iPad hardware with ?fps=1, noting device, OS, browser, arena, and crowd count. This pass was checked in desktop Chrome; no physical iOS frame-rate result is claimed.

This remains an original lightweight web adaptation, not a Steam-art replica. Steam-level presentation would still need a cohesive set of authored/authorized character rigs, material sets, richer animated scene assets, and measured optimization on the target phones.
