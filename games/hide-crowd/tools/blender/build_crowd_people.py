"""Build the crowd of 藏在人群里 · Hide in the Crowd: two rigged bodies, their hair and bags, and the
clips they move with, from Quaternius's CC0 Universal Animation Library (1 and 2).

Get the two packs (CC0 1.0, by Quaternius) from https://quaternius.com/packs/universalanimationlibrary.html
and https://quaternius.com/packs/universalanimationlibrary2.html (also on OpenGameArt), then from the
game's folder:

  UAL1_FBX=".../Animation Library[Standard]/Unreal Engine/AL_Standard.fbx" \\
  UAL2_GLB=".../Universal Animation Library 2 [Standard]/Unreal-Godot/UAL2_Standard.glb" \\
  UAL2_FEMALE_GLB=".../Universal Animation Library 2 [Standard]/Female Mannequin/Unreal-Godot/Mannequin_F.glb" \\
  blender --background --python tools/blender/build_crowd_people.py

(or the same with `python` where Blender 5.2+ is installed as the `bpy` module).

It writes src/client/art/crowd-people.glb (the man's body, the hair and bags, the ten clips) and
crowd-people-f.glb (the woman's body, her hair and bags). What it does to the packs:

* the clips: ten of them, renamed for what the game uses them for; finger bones, the clips' finger
  tracks, every bone's moving and scaling tracks but the hips' (so the woman's narrower shoulders stay
  hers), sampled at 15 a second, the one-shots trimmed;
* the bodies: the hands' fingers merged into the hands (the crowd is seen from across a room), the
  bodies thinned to about 3,000 points, and every face told which part of the clothes it is (the
  `PART` table): the game paints each look's colours on them;
* hair, caps, bags and a pair of eyes are new, simple shapes made here, each on the head's or the
  back's bone.

No outside textures. Everything it reads is CC0; everything it makes is ours.
"""

from __future__ import annotations

import json
import os
import struct
from array import array
from pathlib import Path

import bpy  # (first: as a Python module, bpy is what makes bmesh and mathutils importable)
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "src" / "client" / "art"

# what the game calls each clip, and where it comes from (pack, name)
CLIPS = {
    "idle": ("ual1", "Idle_Loop"),
    "idle_arms": ("ual2", "Idle_FoldArms_Loop"),
    "idle_phone": ("ual2", "Idle_TalkingPhone_Loop"),
    "walk": ("ual1", "Walk_Loop"),
    "walk_brisk": ("ual1", "Walk_Formal_Loop"),
    "jog": ("ual1", "Jog_Fwd_Loop"),
    "punch": ("ual1", "Punch_Cross"),
    # tagged: knocked off their feet, then up again (the get-up starts where the fall ends, on the back)
    "hit": ("ual2", "Hit_Knockback"),
    "getup": ("ual2", "LayToIdle"),
    # a foul (a passer-by punched): the punch bounces back
    "flinch": ("ual1", "Hit_Chest"),
}
# one-shots keep only the frames that matter (inclusive, counted from the clip's first frame)
TRIM = {"punch": (0, 21), "hit": (2, 14), "getup": (3, 43), "flinch": (0, 10)}

# the bones the game keeps; everything else (fingers, the end bones) goes
KEEP_BONES = [
    "root", "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head",
    "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
    "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
    "thigh_l", "calf_l", "foot_l", "ball_l",
    "thigh_r", "calf_r", "foot_r", "ball_r",
]

# which part of the clothes a face is, by the bone that moves it most; the game's palette has one
# cell per part (src/client/people.ts), so a look can give a part its own colour or the skin's
PART = {
    "Head": "head", "neck_01": "neck",
    "spine_01": "top", "spine_02": "top", "spine_03": "top", "clavicle_l": "top", "clavicle_r": "top",
    "upperarm_l": "top", "upperarm_r": "top",
    "lowerarm_l": "forearm", "lowerarm_r": "forearm",
    "hand_l": "hand", "hand_r": "hand",
    "pelvis": "pants", "thigh_l": "pants", "thigh_r": "pants",
    "calf_l": "shin", "calf_r": "shin",
    "foot_l": "shoes", "ball_l": "shoes", "foot_r": "shoes", "ball_r": "shoes",
}
# the palette's cells, left to right (people.ts reads them in this order)
CELLS = ["head", "neck", "top", "forearm", "hand", "pants", "shin", "shoes", "hair", "bag", "accent", "strap", "eyes"]
PALETTE_WIDTH = 16

