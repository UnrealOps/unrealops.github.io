#!/usr/bin/env python3
"""Isolate supplied character frames and repack them into bleed-safe atlases."""

from collections import deque
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
ASSET_DIRECTORY = ROOT / "assets" / "game"
FRAME_WIDTH = 336
FRAME_HEIGHT = 344
ALPHA_THRESHOLD = 32
SOFT_EDGE_PASSES = 3
MIN_COMPONENT_PIXELS = 5_000


@dataclass(frozen=True)
class SheetDefinition:
    asset_name: str
    columns: int
    rows: int
    expected_frames: int
    scale: float = 1.0


SHEETS = (
    SheetDefinition("player-idle", columns=4, rows=2, expected_frames=8, scale=0.5),
    SheetDefinition("player-run", columns=8, rows=4, expected_frames=32),
    SheetDefinition("player-shoot", columns=6, rows=4, expected_frames=24),
    SheetDefinition("ghost-move", columns=6, rows=4, expected_frames=24),
    SheetDefinition("ghost-cast", columns=6, rows=4, expected_frames=24),
)


def label_components(alpha: np.ndarray) -> tuple[np.ndarray, list[dict[str, int]]]:
    mask = alpha > ALPHA_THRESHOLD
    height, width = mask.shape
    labels = np.zeros((height, width), dtype=np.uint16)
    components: list[dict[str, int]] = []
    label = 0

    for y in range(height):
        for x in range(width):
            if not mask[y, x] or labels[y, x] != 0:
                continue

            label += 1
            queue = deque([(x, y)])
            labels[y, x] = label
            component_pixels = []
            size = 0
            min_x = max_x = x
            min_y = max_y = y

            while queue:
                current_x, current_y = queue.popleft()
                component_pixels.append((current_x, current_y))
                size += 1
                min_x = min(min_x, current_x)
                max_x = max(max_x, current_x)
                min_y = min(min_y, current_y)
                max_y = max(max_y, current_y)

                for neighbor_y in range(max(0, current_y - 1), min(height, current_y + 2)):
                    for neighbor_x in range(max(0, current_x - 1), min(width, current_x + 2)):
                        if mask[neighbor_y, neighbor_x] and labels[neighbor_y, neighbor_x] == 0:
                            labels[neighbor_y, neighbor_x] = label
                            queue.append((neighbor_x, neighbor_y))

            if size >= MIN_COMPONENT_PIXELS:
                components.append(
                    {
                        "label": label,
                        "size": size,
                        "min_x": min_x,
                        "min_y": min_y,
                        "max_x": max_x + 1,
                        "max_y": max_y + 1,
                    }
                )
            else:
                for component_x, component_y in component_pixels:
                    labels[component_y, component_x] = 0

    return labels, components


