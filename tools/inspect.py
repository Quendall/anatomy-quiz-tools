"""Dump the object hierarchy of a Z-Anatomy FBX to JSON.

Usage:
  blender -b --factory-startup -P tools/inspect.py -- <input.fbx> <report.json>
"""
import json
import sys
from collections import Counter

import bpy

argv = sys.argv[sys.argv.index("--") + 1 :]
src, out = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)


def node(o):
    d = {"name": o.name, "type": o.type}
    if o.type == "MESH":
        d["verts"] = len(o.data.vertices)
        d["mats"] = [m.name for m in o.data.materials if m]
    kids = sorted(o.children, key=lambda c: c.name)
    if kids:
        d["children"] = [node(c) for c in kids]
    return d


roots = sorted((o for o in bpy.data.objects if o.parent is None), key=lambda o: o.name)
types = Counter(o.type for o in bpy.data.objects)
suffixes = Counter(
    o.name.rsplit(".", 1)[-1] for o in bpy.data.objects if "." in o.name and len(o.name.rsplit(".", 1)[-1]) <= 3
)
mesh_verts = sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH")

report = {
    "source": src,
    "object_types": dict(types),
    "short_suffixes": dict(suffixes.most_common(30)),
    "total_mesh_vertices": mesh_verts,
    "roots": [node(r) for r in roots],
}
with open(out, "w", encoding="utf-8") as f:
    json.dump(report, f, indent=1)
print("WROTE", out, dict(types), "verts", mesh_verts)
