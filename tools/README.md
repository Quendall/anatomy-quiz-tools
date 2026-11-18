# Model pipeline

Turns Z-Anatomy FBX files into compressed glTF models plus a parts manifest that the app reads.

| Output | Purpose |
|---|---|
| `static/models/<system>.glb` | meshopt-compressed model, one node per mesh |
| `src/lib/data/manifest/<system>.json` | system → groups → parts, with each part's node names and sides |

## Requirements
- Blender 4.x or 5.x. The scripts find it in `C:\Program Files\Blender Foundation\`, or you can set `$env:BLENDER` to the path of `blender.exe`.
- Node 20+, which runs `@gltf-transform/cli` through `npx`.

## Run it
1. Download an FBX from the [Z-Anatomy repo](https://github.com/LluisV/Z-Anatomy/tree/PC-Version/Resources/Models/FBX) into `tools/source/`. This folder is gitignored.
2. Build it:
   ```powershell
   powershell -File tools/build-model.ps1 -System skeletal -Fbx SkeletalSystem100.fbx
   ```
   This runs `convert.py` in headless Blender, then `compress.ps1`.
3. To look at a new FBX before converting it:
   ```powershell
   & "C:\Program Files\Blender Foundation\Blender 5.0\blender.exe" -b --factory-startup -P tools/inspect.py -- tools/source/X.fbx tools/reports/x.json
   ```

The system ids that `convert.py` knows are skeletal, joints, muscular, cardiovascular, nervous, visceral and lymphoid. Each one has a display name and a layer color.

## Z-Anatomy naming (from inspecting `SkeletalSystem100.fbx`)
| Suffix | Object | Meaning | Kept? |
|---|---|---|---|
| `.g` | empty | group (collection) | used to build the tree |
| `.l` / `.r` | mesh | left / right structure | yes |
| none | mesh | midline structure | yes |
| `.j` / `.i` | mesh | small label-pin meshes | no |
| `.t` / `.s` | empty | label anchors for sub-features | no |
| `.o*` / `.e*` | mesh | muscle origin / insertion patches on bones | no (could become an origins/insertions quiz later) |

Objects not under a `.g` root are dropped too, such as the cross-section helpers and the "Take a picture" rig.

Node names are rewritten as safe ids such as `femur__l`, `femur__r` and `sternum`. Three.js' GLTFLoader strips `.` from node names, so the original `Femur.l` would arrive as `Femurl`. The left and right meshes of a structure share one part entry.

For the muscular system, `convert.py` also:
- leaves out fasciae, bursae and tendon sheaths (`SKIP_GROUP`), because fasciae wrap whole limbs and would hide the muscles;
- merges muscles that Z-Anatomy splits into heads into one quiz part, so the deltoid is one part rather than three. This covers whole subgroups (`MERGE_GROUPS`) and sibling names like "Lateral head of gastrocnemius" (`HEAD_OF`). Each head keeps its own mesh node;
- orders regions head to toe (`ROOT_ORDER`).

For joints, the same "part/head of" merge applies (the two parts of the iliofemoral ligament become one), each nucleus pulposus is folded into its intervertebral disc (`FOLD_INTO`), and spinal levels sort top to bottom (C, T, L, S). Where the source files the two sides of a structure in different groups (the wrist collateral ligaments), both sides are kept in the group where the first side appears.

For visceral systems, the pleura, greater omentum and liver segments are marked `"hidden": true` in the manifest (`DEFAULT_HIDDEN`). They start hidden because they would cover the organs, or overlap the whole liver. Liver segments get their own group. Empty placeholder meshes and `-profile` outline helpers are dropped. Z-Anatomy's file only has the male genital system.

For cardiovascular, vessel branches are parented to their vessel mesh, and Z-Anatomy lists hundreds of them under a few flat groups. `convert.py` groups each vessel tree under its trunk, such as "Femoral artery and branches" or "Internal jugular vein and tributaries" (`TRUNK_GROUPS`). Groups get a `color`: blue for deoxygenated vessels (systemic veins and pulmonary arteries), and the app colors those meshes to match. Two vessels whose names are unreadable in the source ("?x", "????????") are skipped.

`convert.py` refuses to write a manifest whose part ids or node names clash with another system's manifest, because the app indexes them all together.

The `GROUP_ORDER`, `GROUP_RENAME` and `split_group` settings in `convert.py` tidy the tree. For example, Z-Anatomy keeps all the hand bones in one flat group, and `split_group` divides them into carpal, metacarpal and phalanges like the foot.

## Current results
| System | Meshes | Parts | Groups | Size |
|---|---|---|---|---|
| skeletal | 277 | 159 | 27 | 10.8 MB → 3.0 MB |
| joints | 413 | 211 | 39 | 6.4 MB → 2.0 MB |
| muscular | 489 | 216 | 47 | 34.4 MB → 8.9 MB |
| visceral | 118 | 101 | 24 | 12.1 MB → 2.9 MB |
| cardiovascular | 673 | 416 | 30 | 24.7 MB → 6.8 MB |

The model is in meters (about 1.7 m tall) and Y-up.

## License
The Z-Anatomy models are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The converted `.glb` files are adapted material, so they must also be shared under CC BY-SA 4.0 with attribution to Z-Anatomy. The app credits them in its header and on `/credits`.