def expand_soft_edges(labels: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    expanded = labels.copy()
    eligible = alpha > 0

    for _ in range(SOFT_EDGE_PASSES):
        unassigned = eligible & (expanded == 0)
        if not np.any(unassigned):
            break

        next_labels = expanded.copy()
        for y_offset, x_offset in (
            (-1, -1),
            (-1, 0),
            (-1, 1),
            (0, -1),
            (0, 1),
            (1, -1),
            (1, 0),
            (1, 1),
        ):
            source_y = slice(max(0, -y_offset), min(expanded.shape[0], expanded.shape[0] - y_offset))
            source_x = slice(max(0, -x_offset), min(expanded.shape[1], expanded.shape[1] - x_offset))
            target_y = slice(max(0, y_offset), min(expanded.shape[0], expanded.shape[0] + y_offset))
            target_x = slice(max(0, x_offset), min(expanded.shape[1], expanded.shape[1] + x_offset))
            neighbor_labels = expanded[source_y, source_x]
            target_is_open = unassigned[target_y, target_x] & (next_labels[target_y, target_x] == 0)
            fill = target_is_open & (neighbor_labels != 0)
            next_labels[target_y, target_x][fill] = neighbor_labels[fill]

        expanded = next_labels

    return expanded


def assign_components_to_cells(
    components: list[dict[str, int]], definition: SheetDefinition, width: int, height: int
) -> dict[tuple[int, int], dict[str, int]]:
    cells: dict[tuple[int, int], dict[str, int]] = {}
    cell_width = width / definition.columns
    cell_height = height / definition.rows

    for component in components:
        center_x = (component["min_x"] + component["max_x"]) / 2
        center_y = (component["min_y"] + component["max_y"]) / 2
        column = min(definition.columns - 1, int(center_x / cell_width))
        row = min(definition.rows - 1, int(center_y / cell_height))
        key = (row, column)
        if key in cells:
            raise RuntimeError(f"{definition.asset_name}: multiple frames mapped to cell {key}")
        cells[key] = component

    expected_cells = {(row, column) for row in range(definition.rows) for column in range(definition.columns)}
    if set(cells) != expected_cells:
        missing = sorted(expected_cells - set(cells))
        raise RuntimeError(f"{definition.asset_name}: missing frames for cells {missing}")

    return cells


def repack_sheet(definition: SheetDefinition) -> Path:
    source_path = ASSET_DIRECTORY / f"{definition.asset_name}.png"
    source = Image.open(source_path).convert("RGBA")
    pixels = np.array(source)
    alpha = pixels[:, :, 3]
    labels, components = label_components(alpha)

    if len(components) != definition.expected_frames:
        raise RuntimeError(
            f"{definition.asset_name}: expected {definition.expected_frames} frames, found {len(components)}"
        )

    labels = expand_soft_edges(labels, alpha)
    cells = assign_components_to_cells(components, definition, source.width, source.height)
    row_anchors = {}
    for row in range(definition.rows):
        row_anchors[row] = max(
            int(np.nonzero(labels == cells[(row, column)]["label"])[0].max()) + 1
            for column in range(definition.columns)
        )
    atlas = Image.new(
        "RGBA",
        (definition.columns * FRAME_WIDTH, definition.rows * FRAME_HEIGHT),
        (0, 0, 0, 0),
    )
    nominal_cell_width = source.width / definition.columns
    nominal_cell_height = source.height / definition.rows

    for (row, column), component in cells.items():
        component_mask = labels == component["label"]
        ys, xs = np.nonzero(component_mask)
        min_x, max_x = int(xs.min()), int(xs.max()) + 1
        min_y, max_y = int(ys.min()), int(ys.max()) + 1

        frame_pixels = pixels[min_y:max_y, min_x:max_x].copy()
        frame_mask = component_mask[min_y:max_y, min_x:max_x]
        frame_pixels[~frame_mask] = 0
        frame = Image.fromarray(frame_pixels, mode="RGBA")

        if definition.scale != 1:
            scaled_size = (
                max(1, round(frame.width * definition.scale)),
                max(1, round(frame.height * definition.scale)),
            )
            frame = frame.resize(scaled_size, Image.Resampling.LANCZOS)

        source_anchor_x = (column + 0.5) * nominal_cell_width
        source_anchor_y = row_anchors[row]
        anchor_in_frame_x = (source_anchor_x - min_x) * definition.scale
        anchor_in_frame_y = (source_anchor_y - min_y) * definition.scale
        destination_x = round(FRAME_WIDTH / 2 - anchor_in_frame_x)
        destination_y = round(FRAME_HEIGHT - 8 - anchor_in_frame_y)
        cell = Image.new("RGBA", (FRAME_WIDTH, FRAME_HEIGHT), (0, 0, 0, 0))
        cell.alpha_composite(frame, (destination_x, destination_y))
        atlas.alpha_composite(cell, (column * FRAME_WIDTH, row * FRAME_HEIGHT))

    output_path = ASSET_DIRECTORY / f"{definition.asset_name}-clean.png"
    atlas.save(output_path, optimize=True)

    atlas_alpha = np.array(atlas.getchannel("A"))
    for row in range(definition.rows):
        for column in range(definition.columns):
            frame_alpha = atlas_alpha[
                row * FRAME_HEIGHT : (row + 1) * FRAME_HEIGHT,
                column * FRAME_WIDTH : (column + 1) * FRAME_WIDTH,
            ]
            ys, xs = np.nonzero(frame_alpha)
            margins = (
                int(xs.min()),
                int(FRAME_WIDTH - 1 - xs.max()),
                int(ys.min()),
                int(FRAME_HEIGHT - 1 - ys.max()),
            )
            if min(margins) < 3:
                raise RuntimeError(
                    f"{definition.asset_name}: frame {(row, column)} touches its cell edge: {margins}"
                )

    return output_path


def main() -> None:
    for sheet in SHEETS:
        output = repack_sheet(sheet)
        print(f"Prepared {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