FINGERS = ("thumb", "index", "middle", "ring", "pinky")


def say(text: str) -> None:
    print(f"[crowd-people] {text}", flush=True)


def need(name: str) -> str:
    path = os.environ.get(name)
    if not path or not Path(path).exists():
        raise SystemExit(f"set {name} to the file from Quaternius's pack (see the top of this script)")
    return path


def imported(run) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    run()
    return [obj for obj in bpy.data.objects if obj not in before]


def channelbag(action: bpy.types.Action):
    """The action's curves (Blender 4.4+ keeps them per slot)."""
    from bpy_extras import anim_utils

    return anim_utils.action_get_channelbag_for_slot(action, action.slots[0])


def bone_of(data_path: str) -> str | None:
    if not data_path.startswith('pose.bones["'):
        return None
    return data_path.split('"')[1]


def tidy_action(action: bpy.types.Action, first: int, last: int) -> None:
    """Fingers, end bones, and every move or scale but the hips' go; the clip starts at frame 0."""
    bag = channelbag(action)
    for curve in list(bag.fcurves):
        bone = bone_of(curve.data_path)
        prop = curve.data_path.rsplit(".", 1)[-1]
        drop = bone is None or bone not in KEEP_BONES or prop == "scale" or (prop == "location" and bone != "pelvis")
        if drop:
            bag.fcurves.remove(curve)
            continue
        # trim, then slide the keys so the clip starts at 0
        # (from the end: removing a key renumbers the ones after it)
        for index in range(len(curve.keyframe_points) - 1, -1, -1):
            frame = curve.keyframe_points[index].co.x
            if frame < first - 0.01 or frame > last + 0.01:
                curve.keyframe_points.remove(curve.keyframe_points[index], fast=True)
        for point in curve.keyframe_points:
            point.co.x -= first
            point.handle_left.x -= first
            point.handle_right.x -= first
        curve.update()


def merge_fingers_into_hands(body: bpy.types.Object) -> None:
    groups = {group.name: group for group in body.vertex_groups}
    for side in ("l", "r"):
        hand = groups[f"hand_{side}"]
        finger_groups = [group for name, group in groups.items() if name.endswith(f"_{side}") and name.split("_")[0] in FINGERS]
        indices = {group.index for group in finger_groups}
        for vertex in body.data.vertices:
            extra = sum(element.weight for element in vertex.groups if element.group in indices)
            if extra > 0:
                hand.add([vertex.index], extra, "ADD")
        for group in finger_groups:
            body.vertex_groups.remove(group)
    for group in list(body.vertex_groups):
        if group.name not in KEEP_BONES:
            body.vertex_groups.remove(group)


