"""The crowd's extra moves for 藏在人群里 · Hide in the Crowd: a few clips from Quaternius's CC0
Universal Animation Library 2, for the bodies in src/client/art/crowd-people*.glb (the same rig, bone
for bone: its bones sit exactly where ours do, so its clips need no retargeting).

Get the pack (CC0 1.0, by Quaternius) from https://quaternius.com/packs/universalanimationlibrary2.html
(also on OpenGameArt), then from the game's folder, with any Python 3 (no Blender, nothing to install):

  UAL2_GLB=".../Universal Animation Library 2 [Standard]/Unreal-Godot/UAL2_Standard.glb" \\
  python3 tools/moves/build_crowd_moves.py

It writes src/client/art/crowd-moves.glb: no body, only the clips in MOVES (renamed for what the game
uses them for), each bone's turns and the hips' moves (as build_crowd_people.py keeps them), sampled at
15 a second, the turns stored as 16-bit numbers. The game reads it with the people (people.ts).
"""

from __future__ import annotations

import json
import math
import os
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "client" / "art" / "crowd-moves.glb"

# what the game calls each move, and the pack's clip it comes from
MOVES = {
    # a nod, and a shake of the head: now and then, anyone standing about
    "nod": "Yes",
    "no": "Idle_No_Loop",
    # eating at the night market's stalls, and the people at its tables
    "eat": "Consume",
    # the people beside the place: leaning on the seawall's railing, a lantern by the courtyard's stage
    "rail": "Idle_Rail_Loop",
    "lantern": "Idle_Lantern_Loop",
}
FPS = 15

# the bones the game keeps (build_crowd_people.py's KEEP_BONES)
KEEP_BONES = [
    "root", "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head",
    "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
    "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
    "thigh_l", "calf_l", "foot_l", "ball_l",
    "thigh_r", "calf_r", "foot_r", "ball_r",
]

COMPONENT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
NORMAL = {5120: 127, 5121: 255, 5122: 32767, 5123: 65535}


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    if data[:4] != b"glTF":
        raise SystemExit(f"{path} is not a GLB")
    length = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + length])
    blob_at = 20 + length
    blob_length = struct.unpack_from("<I", data, blob_at)[0]
    return gltf, data[blob_at + 8:blob_at + 8 + blob_length]


def reader(gltf: dict, blob: bytes):
    def read(index: int) -> list[list[float]]:
        accessor = gltf["accessors"][index]
        code, size = COMPONENT[accessor["componentType"]]
        width = WIDTH[accessor["type"]]
        view = gltf["bufferViews"][accessor["bufferView"]]
        start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        stride = view.get("byteStride") or width * size
        scale = NORMAL.get(accessor["componentType"]) if accessor.get("normalized") else None
        rows = []
        for item in range(accessor["count"]):
            row = list(struct.unpack_from(f"<{width}{code}", blob, start + item * stride))
            rows.append([max(-1.0, value / scale) for value in row] if scale else row)
        return rows
    return read


def slerp(a: list[float], b: list[float], t: float) -> list[float]:
    dot = sum(x * y for x, y in zip(a, b))
    if dot < 0:
        b, dot = [-x for x in b], -dot
    if dot > 0.9995:
        out = [x + (y - x) * t for x, y in zip(a, b)]
    else:
        theta = math.acos(dot)
        sa, sb = math.sin((1 - t) * theta), math.sin(t * theta)
        out = [(x * sa + y * sb) / math.sin(theta) for x, y in zip(a, b)]
    norm = math.sqrt(sum(x * x for x in out)) or 1.0
    return [x / norm for x in out]


def sample(times: list[float], values: list[list[float]], at: float, turn: bool) -> list[float]:
    if at <= times[0]:
        return values[0]
    if at >= times[-1]:
        return values[-1]
    for index in range(1, len(times)):
        if times[index] >= at:
            span = times[index] - times[index - 1]
            t = (at - times[index - 1]) / span if span else 0.0
            a, b = values[index - 1], values[index]
            return slerp(a, b, t) if turn else [x + (y - x) * t for x, y in zip(a, b)]
    return values[-1]


