"""Convert one Z-Anatomy system FBX into a web-ready .glb + a parts manifest.

Usage:
  blender -b --factory-startup -P tools/convert.py -- <input.fbx> <system_id> <out.glb> <out.json>

Z-Anatomy naming conventions (confirmed with tools/inspect.py on SkeletalSystem100.fbx):
  Name.g            EMPTY  group (collection)
  Name.l / Name.r   MESH   left / right structure          -> kept
  Name              MESH   midline structure (no suffix)   -> kept
  Name.j / Name.i   MESH   tiny label-pin meshes            -> dropped
  Name.t / Name.s   EMPTY  label anchors for sub-features   -> dropped
  Name.o*/.e*       MESH   muscle origin/insertion patches  -> dropped (future feature)
Objects not under a .g root (cross-section helpers, camera rigs) are dropped.

Output node names are sanitized ids (`femur__l`, `sternum`) because three.js' GLTFLoader
strips '.' and other reserved characters from node names.
"""
import json
import re
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
SRC, SYSTEM_ID, OUT_GLB, OUT_JSON = argv[:4]

SYSTEMS = {
    "skeletal": {"name": "Skeletal system", "color": "#E8E1D1"},
    "joints": {"name": "Joints & ligaments", "color": "#A3B8CC"},
    "muscular": {"name": "Muscular system", "color": "#E2665C"},
    "cardiovascular": {"name": "Cardiovascular system", "color": "#D9465A"},
    "nervous": {"name": "Nervous system & sense organs", "color": "#E3D79A"},
    "visceral": {"name": "Visceral systems", "color": "#E39AB0"},
    "lymphoid": {"name": "Lymphoid organs", "color": "#9ADE7B"},
}

# Display order for groups; unknown groups follow in file order.
GROUP_ORDER = [
    "Bones of cranium", "Extracranial bones of head", "Auditory ossicles", "Anterior teeth",
    "Posterior teeth", "Nasal cartilages", "Laryngeal cartilages",
    "Cervical vertebrae", "Thoracic vertebrae", "Lumbar vertebrae", "Sacrum and coccyx",
    "True ribs", "False ribs", "Floating ribs", "Sternum", "Costal cartilages",
    "Bones of pectoral girdle", "Bones of arm and forearm", "Carpal bones", "Metacarpal bones",
    "Phalanges of hand", "Sesamoid bones of hand",
    "Bones of pelvic girdle", "Bones of thigh and leg", "Tarsal bones",
    "Metatarsal bones", "Phalanges of foot", "Sesamoid bones of foot",
]

ORDINALS = {w: i for i, w in enumerate(
    "first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth".split(), 1)}


def natural_key(name):
    """Sort 'Second rib' before 'Tenth rib' and 'Vertebra T2' before 'Vertebra T10'."""
    words = [str(ORDINALS.get(w, w)) for w in name.lower().split()]
    # Spinal levels top to bottom: C before T before L before S ("disc T12-L1").
    text = re.sub(r"\b([ctls])(\d+)", lambda m: f"{'ctls'.index(m.group(1))} {m.group(2)}", " ".join(words))
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", text)]

# Top-level regions head to toe, per system (Z-Anatomy lists them alphabetically).
ROOT_ORDERS = {
    "muscular": [
        "Cranial part of muscular system", "Cervical part of muscular system",
        "Thoracic part of muscular system", "Abdominal part of muscular system",
        "Dorsal part of muscular system", "Pelvic part of muscular system",
        "Muscular system of upper limb", "Muscular system of lower limb",
    ],
    "joints": [
        "Joints of skull", "Laryngeal joints", "Joints of vertebral column", "Thoracic joints",
        "Joints of upper limb", "Joints of lower limb",
    ],
    "cardiovascular": ["Arterial system", "Venous system"],
    "nervous": ["Central nervous system", "Peripheral nervous system", "Sense organs"],
    "visceral": [
        "Respiratory system", "Thoracic cavity", "Digestive system", "Abdominopelvic cavity",
        "Urinary system", "Genital systems", "Endocrine glands",
    ],
}