def remove_bones(rig: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for bone in list(rig.data.edit_bones):
        if bone.name not in KEEP_BONES:
            rig.data.edit_bones.remove(bone)
    bpy.ops.object.mode_set(mode="OBJECT")


def weld(body: bpy.types.Object) -> None:
    """One point where the pack's file has several (the woman's file splits them at every seam)."""
    work = bmesh.new()
    work.from_mesh(body.data)
    bmesh.ops.remove_doubles(work, verts=work.verts, dist=1e-5)
    loose = [vert for vert in work.verts if not vert.link_faces]
    bmesh.ops.delete(work, geom=loose, context="VERTS")
    work.to_mesh(body.data)
    work.free()


def decimate(body: bpy.types.Object, ratio: float, group: str | None = None) -> None:
    if ratio >= 1:
        return
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    modifier = body.modifiers.new("thin", "DECIMATE")
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = True
    if group:
        # (with a group, only its points are thinned: the rest keeps its shape)
        modifier.vertex_group = group
        modifier.vertex_group_factor = 1.0
    bpy.ops.object.modifier_move_to_index(modifier=modifier.name, index=0)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def thin(body: bpy.types.Object, hand_faces: int, total_faces: int) -> None:
    """The hands first (three quarters of the pack's faces are fingers), then the whole body if it needs it."""
    weld(body)
    groups = {group.name: group for group in body.vertex_groups}
    hands = body.vertex_groups.new(name="thin_hands")
    hand_indices = {groups["hand_l"].index, groups["hand_r"].index}
    hand_vertices = set()
    for vertex in body.data.vertices:
        weight = sum(element.weight for element in vertex.groups if element.group in hand_indices)
        if weight > 0:
            hands.add([vertex.index], min(1.0, weight), "REPLACE")
        if weight > 0.5:
            hand_vertices.add(vertex.index)
    now = sum(1 for polygon in body.data.polygons if all(index in hand_vertices for index in polygon.vertices))
    if now > hand_faces:
        rest = len(body.data.polygons) - now
        decimate(body, (rest + hand_faces) / len(body.data.polygons), "thin_hands")
    body.vertex_groups.remove(body.vertex_groups["thin_hands"])
    if len(body.data.polygons) > total_faces:
        decimate(body, total_faces / len(body.data.polygons))


def cell_uv(cell: str) -> tuple[float, float]:
    return ((CELLS.index(cell) + 0.5) / PALETTE_WIDTH, 0.5)


def paint_parts(body: bpy.types.Object) -> dict[str, int]:
    """Every face gets the palette cell of the part most of its corners belong to."""
    names = {group.index: group.name for group in body.vertex_groups}
    part_of_vertex = []
    for vertex in body.data.vertices:
        best = max(vertex.groups, key=lambda element: element.weight, default=None)
        part_of_vertex.append(PART.get(names.get(best.group, ""), "top") if best else "top")
    mesh = body.data
    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    layer = mesh.uv_layers.new(name="palette")
    counts: dict[str, int] = {}
    for polygon in mesh.polygons:
        votes: dict[str, int] = {}
        for index in polygon.vertices:
            votes[part_of_vertex[index]] = votes.get(part_of_vertex[index], 0) + 1
        part = max(votes, key=lambda name: (votes[name], -CELLS.index(name)))
        counts[part] = counts.get(part, 0) + 1
        u, v = cell_uv(part)
        for loop in polygon.loop_indices:
            layer.data[loop].uv = (u, v)
    return counts


def shape(name: str, build, cell: str) -> bpy.types.Object:
    """A small mesh made with bmesh, flat-coloured with one palette cell."""
    mesh = bpy.data.meshes.new(name)
    work = bmesh.new()
    build(work)
    work.to_mesh(mesh)
    work.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    layer = mesh.uv_layers.new(name="palette")
    u, v = cell_uv(cell)
    for item in layer.data:
        item.uv = (u, v)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def ellipsoid(work, center, radii, segments=14, rings=9, keep=lambda co: True):
    """An ellipsoid (optionally with the faces outside `keep` removed)."""
    result = bmesh.ops.create_uvsphere(work, u_segments=segments, v_segments=rings, radius=1.0)
    verts = result["verts"]
    for vert in verts:
        vert.co = Vector((vert.co.x * radii[0] + center[0], vert.co.y * radii[1] + center[1], vert.co.z * radii[2] + center[2]))
    gone = [face for face in work.faces if face.verts[0] in verts and not all(keep(vert.co) for vert in face.verts)]
    bmesh.ops.delete(work, geom=gone, context="FACES")


def rounded_box(work, center, size, bevel=0.02):
    result = bmesh.ops.create_cube(work, size=1.0)
    for vert in result["verts"]:
        vert.co = Vector((vert.co.x * size[0] + center[0], vert.co.y * size[1] + center[1], vert.co.z * size[2] + center[2]))
    bmesh.ops.bevel(work, geom=[edge for edge in work.edges if edge.verts[0] in result["verts"]], offset=bevel, segments=2, affect="EDGES")


def face_front(person: bpy.types.Object, eye_z: float) -> float:
    """How far forward the face is at the eyes (the rig faces -Y): the eyes sit on it."""
    points = [person.matrix_world @ vertex.co for vertex in person.data.vertices]
    near = [co.y for co in points if abs(co.z - eye_z) < 0.02 and abs(abs(co.x) - 0.034) < 0.018]
    return min(near) if near else -0.11


def accessories(top: float, face: float) -> list[bpy.types.Object]:
    """Hair, caps, bags and eyes around a head whose crown is at `top` and whose face at the eyes is at
    `face` (the rig faces -Y, Z is up)."""
    cx, cy = 0.0, -0.003
    crown = top + 0.012
    head_center = top - 0.135
    items = []
    # two dark eyes, set into the face (the crowd reads where everyone is looking)
    eye_z = top - 0.112
    def eyes(work):
        for side in (-1, 1):
            ellipsoid(work, (side * 0.034, face + 0.004, eye_z), (0.0125, 0.007, 0.0165), segments=8, rings=6)
    items.append(shape("eyes", eyes, "eyes"))
    # short hair: a cap over the crown and the back, open at the face
    items.append(shape("hair_short", lambda w: ellipsoid(w, (cx, cy + 0.006, head_center + 0.02), (0.097, 0.125, crown - head_center - 0.02),
                                                       keep=lambda co: co.z > head_center - 0.03 + max(0.0, -(co.y - cy) - 0.03) * 1.6), "hair"))
    # a bun: the same cap, and a knot at the back of the crown
    def bun(work):
        ellipsoid(work, (cx, cy + 0.006, head_center + 0.02), (0.096, 0.124, crown - head_center - 0.022),
                  keep=lambda co: co.z > head_center - 0.035 + max(0.0, -(co.y - cy) - 0.03) * 1.6)
        ellipsoid(work, (cx, cy + 0.11, crown - 0.03), (0.055, 0.05, 0.05), segments=10, rings=7)
    items.append(shape("hair_bun", bun, "hair"))
    # a ponytail down the back of the head
    def ponytail(work):
        ellipsoid(work, (cx, cy + 0.006, head_center + 0.02), (0.096, 0.124, crown - head_center - 0.022),
                  keep=lambda co: co.z > head_center - 0.035 + max(0.0, -(co.y - cy) - 0.03) * 1.6)
        ellipsoid(work, (cx, cy + 0.125, head_center - 0.02), (0.035, 0.035, 0.1), segments=8, rings=7)
    items.append(shape("hair_tail", ponytail, "hair"))
    # a baseball cap: a dome and a peak (the peak in the look's accent colour)
    items.append(shape("cap", lambda w: ellipsoid(w, (cx, cy + 0.004, head_center + 0.035), (0.1, 0.128, crown - head_center - 0.025),
                                                 keep=lambda co: co.z > head_center + 0.02), "hair"))
    items.append(shape("cap_peak", lambda w: rounded_box(w, (cx, cy - 0.14, head_center + 0.04), (0.17, 0.11, 0.012), bevel=0.004), "accent"))
    # a backpack and its straps on the back (the rig's back is +Y)
    items.append(shape("backpack", lambda w: rounded_box(w, (0.0, 0.17, 1.24), (0.27, 0.13, 0.34), bevel=0.035), "bag"))
    def straps(work):
        for side in (-1, 1):
            rounded_box(work, (side * 0.085, -0.02, 1.36), (0.035, 0.24, 0.02), bevel=0.006)
    items.append(shape("straps", straps, "strap"))
    # a satchel at the hip
    items.append(shape("satchel", lambda w: rounded_box(w, (0.17, 0.0, 0.98), (0.07, 0.2, 0.16), bevel=0.02), "bag"))
    return items


def bind(item: bpy.types.Object, rig: bpy.types.Object, bone: str) -> None:
    """Keep the object where it is, on the bone (it rides along, unbent)."""
    world = item.matrix_world.copy()
    item.parent = rig
    item.parent_type = "BONE"
    item.parent_bone = bone
    bpy.context.view_layer.update()
    item.matrix_world = world


BAG_BONE = {"backpack": "spine_03", "straps": "spine_03", "satchel": "pelvis"}


def export(objects: list[bpy.types.Object], path: Path, animations: bool) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_materials="NONE",
        export_texcoords=True,
        export_normals=True,
        export_skins=True,
        export_animations=animations,
        export_animation_mode="NLA_TRACKS",
        export_frame_step=2,
        export_optimize_animation_size=True,
        export_force_sampling=True,
        export_def_bones=True,
        export_cameras=False,
        export_lights=False,
        # (no meshopt: the exporter's version doesn't quantize, and on unquantized data it only adds a copy)
        export_meshopt_compression_enable=False,
    )
    say(f"{path.name}: {path.stat().st_size:,} bytes")