def main() -> None:
    source = os.environ.get("UAL2_GLB")
    if not source:
        raise SystemExit("UAL2_GLB: the pack's Unreal-Godot/UAL2_Standard.glb")
    gltf, blob = read_glb(Path(source))
    read = reader(gltf, blob)
    names = [node.get("name", "") for node in gltf["nodes"]]
    for bone in KEEP_BONES:
        if bone not in names:
            raise SystemExit(f"the pack has no bone {bone}")
    by_name = {animation["name"]: animation for animation in gltf.get("animations", [])}

    # (three runs of numbers, one view each: the clips' times, the hips' moves, the 16-bit turns)
    runs = {"times": bytearray(), "moves": bytearray(), "turns": bytearray()}
    accessors: list[dict] = []
    view_of = {"times": 0, "moves": 1, "turns": 2}

    def put(values: list[list[float]], kind: str, run: str) -> int:
        out = runs[run]
        start = len(out)
        flat = [value for row in values for value in row]
        if run == "turns":
            out.extend(struct.pack(f"<{len(flat)}h", *[max(-32767, min(32767, round(v * 32767))) for v in flat]))
            component = 5122
        else:
            out.extend(struct.pack(f"<{len(flat)}f", *flat))
            component = 5126
        accessor = {"bufferView": view_of[run], "byteOffset": start, "componentType": component, "count": len(values), "type": kind}
        if run == "turns":
            accessor["normalized"] = True
        if kind == "SCALAR":
            accessor["min"] = [min(flat)]
            accessor["max"] = [max(flat)]
        accessors.append(accessor)
        return len(accessors) - 1

    # the nodes: the kept bones by name, where they rest (the clips find our bones by these names)
    nodes = []
    for bone in KEEP_BONES:
        node = gltf["nodes"][names.index(bone)]
        nodes.append({key: node[key] for key in ("name", "translation", "rotation", "scale") if key in node})
    animations = []
    for move, clip in MOVES.items():
        animation = by_name.get(clip)
        if not animation:
            raise SystemExit(f"the pack has no clip called {clip}")
        channels = []
        samplers = []
        shared_times: int | None = None
        for channel in animation["channels"]:
            target = channel["target"]
            bone = names[target["node"]]
            turn = target["path"] == "rotation"
            if bone not in KEEP_BONES or not (turn or (target["path"] == "translation" and bone == "pelvis")):
                continue
            sampler = animation["samplers"][channel["sampler"]]
            if sampler.get("interpolation", "LINEAR") != "LINEAR":
                raise SystemExit(f"{clip}: {sampler.get('interpolation')} keys")
            times = [row[0] for row in read(sampler["input"])]
            values = read(sampler["output"])
            first = times[0]
            length = times[-1] - first
            steps = max(1, round(length * FPS))
            at = [first + length * step / steps for step in range(steps + 1)]
            resampled = [sample(times, values, moment, turn) for moment in at]
            if turn:
                # (each turn on the same side as the one before, so nothing spins the long way round)
                for index in range(1, len(resampled)):
                    if sum(x * y for x, y in zip(resampled[index - 1], resampled[index])) < 0:
                        resampled[index] = [-x for x in resampled[index]]
            if shared_times is None:
                shared_times = put([[moment - first] for moment in at], "SCALAR", "times")
            samplers.append({"input": shared_times, "output": put(resampled, "VEC4" if turn else "VEC3", "turns" if turn else "moves"), "interpolation": "LINEAR"})
            channels.append({"sampler": len(samplers) - 1, "target": {"node": KEEP_BONES.index(bone), "path": target["path"]}})
        animations.append({"name": move, "channels": channels, "samplers": samplers})
        print(f"{move} <- {clip}: {len(channels)} tracks")

    out = bytearray()
    views = []
    for run in ("times", "moves", "turns"):
        while len(out) % 4:
            out.append(0)
        views.append({"buffer": 0, "byteOffset": len(out), "byteLength": len(runs[run])})
        out.extend(runs[run])
    while len(out) % 4:
        out.append(0)
    document = {
        "asset": {"version": "2.0", "generator": "build_crowd_moves.py (藏在人群里)"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "animations": animations,
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(out)}],
    }
    text = json.dumps(document, separators=(",", ":")).encode()
    text += b" " * ((4 - len(text) % 4) % 4)
    glb = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(text) + 8 + len(out))
    glb += struct.pack("<I4s", len(text), b"JSON") + text
    glb += struct.pack("<I4s", len(out), b"BIN\x00") + bytes(out)
    OUT.write_bytes(glb)
    print(f"wrote {OUT.relative_to(ROOT)}: {len(glb) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