# Parts that start hidden in the viewer (a quiz that includes them shows them): large sheets
# that would cover the organs on first view, and liver segments, which overlap the whole liver.
DEFAULT_HIDDEN = re.compile(
    r"^(Pleura|Greater omentum|.* segment of liver \(.*\)"
    # Nervous: the spinal dura wraps the cord; the eyeball segments wrap the lens and iris.
    r"|Spinal dura|(Anterior|Posterior) segment of eyeball)$"
)
ROOT_ORDER = ROOT_ORDERS.get(SYSTEM_ID, [])

# Systems where "X part/head of Y" siblings are merged into one part "Y".
MERGE_HEADS = {"muscular", "joints", "cardiovascular"}

# Groups left out of the model: fasciae wrap whole limbs (hiding the muscles), and bursae
# and tendon sheaths are not what a muscle quiz is about.
SKIP_GROUP = re.compile(r"bursae|tendon sheaths|fasciae|fascia\b", re.I)

# Muscles that Z-Anatomy splits into heads/parts but students learn as one structure.
# Their meshes become one part named after the group, inside the parent group.
MERGE_GROUPS = {
    "Deltoid muscle", "Trapezius muscle", "Biceps brachii muscle", "Triceps brachii muscle",
    "Pectoralis major muscle", "Digastric muscle", "Levator ani",
    "Adductor hallucis", "Flexor hallucis brevis",
}

# Heads/parts of one muscle listed side by side in a flat group, e.g.
# "Lateral head of gastrocnemius" + "Medial head of gastrocnemius" -> "Gastrocnemius".
HEAD_OF = re.compile(r"^[A-Z][\w-]* (?:head|part|belly)s? of (.+)$")


# Structures folded into another part: the nucleus pulposus sits inside its disc, so it can
# never be seen or clicked on its own.
FOLD_INTO = [
    (re.compile(r"^Nucleus pulposus (.+)$"), r"Intervertebral disc \1"),
    # A second mesh with a garbled alias: "Inferior vein of left ventricle (//Posterior '')".
    (re.compile(r"^(.+?) \(//.*\)$"), r"\1"),
]


def merged_part_name(name):
    for pat, repl in FOLD_INTO:
        if pat.match(name):
            return pat.sub(repl, name)
    m = HEAD_OF.match(name)
    if not m:
        return name
    whole = m.group(1)
    return whole[0].upper() + whole[1:]


GROUP_RENAME = {
    "Thoracic part of muscular system": "Diaphragm",
    # Visceral: Z-Anatomy puts these organs directly in their system's root group.
    "Digestive system": "Liver, gallbladder and pancreas",
    "Digestive canal": "Oesophagus and stomach",
    "Thoracic cavity": "Pleura",
    # Cardiovascular: the source files a left-valve leaflet under the right valve.
    "Right atrioventricular valve": "Atrioventricular valves",
    # After trunk grouping, only the hepatic portal vein is left in "Systemic veins".
    "Systemic veins": "Hepatic portal vein",
    "Vertebral column": "Sacrum and coccyx",
    # Nervous: Z-Anatomy nests many 1-3 part groups; merge them into textbook-sized groups.
    "Midbrain": "Brainstem",
    "Central mesencephalic structures": "Brainstem",
    "Cerebral peduncle": "Brainstem",
    "Grey matter of tegmentum of midbrain": "Brainstem",
    "Oculomotor complex": "Brainstem",
    "Tectum of midbrain": "Brainstem",
    "Grey matter of pontine tegmentum": "Brainstem",
    "White matter of diencephalon": "Diencephalon",
    "Telencephalon": "Deep structures of cerebrum",
    "Basal forebrain": "Deep structures of cerebrum",
    "Commissural fibres of telencephalon": "Deep structures of cerebrum",
    "Corpus striatum": "Deep structures of cerebrum",
    "Dorsal striatum": "Deep structures of cerebrum",
    "Projection fibres of telencephalon": "Deep structures of cerebrum",
    "Walls of lateral ventricle": "Deep structures of cerebrum",
    "Insula": "Insula and interlobar sulci",
    "Interlobar sulci": "Insula and interlobar sulci",
    "Dura": "Meninges and choroid plexus",
    "Cranial dura": "Meninges and choroid plexus",
    "Cranial pia": "Meninges and choroid plexus",
    "Central structures of spinal cord": "Grey matter of spinal cord",
    "Anterior horn of spinal cord": "Grey matter of spinal cord",
    "Intermediate zone of spinal cord": "Grey matter of spinal cord",
    "Posterior horn of spinal cord": "Grey matter of spinal cord",
    "White matter of spinal cord": "Tracts of spinal cord",
    "Anterior funiculus": "Tracts of spinal cord",
    "Anterolateral fasciculus": "Tracts of spinal cord",
    "Lateral funiculus": "Tracts of spinal cord",
    "Posterior funiculus": "Tracts of spinal cord",
    "Thoracolumbar part of autonomic division": "Sympathetic trunk and nerves",
    "Cervical nerves": "Cranial nerves",  # holds only the accessory nerve (XI)
    "Mandibular nerve": "Mandibular nerve and branches",
    "Posterior division of mandibular nerve and branches": "Mandibular nerve and branches",
    "Ganglia": "Spinal nerves",
    "Roots of nerves": "Spinal nerves",
    "Thoracic nerves": "Spinal nerves",
    "Anterior rami of lumbar nerves": "Spinal nerves",
    "Supraclavicular part of brachial plexus": "Roots, trunks and cords of brachial plexus",
    "Infraclavicular part of brachial plexus": "Roots, trunks and cords of brachial plexus",
    "Branches of anterior part of lumbar plexus": "Lumbar plexus",
    "Branches of posterior part of lumbar plexus": "Lumbar plexus",
    "External ear": "Ear",
    "Middle ear": "Ear",
    "Internal ear": "Ear",
    "Lacrimal apparatus": "Accessory visual structures",
    "Bones of free part of lower limb": "Bones of thigh and leg",
    "Bones of foot": "Sesamoid bones of foot",
}