# --- after Blender: a smaller file (the exporter writes every bone's moves and sizes, all as floats) ---

COMPONENT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def slim_glb(path: Path) -> None:
    """Keep the clips' turns (and the hips' moves), and store numbers as small as they can be read back:
    turns as 16-bit, normals as 8-bit (KHR_mesh_quantization), palette UVs as 16-bit, weights as 8-bit."""
    data = path.read_bytes()
    json_length = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + json_length])
    blob = data[20 + json_length + 8:]
    accessors, views = gltf["accessors"], gltf["bufferViews"]

    def read(index: int) -> list[float]:
        accessor = accessors[index]
        code, size = COMPONENT[accessor["componentType"]]
        view = views[accessor["bufferView"]]
        count = accessor["count"] * WIDTH[accessor["type"]]
        start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        stride = view.get("byteStride")
        if stride:
            width = WIDTH[accessor["type"]]
            values = []
            for item in range(accessor["count"]):
                values.extend(struct.unpack_from(f"<{width}{code}", blob, start + item * stride))
            return values
        return list(struct.unpack_from(f"<{count}{code}", blob, start))

    # what each accessor becomes: (values, componentType, normalized)
    plan: dict[int, tuple[list, int, bool]] = {}
    names = [node.get("name", "") for node in gltf["nodes"]]
    for animation in gltf.get("animations", []):
        keep = []
        for channel in animation["channels"]:
            target = channel["target"]
            if target["path"] == "rotation" or (target["path"] == "translation" and names[target["node"]] == "pelvis"):
                keep.append(channel)
        used = sorted({channel["sampler"] for channel in keep})
        renumber = {old: new for new, old in enumerate(used)}
        animation["samplers"] = [animation["samplers"][old] for old in used]
        for channel in keep:
            channel["sampler"] = renumber[channel["sampler"]]
        animation["channels"] = keep
        for channel in keep:
            sampler = animation["samplers"][channel["sampler"]]
            if channel["target"]["path"] == "rotation":
                plan[sampler["output"]] = ([max(-32767, min(32767, round(v * 32767))) for v in read(sampler["output"])], 5122, True)
    for mesh in gltf["meshes"]:
        for primitive in mesh["primitives"]:
            attributes = primitive["attributes"]
            if "NORMAL" in attributes:
                plan[attributes["NORMAL"]] = ([max(-127, min(127, round(v * 127))) for v in read(attributes["NORMAL"])], 5120, True)
            if "TEXCOORD_0" in attributes:
                plan[attributes["TEXCOORD_0"]] = ([max(0, min(65535, round(v * 65535))) for v in read(attributes["TEXCOORD_0"])], 5123, True)
            if "WEIGHTS_0" in attributes:
                weights = read(attributes["WEIGHTS_0"])
                packed = []
                for start in range(0, len(weights), 4):
                    group = [round(w * 255) for w in weights[start:start + 4]]
                    group[group.index(max(group))] += 255 - sum(group)  # (they still add up to one)
                    packed.extend(group)
                plan[attributes["WEIGHTS_0"]] = (packed, 5121, True)

    # every accessor still in use, written again into one tidy buffer
    used: list[int] = []
    def use(index):
        if index is not None and index not in used:
            used.append(index)
    for mesh in gltf["meshes"]:
        for primitive in mesh["primitives"]:
            for index in primitive["attributes"].values():
                use(index)
            use(primitive.get("indices"))
    for skin in gltf.get("skins", []):
        use(skin.get("inverseBindMatrices"))
    for animation in gltf.get("animations", []):
        for sampler in animation["samplers"]:
            use(sampler["input"])
            use(sampler["output"])
    out = bytearray()
    new_views, new_accessors, renumber = [], [], {}
    for old in used:
        accessor = dict(accessors[old])
        values, component, normalized = plan.get(old, (read(old), accessor["componentType"], accessor.get("normalized", False)))
        code, size = COMPONENT[component]
        width = WIDTH[accessor["type"]]
        # vertex attributes keep 4-byte rows (an 8-bit normal is padded to four)
        is_vertex = any(old in primitive["attributes"].values() for mesh in gltf["meshes"] for primitive in mesh["primitives"])
        row = width * size
        stride = (row + 3) // 4 * 4 if is_vertex and row % 4 else None
        while len(out) % 4:
            out.append(0)
        view = {"buffer": 0, "byteOffset": len(out)}
        if stride:
            for item in range(accessor["count"]):
                out.extend(struct.pack(f"<{width}{code}", *values[item * width:(item + 1) * width]))
                out.extend(b"\0" * (stride - row))
            view["byteStride"] = stride
        else:
            out.extend(array(code, values).tobytes())
        view["byteLength"] = len(out) - view["byteOffset"]
        if accessors[old] is not None and views[accessors[old]["bufferView"]].get("target"):
            view["target"] = views[accessors[old]["bufferView"]]["target"]
        accessor["bufferView"] = len(new_views)
        accessor.pop("byteOffset", None)
        accessor["componentType"] = component
        if normalized:
            accessor["normalized"] = True
        if accessor["type"] != "SCALAR" or accessor["componentType"] != 5126:
            if accessor.get("min") is not None and normalized:
                accessor.pop("min", None)
                accessor.pop("max", None)
        new_views.append(view)
        renumber[old] = len(new_accessors)
        new_accessors.append(accessor)
    for mesh in gltf["meshes"]:
        for primitive in mesh["primitives"]:
            primitive["attributes"] = {key: renumber[value] for key, value in primitive["attributes"].items()}
            if "indices" in primitive:
                primitive["indices"] = renumber[primitive["indices"]]
    for skin in gltf.get("skins", []):
        if "inverseBindMatrices" in skin:
            skin["inverseBindMatrices"] = renumber[skin["inverseBindMatrices"]]
    for animation in gltf.get("animations", []):
        for sampler in animation["samplers"]:
            sampler["input"] = renumber[sampler["input"]]
            sampler["output"] = renumber[sampler["output"]]
    gltf["accessors"], gltf["bufferViews"] = new_accessors, new_views
    gltf["buffers"] = [{"byteLength": len(out)}]
    gltf["extensionsUsed"] = sorted(set(gltf.get("extensionsUsed", [])) | {"KHR_mesh_quantization"})
    gltf["extensionsRequired"] = sorted(set(gltf.get("extensionsRequired", [])) | {"KHR_mesh_quantization"})
    text = json.dumps(gltf, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    while len(out) % 4:
        out.append(0)
    total = 12 + 8 + len(text) + 8 + len(out)
    path.write_bytes(struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(text), 0x4E4F534A) + text + struct.pack("<II", len(out), 0x004E4942) + bytes(out))
    say(f"{path.name}: {path.stat().st_size:,} bytes after slimming")


