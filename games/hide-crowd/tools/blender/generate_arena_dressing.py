"""Build original, mobile-budgeted 3D dressing for the three arenas of 藏在人群里 · Hide in the Crowd.

Run from the game folder with:
  blender --background --python tools/blender/generate_arena_dressing.py

The assets use Blender primitives and meshes authored here. No game files, models,
textures, logos, or sounds are imported.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "src" / "client" / "art"
PREVIEW = ROOT / "dist" / "blender-previews"


def srgb_to_linear(channel: float) -> float:
    channel /= 255.0
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def make_material(name: str, hex_color: str, roughness: float = 0.78, metallic: float = 0.0) -> bpy.types.Material:
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = tuple(srgb_to_linear(int(hex_color[index:index + 2], 16)) for index in (1, 3, 5)) + (1.0,)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = material.diffuse_color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    return material


M = {
    "bark": make_material("Seawall | cedar bark", "#71503C", 0.92),
    "leaf_dark": make_material("Seawall | deep cedar", "#2D5948", 0.94),
    "leaf": make_material("Seawall | cedar", "#42785B", 0.96),
    "leaf_light": make_material("Seawall | cedar tips", "#68956A", 0.96),
    "wood": make_material("Seawall | warm timber", "#A9754E", 0.8),
    "wood_light": make_material("Seawall | sunlit timber", "#C39667", 0.82),
    "metal": make_material("Seawall | graphite metal", "#394A4B", 0.42, 0.55),
    "metal_light": make_material("Seawall | brushed metal", "#80908A", 0.38, 0.62),
    "stone": make_material("Seawall | warm stone", "#CFC5AC", 0.93),
    "sign": make_material("Seawall | park sign", "#246D64", 0.74),
    "flower": make_material("Seawall | wildflowers", "#F1C45E", 0.68),
    "flower_pink": make_material("Seawall | pink flowers", "#D98578", 0.72),
    "glass": make_material("Transit | blue-green glass", "#7DB7B9", 0.26, 0.08),
    "train": make_material("Transit | deep teal carriage", "#277C78", 0.54, 0.08),
    "train_light": make_material("Transit | enamel panels", "#D7E0D6", 0.48),
    "train_dark": make_material("Transit | window glass", "#243B4D", 0.22, 0.12),
    "safety": make_material("Transit | safety yellow", "#E6B84D", 0.74),
    "tile": make_material("Transit | station stone", "#B8C7C3", 0.86),
    "red": make_material("Courtyard | vermilion lacquer", "#B74737", 0.64),
    "red_light": make_material("Courtyard | lantern silk", "#E07852", 0.58),
    "jade": make_material("Courtyard | glazed jade", "#387C6A", 0.54),
    "gold": make_material("Courtyard | brushed brass", "#D2A74F", 0.42, 0.42),
    "timber": make_material("Courtyard | dark timber", "#604735", 0.88),
    "timber_light": make_material("Courtyard | warm timber", "#9D704A", 0.82),
    "paper": make_material("Courtyard | rice paper", "#F2DDA7", 0.88),
    "stone_light": make_material("Courtyard | pale stone", "#D5CCB6", 0.92),
    "stone_dark": make_material("Courtyard | slate", "#717C78", 0.94),
    "ink": make_material("Shared | dark details", "#293A3D", 0.78),
}


def blender_position(x: float, y: float, z: float) -> tuple[float, float, float]:
    """Convert game coordinates (x, up, depth) to Blender (x, depth, up)."""
    return (x, -z, y)


def put_in_group(obj: bpy.types.Object, root: bpy.types.Object) -> bpy.types.Object:
    obj.parent = root
    root["asset_source"] = "Original procedural Blender geometry"
    return obj


def bevel(obj: bpy.types.Object, amount: float = 0.035, segments: int = 2) -> None:
    if amount <= 0:
        return
    modifier = obj.modifiers.new("Soft authored edges", "BEVEL")
    modifier.width = amount
    modifier.segments = segments
    obj.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for candidate in list(obj.modifiers):
        if candidate.type == "WEIGHTED_NORMAL":
            bpy.ops.object.modifier_apply(modifier=candidate.name)


def box(root: bpy.types.Object, name: str, x: float, y: float, z: float,
        width: float, height: float, depth: float, material: bpy.types.Material,
        edge: float = 0.035) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=blender_position(x, y, z))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (width, depth, height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    bevel(obj, min(edge, min(obj.dimensions) * 0.22))
    return put_in_group(obj, root)


def cylinder(root: bpy.types.Object, name: str, x: float, y: float, z: float,
             radius: float, height: float, material: bpy.types.Material,
             vertices: int = 12, bevel_amount: float = 0.012) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=height,
                                        location=blender_position(x, y, z))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    if bevel_amount:
        bevel(obj, bevel_amount, 2)
    return put_in_group(obj, root)


def cone(root: bpy.types.Object, name: str, x: float, y: float, z: float,
         radius: float, height: float, material: bpy.types.Material,
         vertices: int = 10) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=0.0, depth=height,
                                    location=blender_position(x, y, z))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    return put_in_group(obj, root)


def sphere(root: bpy.types.Object, name: str, x: float, y: float, z: float,
           width: float, height: float, depth: float, material: bpy.types.Material,
           segments: int = 12) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(6, segments // 2),
                                         radius=1, location=blender_position(x, y, z))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (width / 2, depth / 2, height / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return put_in_group(obj, root)


def bar(root: bpy.types.Object, name: str, start: tuple[float, float, float],
        end: tuple[float, float, float], radius: float,
        material: bpy.types.Material, vertices: int = 8) -> bpy.types.Object:
    a = Vector(blender_position(*start))
    b = Vector(blender_position(*end))
    delta = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=delta.length,
                                        location=(a + b) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    obj.data.materials.append(material)
    bevel(obj, min(0.012, radius * 0.2), 2)
    return put_in_group(obj, root)


def arch_mesh(root: bpy.types.Object, name: str, x_half: float, z_front: float, z_back: float,
              center_height: float, edge_lift: float, thickness: float,
              material: bpy.types.Material, center_x: float = 0.0) -> bpy.types.Object:
    xs = [-x_half, -x_half * 0.72, -x_half * 0.38, 0.0, x_half * 0.38, x_half * 0.72, x_half]
    zs = [z_back, (z_back * 2 + z_front) / 3, (z_back + z_front * 2) / 3, z_front]
    verts: list[tuple[float, float, float]] = []
    for layer in (0, 1):
        for z in zs:
            for x in xs:
                across = abs(x) / x_half
                along = abs((z - (z_front + z_back) / 2) / ((z_front - z_back) / 2))
                h = center_height + edge_lift * across * across + edge_lift * 0.48 * along * along
                if layer:
                    h -= thickness
                verts.append(blender_position(center_x + x, h, z))
    row = len(xs)
    plane = row * len(zs)
    faces: list[tuple[int, ...]] = []
    for layer in (0, 1):
        base = layer * plane
        for zi in range(len(zs) - 1):
            for xi in range(row - 1):
                a = base + zi * row + xi
                b = a + 1
                d = base + (zi + 1) * row + xi
                c = d + 1
                # z-depth maps to Blender's negative Y, so reverse the top sheet
                # winding to make normals face upward in Blender and Three.js.
                faces.append((d, c, b, a) if layer == 0 else (a, b, c, d))
    for zi in range(len(zs) - 1):
        for xi in (0, row - 1):
            a = zi * row + xi
            b = (zi + 1) * row + xi
            faces.append((a, b, b + plane, a + plane))
    for zi in (0, len(zs) - 1):
        for xi in range(row - 1):
            a = zi * row + xi
            b = a + 1
            faces.append((a, b, b + plane, a + plane))
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return put_in_group(obj, root)


def new_group(name: str) -> bpy.types.Object:
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root["asset_source"] = "Original procedural Blender geometry"
    return root


def cedar(root: bpy.types.Object, x: float, z: float, scale: float = 1.0) -> None:
    cylinder(root, "Cedar | trunk", x, 1.35 * scale, z, 0.19 * scale, 2.7 * scale, M["bark"], 9)
    for branch in (-1, 1):
        bar(root, "Cedar | branch", (x, 1.45 * scale, z),
            (x + branch * 0.46 * scale, 2.35 * scale, z + 0.04 * scale), 0.07 * scale, M["bark"])
    levels = [
        (2.55, 1.32, 1.9, "leaf_dark"),
        (3.35, 1.08, 1.7, "leaf"),
        (4.08, 0.82, 1.52, "leaf_light"),
        (4.76, 0.47, 1.22, "leaf"),
    ]
    for level, (y, radius, h, mat_name) in enumerate(levels):
        cone(root, "Cedar | layered crown", x, y * scale, z, radius * scale, h * scale, M[mat_name], 9)
        for side, offset in ((-1, -0.32), (1, 0.34)):
            sphere(root, "Cedar | bough", x + side * radius * 0.44 * scale,
                   (y - 0.26 + (level % 2) * 0.12) * scale, z + offset * scale,
                   0.82 * scale, 0.66 * scale, 0.88 * scale, M[mat_name], 10)


def bench(root: bpy.types.Object, x: float, z: float, facing: int = 1) -> None:
    # Five individually modeled slats, cast supports, arm rests, and back rails.
    for slat in range(5):
        box(root, "Bench | seat slat", x, 0.55 + slat * 0.01, z + facing * (slat - 2) * 0.1,
            1.88, 0.09, 0.105, M["wood_light"] if slat % 2 == 0 else M["wood"] , 0.022)
    for side in (-1, 1):
        sx = x + side * 0.72
        box(root, "Bench | cast foot", sx, 0.26, z, 0.12, 0.52, 0.12, M["metal"], 0.035)
        box(root, "Bench | side plate", sx, 0.45, z, 0.1, 0.12, 0.56, M["metal_light"], 0.025)
        box(root, "Bench | back upright", sx, 0.94, z - facing * 0.23, 0.09, 0.82, 0.1, M["metal"], 0.025)
    for slat in range(4):
        box(root, "Bench | back slat", x, 0.77 + slat * 0.18, z - facing * 0.23,
            1.86, 0.105, 0.085, M["wood_light"] if slat == 0 else M["wood"], 0.025)
    box(root, "Bench | arm rest", x, 0.91, z + facing * 0.08, 1.68, 0.08, 0.09, M["wood_light"], 0.025)


def lamp(root: bpy.types.Object, x: float, z: float) -> None:
    cylinder(root, "Lamp | stone footing", x, 0.18, z, 0.28, 0.36, M["stone"], 10)
    cylinder(root, "Lamp | graphite post", x, 2.22, z, 0.075, 3.78, M["metal"], 10)
    bar(root, "Lamp | swept arm", (x, 3.87, z), (x + 0.52, 4.14, z), 0.055, M["metal"])
    box(root, "Lamp | lantern housing", x + 0.66, 4.08, z, 0.38, 0.2, 0.32, M["metal_light"], 0.04)
    sphere(root, "Lamp | diffuser", x + 0.66, 3.94, z, 0.27, 0.15, 0.23, M["paper"], 10)


def planter(root: bpy.types.Object, x: float, z: float, width: float = 1.5) -> None:
    box(root, "Planter | stone body", x, 0.34, z, width, 0.62, 0.75, M["stone"], 0.11)
    box(root, "Planter | lip", x, 0.67, z, width + 0.12, 0.12, 0.86, M["stone_light"], 0.045)
    for index in range(5):
        px = x + (index - 2) * width * 0.15
        height = 0.48 + (index % 3) * 0.13
        cone(root, "Planter | ornamental grass", px, 0.89 + height * 0.45, z + (index % 2) * 0.14,
             0.18, height, M["leaf"] if index % 2 else M["leaf_light"], 7)
        if index % 2 == 0:
            sphere(root, "Planter | wildflower", px + 0.12, 1.13 + height * 0.38, z - 0.08,
                   0.12, 0.10, 0.12, M["flower"] if index == 2 else M["flower_pink"], 8)


def seawall_scene(root: bpy.types.Object) -> None:
    # A layered cedar border frames the Vancouver waterfront without entering the play lane.
    for x, z, scale in [(-10.8, -1.4, 1.0), (-10.8, 2.9, 0.92), (10.8, -1.7, 0.96), (10.8, 2.8, 1.04)]:
        cedar(root, x, z, scale)
    for x in (-9.85, 9.85):
        bench(root, x, -0.4, 1 if x < 0 else -1)
        planter(root, x, 2.0, 1.3)
    for x in (-7.2, 0.0, 7.2):
        lamp(root, x, -7.25)
    # Salt-air railing with rounded caps and evenly spaced posts.
    for x in range(-11, 12, 2):
        cylinder(root, "Seawall | railing post", x, 0.78, -7.5, 0.065, 1.5, M["metal"], 8)
        sphere(root, "Seawall | post cap", x, 1.55, -7.5, 0.19, 0.15, 0.19, M["metal_light"], 8)
    for y in (0.42, 0.89, 1.38):
        box(root, "Seawall | railing run", 0, y, -7.5, 22.2, 0.075, 0.095,
            M["metal_light"] if y == 1.38 else M["metal"], 0.026)
    # A neighborhood wayfinding board and a dual-stream waste station.
    box(root, "Park sign | footing", -10.2, 0.28, -5.45, 0.8, 0.34, 0.66, M["stone_dark"], 0.08)
    box(root, "Park sign | post", -10.2, 1.13, -5.45, 0.13, 1.6, 0.13, M["metal"], 0.035)
    box(root, "Park sign | green panel", -10.2, 2.08, -5.45, 1.52, 1.14, 0.16, M["sign"], 0.12)
    box(root, "Park sign | title plaque", -10.2, 2.37, -5.34, 0.96, 0.13, 0.045, M["paper"], 0.025)
    for idx, x in enumerate((9.6, 10.45)):
        box(root, "Waste station | bin", x, 0.55, -5.6, 0.65, 1.05, 0.65,
            M["metal_light"] if idx == 0 else M["sign"], 0.09)
        box(root, "Waste station | opening", x, 0.84, -5.25, 0.34, 0.15, 0.08, M["ink"], 0.025)
        box(root, "Waste station | lid", x, 1.1, -5.6, 0.69, 0.1, 0.69, M["metal"], 0.035)
    # Small bicycle hoop makes the seawall read as a lived-in public park.
    for x in (5.2, 5.78, 6.36):
        bar(root, "Bike rack | hoop side", (x, 0.08, -6.5), (x, 0.62, -6.5), 0.035, M["metal_light"])
        bar(root, "Bike rack | hoop top", (x, 0.62, -6.5), (x + 0.29, 0.62, -6.5), 0.035, M["metal_light"])


def transit_scene(root: bpy.types.Object) -> None:
    # Segmented skylight panels keep the roof airy and leave player silhouettes readable.
    for index, x in enumerate(range(-9, 10, 2)):
        arch_mesh(root, "Station | segmented canopy panel", 0.64, -3.8, -7.7,
                  3.72, 0.36, 0.13, M["glass"], float(x))
    for x in (-10.7, 10.7):
        for z in (-7.4, -4.2, -1.0, 2.2, 4.8):
            cylinder(root, "Station | steel column", x, 2.0, z, 0.105, 4.0, M["metal"], 10)
            box(root, "Station | column shoe", x, 0.18, z, 0.42, 0.36, 0.42, M["tile"], 0.08)
    box(root, "Station | rear cross beam", 0, 3.62, -7.65, 21.3, 0.2, 0.24, M["metal"], 0.055)
    # Long articulated carriage, panoramic tinted glass, doors, lower skirt and wheels.
    box(root, "Train | continuous body", 0, 1.68, -6.45, 17.0, 2.54, 2.08, M["train_light"], 0.46)
    box(root, "Train | teal belt", 0, 0.94, -5.37, 16.55, 0.28, 0.08, M["train"], 0.04)
    box(root, "Train | roof cap", 0, 2.99, -6.45, 16.2, 0.2, 1.78, M["train"], 0.15)
    box(root, "Train | lower skirt", 0, 0.48, -6.45, 15.6, 0.25, 1.8, M["ink"], 0.1)
    for x in (-7.2, -3.6, 0, 3.6, 7.2):
        box(root, "Train | panoramic window", x, 2.08, -5.385, 2.5, 0.88, 0.075, M["train_dark"], 0.12)
        box(root, "Train | window highlight", x, 2.42, -5.34, 1.92, 0.07, 0.04, M["glass"], 0.018)
    for x in (-5.4, -1.8, 1.8, 5.4):
        box(root, "Train | sliding door", x, 1.77, -5.37, 0.96, 1.6, 0.07, M["train"], 0.11)
        box(root, "Train | door glass", x, 2.05, -5.32, 0.68, 0.78, 0.04, M["train_dark"], 0.06)
        box(root, "Train | handle", x + 0.31, 1.73, -5.28, 0.045, 0.46, 0.035, M["safety"], 0.012)
    for x in (-6.1, -2.4, 2.4, 6.1):
        cylinder(root, "Train | bogie wheel", x, 0.29, -5.72, 0.32, 0.2, M["metal"], 12)
        cylinder(root, "Train | hub", x, 0.29, -5.59, 0.14, 0.22, M["metal_light"], 10)
    # Platform markers, tactile strip, wayfinding and benches.
    box(root, "Platform | tactile edge", 0, 0.12, -4.4, 20.2, 0.13, 0.44, M["safety"], 0.055)
    for x in range(-9, 10, 1):
        box(root, "Platform | tactile ribs", x, 0.2, -4.4, 0.055, 0.035, 0.3, M["paper"], 0.012)
    for x in (-8.9, 8.9):
        box(root, "Station | route totem", x, 2.0, -1.1, 0.82, 3.5, 0.38, M["sign"], 0.14)
        box(root, "Station | route display", x, 2.52, -0.87, 0.56, 0.76, 0.08, M["train_dark"], 0.045)
        box(root, "Station | route stripe", x, 1.87, -0.86, 0.42, 0.1, 0.06, M["safety"], 0.025)
    for x in (-7.6, 7.6):
        box(root, "Station | bench seat", x, 0.65, 1.05, 2.0, 0.13, 0.46, M["wood_light"], 0.05)
        for side in (-1, 1):
            box(root, "Station | bench leg", x + side * 0.72, 0.35, 1.05, 0.12, 0.58, 0.14, M["metal"], 0.03)


def lantern(root: bpy.types.Object, x: float, y: float, z: float, scale: float = 1.0) -> None:
    cylinder(root, "Lantern | upper cap", x, y + 0.58 * scale, z, 0.36 * scale, 0.14 * scale, M["gold"], 8)
    sphere(root, "Lantern | silk body", x, y, z, 0.57 * scale, 0.9 * scale, 0.57 * scale, M["red_light"], 12)
    cylinder(root, "Lantern | lower cap", x, y - 0.51 * scale, z, 0.31 * scale, 0.12 * scale, M["gold"], 8)
    for angle in range(4):
        theta = angle * math.pi / 2
        bar(root, "Lantern | rib", (x + math.cos(theta) * 0.22 * scale, y - 0.39 * scale, z + math.sin(theta) * 0.22 * scale),
            (x + math.cos(theta) * 0.22 * scale, y + 0.39 * scale, z + math.sin(theta) * 0.22 * scale),
            0.018 * scale, M["gold"], 6)
    cylinder(root, "Lantern | tassel", x, y - 0.81 * scale, z, 0.045 * scale, 0.52 * scale, M["red"], 6)


def courtyard_scene(root: bpy.types.Object) -> None:
    # Side posts frame a small rear stage but leave the central crowd lane open.
    for x in (-9.2, 9.2):
        for z in (-6.6, -4.8):
            box(root, "Pavilion | lacquer column", x, 1.9, z, 0.24, 3.8, 0.25, M["timber"], 0.07)
            box(root, "Pavilion | stone plinth", x, 0.22, z, 0.5, 0.44, 0.5, M["stone_dark"], 0.1)
    for y in (3.0, 3.3):
        box(root, "Pavilion | cross beam", 0, y, -5.8, 17.8, 0.18, 0.28, M["timber_light"], 0.07)
    # A rear pavilion canopy frames the stage while keeping the active floor open.
    for x in range(-9, 10, 2):
        arch_mesh(root, "Pavilion | jade roof tile", 0.9, -4.75, -7.9,
                  2.65, 0.48, 0.16, M["jade"], float(x))
    for x in (-9.8, -7.4, -4.9, -2.45, 0, 2.45, 4.9, 7.4, 9.8):
        bar(root, "Pavilion | roof rib", (x, 2.62 + (abs(x) / 10) ** 2 * 0.34, -7.65),
            (x, 2.58 + (abs(x) / 10) ** 2 * 0.34, -4.8), 0.052, M["timber"], 8)
    for z in (-7.85, -4.65):
        box(root, "Pavilion | eave fascia", 0, 2.72, z, 19.9, 0.18, 0.28, M["red"], 0.065)
    box(root, "Pavilion | roof ridge", 0, 3.25, -6.2, 18.5, 0.24, 0.36, M["gold"], 0.09)
    for x in (-8.65, 8.65):
        for z in (-6.25, -4.9):
            box(root, "Pavilion | lattice frame", x, 1.7, z, 0.12, 2.8, 1.35, M["timber"], 0.035)
            for offset in (-0.58, -0.2, 0.2, 0.58):
                box(root, "Pavilion | lattice vertical", x + (0.08 if x < 0 else -0.08), 1.7, z + offset,
                    0.055, 2.35, 0.055, M["timber_light"], 0.018)
            for yy in (0.85, 1.65, 2.45):
                box(root, "Pavilion | lattice horizontal", x + (0.08 if x < 0 else -0.08), yy, z,
                    0.055, 0.055, 1.25, M["timber_light"], 0.018)
    # Theatre curtains, layered stage, and clean brass trim.
    box(root, "Theatre | stage apron", 0, 0.36, -4.15, 13.5, 0.72, 1.2, M["timber"], 0.17)
    box(root, "Theatre | stage surface", 0, 0.77, -4.38, 13.1, 0.14, 0.86, M["timber_light"], 0.055)
    box(root, "Theatre | velvet backdrop", 0, 1.65, -5.25, 12.8, 2.4, 0.18, M["red"], 0.13)
    for x in range(-6, 7, 1):
        box(root, "Theatre | curtain pleat", x, 1.63, -5.12, 0.12, 2.28, 0.07,
            M["red_light"] if x % 2 == 0 else M["red"], 0.03)
    for side in (-1, 1):
        box(root, "Theatre | curtain valance", side * 6.55, 1.72, -4.92, 0.54, 2.8, 0.66, M["red"], 0.2)
        box(root, "Theatre | gold tassel rail", side * 6.22, 2.9, -4.82, 0.16, 0.14, 0.72, M["gold"], 0.045)
        lantern(root, side * 5.8, 1.9, -3.95, 0.62)
    # Keep the audience gallery to the outer edge of the play area.
    for side in (-1, 1):
        for z in (-2.4, 1.2, 4.5):
            box(root, "Audience | side bench", side * 10.5, 0.58, z, 1.25, 0.16, 0.48,
                M["timber_light"], 0.05)
            for offset in (-0.42, 0.42):
                box(root, "Audience | side support", side * 10.5 + offset, 0.29, z,
                    0.11, 0.52, 0.12, M["timber"], 0.035)
    for x in (-10.2, 10.2):
        box(root, "Courtyard | stone lantern plinth", x, 0.58, -0.5, 0.9, 1.15, 0.9, M["stone_light"], 0.1)
        box(root, "Courtyard | stone lantern hood", x, 1.32, -0.5, 1.18, 0.25, 1.18, M["stone_dark"], 0.08)
        sphere(root, "Courtyard | lantern window", x, 0.73, -0.5, 0.39, 0.46, 0.39, M["paper"], 8)
        lantern(root, x, 3.25, -1.9, 0.72)


def join_by_material(root: bpy.types.Object) -> None:
    children = [obj for obj in root.children if obj.type == "MESH"]
    by_material: dict[str, list[bpy.types.Object]] = {}
    for obj in children:
        obj.data.name = obj.name + " mesh"
        key = obj.data.materials[0].name if obj.data.materials else "unpainted"
        by_material.setdefault(key, []).append(obj)
    for material_name, objects in by_material.items():
        if len(objects) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        active = objects[0]
        bpy.context.view_layer.objects.active = active
        bpy.ops.object.join()
        active.name = root.name + " | " + material_name
        active.parent = root
        active.data.name = active.name + " mesh"


def export_group(root: bpy.types.Object, path: Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_apply=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        use_selection=True,
        export_yup=True,
        export_meshopt_compression_enable=True,
        export_meshopt_extension="EXT_meshopt_compression",
    )
    meshes = sum(1 for child in root.children_recursive if child.type == "MESH")
    print(f"[arena-art] {root.name}: {meshes} joined meshes -> {path.name} ({path.stat().st_size:,} bytes)")
    return meshes


def render_preview(root: bpy.types.Object, name: str) -> None:
    PREVIEW.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    # Hide every other venue while rendering this one. Their models remain in the
    # Blender file during the batch, but must never contaminate the preview.
    visible = set(root.children_recursive) | {root}
    previously_hidden = {obj: obj.hide_render for obj in scene.objects}
    for obj in scene.objects:
        if obj not in visible:
            obj.hide_render = True
    for other in [obj for obj in scene.objects if obj.type == "EMPTY" and obj != root]:
        other.hide_render = True
    bpy.ops.mesh.primitive_plane_add(size=1, location=blender_position(0, -0.03, 0))
    floor = bpy.context.object
    floor.name = "Preview only | ground plane"
    floor.dimensions = (25, 17, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    floor.data.materials.append(M["stone_light"] if name != "seawall" else M["leaf"])
    target = Vector(blender_position(0, 1.2, -1.3))
    camera_data = bpy.data.cameras.new("Preview camera")
    camera = bpy.data.objects.new("Preview camera", camera_data)
    scene.collection.objects.link(camera)
    camera.location = blender_position(0, 21, 24)
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 27.5
    scene.camera = camera
    for light_name, location, energy, size in [
        ("Preview | key", ( -7, -11, 17), 1500, 10),
        ("Preview | fill", ( 8, -2, 10), 700, 9),
    ]:
        data = bpy.data.lights.new(light_name, type="AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        lamp_obj = bpy.data.objects.new(light_name, data)
        scene.collection.objects.link(lamp_obj)
        lamp_obj.location = location
        lamp_obj.rotation_euler = (target - lamp_obj.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1120
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(PREVIEW / f"{name}.png")
    scene.view_settings.view_transform = "AgX"
    scene.world.color = (0.28, 0.34, 0.36)
    scene.camera.data.lens = 38
    bpy.ops.render.render(write_still=True)
    # Preview-only objects are removed before the next location render.
    bpy.data.objects.remove(floor, do_unlink=True)
    bpy.data.objects.remove(camera, do_unlink=True)
    for obj in list(scene.objects):
        if obj.name.startswith("Preview | "):
            bpy.data.objects.remove(obj, do_unlink=True)
    scene.camera = None
    for obj, was_hidden in previously_hidden.items():
        if obj.name in bpy.data.objects:
            obj.hide_render = was_hidden


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    # Materials in M are created when the script is imported. Keep those datablocks
    # alive while clearing the scene, otherwise bpy removes them behind M's handles.
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def main() -> None:
    reset_scene()
    ART.mkdir(parents=True, exist_ok=True)
    scenes = [
        ("venue-seawall", "seawall", seawall_scene, "seawall-dressing.glb"),
        ("venue-transit", "transit", transit_scene, "transit-dressing.glb"),
        ("venue-courtyard", "courtyard", courtyard_scene, "courtyard-dressing.glb"),
    ]
    for group_name, preview_name, builder, filename in scenes:
        root = new_group(group_name)
        builder(root)
        join_by_material(root)
        export_group(root, ART / filename)
        render_preview(root, preview_name)


if __name__ == "__main__":
    main()