def split_group(group, part):
    """Z-Anatomy keeps all hand bones flat in one group; split them like the foot."""
    # Liver segments are child meshes of the whole liver; give them their own group.
    if "segment of liver" in part.lower():
        return "Segments of liver"
    if group != "Bones of free part of upper limb":
        return group
    p = part.lower()
    if "phalanx" in p:
        return "Phalanges of hand"
    if "metacarpal" in p:
        return "Metacarpal bones"
    if "sesamoid" in p:
        return "Sesamoid bones of hand"
    if p in ("humerus", "radius", "ulna"):
        return "Bones of arm and forearm"
    return "Carpal bones"


# Source names that are abbreviations or carry stray marks ("Anterior occipital sulcus*").
NAME_FIX = {
    "Lat_Fis-ant-Horizont": "Anterior ramus of lateral sulcus",
    "Lat_Fis-ant-Vertical": "Ascending ramus of lateral sulcus",
    "Lat_Fis-post": "Posterior ramus of lateral sulcus",
    "Sulcus interm_prim-Jensen": "Intermediate sulcus of Jensen",
    "Central canal'": "Central canal",
}

# Reference geometry, not structures: eyeball axes and meridians, and "-curve" guide lines.
HELPER_MESH = re.compile(r"-curve$|^(Equator|Meridians|External axis|Internal axis) of eyeball$")


def clean_name(name):
    name = NAME_FIX.get(name, name)
    name = re.sub(r"\s+", " ", name.replace("*", "")).strip()
    # "(Communicating branch of median nerve with ulnar nerve)": the whole name in brackets.
    if name.startswith("(") and name.endswith(")") and name.count("(") == 1:
        name = name[1:-1]
    return name


def suffix(name):
    base, dot, s = name.rpartition(".")
    return s if dot and base and len(s) <= 4 else ""


def base_name(name):
    return name.rpartition(".")[0] if suffix(name) else name


def slug(s):
    s = re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")
    return s or "part"


def root_of(o):
    while o.parent:
        o = o.parent
    return o


def nearest_group(o):
    p = o.parent
    while p and suffix(p.name) != "g":
        p = p.parent
    return p


def group_path(g):
    path = []
    while g:
        if suffix(g.name) == "g":
            path.append(base_name(g.name))
        g = g.parent
    return list(reversed(path))


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC)