def main() -> None:
    ual1, ual2, female = need("UAL1_FBX"), need("UAL2_GLB"), need("UAL2_FEMALE_GLB")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 30

    # the man's body and its rig, with the first pack's clips
    first = imported(lambda: bpy.ops.import_scene.fbx(filepath=ual1, automatic_bone_orientation=False))
    rig = next(obj for obj in first if obj.type == "ARMATURE")
    body = next(obj for obj in first if obj.type == "MESH")
    rig.name, body.name = "people_m", "body_m"
    # the second pack: its clips only (the same rig, bone for bone)
    second = imported(lambda: bpy.ops.import_scene.gltf(filepath=ual2))
    for obj in second:
        bpy.data.objects.remove(obj, do_unlink=True)
    # the woman's body and her rig (narrower shoulders, otherwise the same)
    third = imported(lambda: bpy.ops.import_scene.gltf(filepath=female))
    rig_f = next(obj for obj in third if obj.type == "ARMATURE")
    body_f = next(obj for obj in third if obj.type == "MESH" and len(obj.data.vertices) > 100)
    for obj in third:
        if obj not in (rig_f, body_f):
            bpy.data.objects.remove(obj, do_unlink=True)
    rig_f.name, body_f.name = "people_f", "body_f"

    # the clips, tidied, each on its own NLA track of the man's rig
    rig.animation_data_create()
    rig.animation_data.action = None
    for name, (pack, source) in CLIPS.items():
        action = bpy.data.actions.get(source if pack == "ual2" else f"Rig|Rig|{source}") or bpy.data.actions.get(source)
        if action is None:
            raise SystemExit(f"the pack has no clip called {source}")
        start, end = (int(action.frame_range[0]), int(action.frame_range[1]))
        first_frame, last_frame = (start + TRIM[name][0], start + TRIM[name][1]) if name in TRIM else (start, end)
        say(f"clip {name}: the pack's frames {start}-{end}")
        tidy_action(action, first_frame, last_frame)
        action.name = name
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, action)
        strip.action_slot = action.slots[0]
        track.mute = True
        say(f"clip {name} <- {source}: frames {first_frame}-{last_frame} ({(last_frame - first_frame) / 30:.2f} s)")

    # bones, fingers, thinning, the parts of the clothes
    body.data.name, body_f.data.name = "body_m", "body_f"
    for person, skeleton in ((body, rig), (body_f, rig_f)):
        merge_fingers_into_hands(person)
        remove_bones(skeleton)
        thin(person, hand_faces=240, total_faces=2600)
        counts = paint_parts(person)
        say(f"{person.name}: {len(person.data.vertices)} points, {len(person.data.polygons)} faces, parts {counts}")
        for polygon in person.data.polygons:
            polygon.use_smooth = True

    # one material for the whole body: the game paints it (the parts are in the UVs)
    for person in (body, body_f):
        person.data.materials.clear()

    # hair, caps and bags, made here, one set on each body's bones (the man's first: the names are free again
    # once his file is written, so the woman's set has the same names)
    def dress(skeleton: bpy.types.Object, person: bpy.types.Object) -> list[bpy.types.Object]:
        top = max((person.matrix_world @ vertex.co).z for vertex in person.data.vertices)
        made = accessories(top, face_front(person, top - 0.112))
        for item in made:
            bind(item, skeleton, BAG_BONE.get(item.name, "Head"))
        return made

    ART.mkdir(parents=True, exist_ok=True)
    gear_m = dress(rig, body)
    export([rig, body, *gear_m], ART / "crowd-people.glb", animations=True)
    slim_glb(ART / "crowd-people.glb")
    for obj in (rig, body, *gear_m):
        bpy.data.objects.remove(obj, do_unlink=True)
    gear_f = dress(rig_f, body_f)
    rig_f.animation_data_clear()
    export([rig_f, body_f, *gear_f], ART / "crowd-people-f.glb", animations=False)
    slim_glb(ART / "crowd-people-f.glb")


main()