keep = []
for o in bpy.data.objects:
    if o.type != "MESH" or suffix(o.name) not in ("l", "r", ""):
        continue
    # Empty placeholders and outline helpers (e.g. "Oesophagus-profile") are not structures.
    if not o.data.vertices or o.name.endswith("-profile"):
        continue
    if HELPER_MESH.search(base_name(o.name)):
        continue
    # Names whose non-ASCII text was lost in the source ("?x", "????????") can't be labelled.
    if "?" in o.name:
        print(f"NOTE: skipped {o.name!r} (name is unreadable in the source)")
        continue
    if suffix(root_of(o).name) != "g":
        continue
    g = nearest_group(o)
    if g is None:
        continue
    if any(SKIP_GROUP.search(n) for n in group_path(g)):
        continue
    keep.append((o, g))


def trunk_of(o):
    """The outermost vessel mesh this branch hangs off (branches are parented to their vessel)."""
    while o.parent and o.parent.type == "MESH":
        o = o.parent
    return o


def trunk_name(o):
    name = re.sub(r"^(Right|Left) ", "", clean_name(base_name(trunk_of(o).name)))
    name = name.replace(" (thoracic part)", "")
    return name[0].upper() + name[1:]


# Cardiovascular: Z-Anatomy lists hundreds of vessels flat under a few groups. Within these,
# group each vessel tree under its trunk ("Femoral artery and branches") when it is big enough.
# Nervous: the same for big peripheral nerve trees ("Sciatic nerve and branches").
TRUNK_GROUPS = {"Systemic arteries", "Systemic veins", "Aorta", "Aortic bifurcation"}
TRUNK_MIN = 8 if SYSTEM_ID == "nervous" else 4


def trunk_scope(g):
    if SYSTEM_ID == "nervous":
        return "Peripheral nervous system" in group_path(g)
    return base_name(g.name) in TRUNK_GROUPS


trunk_sizes = {}
for o, g in keep:
    if trunk_scope(g):
        trunk_sizes[trunk_name(o)] = trunk_sizes.get(trunk_name(o), 0) + 1


def trunk_group(o, g):
    if not trunk_scope(g) or trunk_sizes.get(trunk_name(o), 0) < TRUNK_MIN:
        return None
    word = "tributaries" if "Venous system" in group_path(g) else "branches"
    return f"{trunk_name(o)} and {word}"


# Collect manifest data before re-parenting destroys the hierarchy.
groups = {}  # display group name -> {path, parts: {part_id: part}}
group_seen = []
part_home = {}  # part id -> display group it was first seen in
records = []
used_nodes = set()
for o, g in keep:
    part = clean_name(base_name(o.name))
    mesh_id = slug(part)
    side = {"l": "left", "r": "right"}.get(suffix(o.name))
    if base_name(g.name) in MERGE_GROUPS:
        part = base_name(g.name)
        g = nearest_group(g)
    elif SYSTEM_ID in MERGE_HEADS:
        part = merged_part_name(part)
    gname = split_group(base_name(g.name), part)
    gname = GROUP_RENAME.get(gname, gname)
    gname = trunk_group(o, g) or gname
    gname = GROUP_RENAME.get(gname, gname)
    # Keep both sides of a structure together even if the source files them in different groups.
    home = part_home.setdefault(slug(part), gname)
    if home != gname:
        print(f"NOTE: {o.name} is filed under {gname}; kept with its other side in {home}")
        gname = home
    if gname not in groups:
        groups[gname] = {"path": group_path(g), "parts": {}}
        group_seen.append(gname)
    pid = slug(part)
    node = mesh_id + ("__" + side[0] if side else "")
    # Two source meshes can clean to the same name ("Central canal" and "Central canal'").
    n = 2
    while node in used_nodes:
        node = f"{mesh_id}_{n}" + ("__" + side[0] if side else "")
        n += 1
    used_nodes.add(node)
    parts = groups[gname]["parts"]
    entry = parts.setdefault(pid, {"id": pid, "name": part, "nodes": [], "sides": []})
    entry["nodes"].append(node)
    if side:
        entry["sides"].append(side)
    records.append((o, node))

# Detect id collisions across groups (would break picking).
all_ids = [pid for g in groups.values() for pid in g["parts"]]
dupes = {i for i in all_ids if all_ids.count(i) > 1}
if dupes:
    raise SystemExit(f"Duplicate part ids across groups: {sorted(dupes)}")

# Part ids and node names must also be unique across systems (the app indexes them globally).
import glob
import os

for other in glob.glob(os.path.join(os.path.dirname(OUT_JSON), "*.json")):
    if os.path.basename(other) == f"{SYSTEM_ID}.json":
        continue
    with open(other, encoding="utf-8") as f:
        om = json.load(f)
    o_ids = {p["id"] for g in om["groups"] for p in g["parts"]}
    o_nodes = {n for g in om["groups"] for p in g["parts"] for n in p["nodes"]}
    clash = (set(all_ids) & o_ids) | ({n for _, n in records} & o_nodes)
    if clash:
        raise SystemExit(f"Ids also used by {om['id']}: {sorted(clash)}")

# Flatten: bake world transforms into the kept meshes, delete everything else.
keep_objs = {o for o, _ in records}
for o in keep_objs:
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
for o in list(bpy.data.objects):
    if o not in keep_objs:
        bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.object.select_all(action="SELECT")
bpy.context.view_layer.objects.active = next(iter(keep_objs))
bpy.ops.object.make_single_user(object=True, obdata=True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

for o, node in records:
    o.name = node
    o.data.name = node
    o.data.materials.clear()
    # The app colors meshes itself; UVs and vertex colors are dead weight.
    while o.data.uv_layers:
        o.data.uv_layers.remove(o.data.uv_layers[0])
    for attr in [a for a in o.data.color_attributes]:
        o.data.color_attributes.remove(attr)

# Bounds (Blender is Z-up) for the report.
lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for o in keep_objs:
    for v in o.data.vertices:
        for i in range(3):
            lo[i] = min(lo[i], v.co[i])
            hi[i] = max(hi[i], v.co[i])

bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format="GLB",
    export_yup=True,
    export_materials="NONE",
    export_normals=True,
    export_extras=False,
)


def order_key(name):
    root = groups[name]["path"][0] if groups[name]["path"] else ""
    return (
        GROUP_ORDER.index(name) if name in GROUP_ORDER else len(GROUP_ORDER),
        ROOT_ORDER.index(root) if root in ROOT_ORDER else len(ROOT_ORDER),
        # Within a region, parents before their subgroups.
        [natural_key(n) for n in groups[name]["path"]] if root in ROOT_ORDER else [],
        group_seen.index(name),
    )


DEOXY_BLUE = "#5B7FD6"
BRAIN_GREY = "#CFAFA8"


def group_color(path):
    """Cardiovascular follows the textbook convention: deoxygenated vessels are blue. That is
    the systemic veins and the pulmonary arteries; the pulmonary veins carry oxygenated blood.
    Nervous: brain and spinal cord are pinkish grey, which sets them apart from the nerves."""
    if SYSTEM_ID == "nervous":
        return BRAIN_GREY if path and path[0] == "Central nervous system" else None
    if SYSTEM_ID != "cardiovascular" or not path or "Valvular complex of heart" in path:
        return None
    venous = path[0] == "Venous system"
    pulmonary = any("Pulmonary" in n or "lobar artery" in n for n in path)
    return DEOXY_BLUE if venous != pulmonary else None


meta = SYSTEMS.get(SYSTEM_ID, {"name": SYSTEM_ID, "color": "#CCCCCC"})
manifest = {
    "id": SYSTEM_ID,
    "name": meta["name"],
    "color": meta["color"],
    "model": f"models/{SYSTEM_ID}.glb",
    "groups": [
        {
            "id": slug(gname),
            "name": gname,
            "path": groups[gname]["path"],
            **({"color": c} if (c := group_color(groups[gname]["path"])) else {}),
            "parts": sorted(
                (
                    {
                        **p,
                        "sides": sorted(p["sides"]) or None,
                        **({"hidden": True} if DEFAULT_HIDDEN.match(p["name"]) else {}),
                    }
                    for p in groups[gname]["parts"].values()
                ),
                key=lambda p: natural_key(p["name"]),
            ),
        }
        for gname in sorted(groups, key=order_key)
    ],
}
with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=1, ensure_ascii=False)

n_parts = sum(len(g["parts"]) for g in manifest["groups"])
print(
    f"CONVERTED {SYSTEM_ID}: {len(records)} meshes, {n_parts} parts, {len(manifest['groups'])} groups;"
    f" bounds z {lo.z:.3f}..{hi.z:.3f} x {lo.x:.3f}..{hi.x:.3f} y {lo.y:.3f}..{hi.y:.3f}"
)
