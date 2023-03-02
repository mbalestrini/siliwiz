// SPDX-License-Identifier: Apache-2.0

import { Delete, Edit, SwapHoriz, SwapVert } from '@suid/icons-material';
import { ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@suid/material';
import { createSignal, For, Show } from 'solid-js';
import { activeDRCItem } from '~/model/drc';
import { layerTypes } from '~/model/layerTypes';
import {
  lambdaToMicrons,
  layout,
  layoutUndo,
  rectLayer,
  selectedRectIndex,
  setLayout,
  setSelectedRectIndex,
  sortRects,
  getLayerRects,
} from '~/model/layout';
import { spiceIdentifierRegexp, spiceIdentifierReservedNames } from '~/model/spiceFile';
import { isLayerVisible, viewerState } from '~/model/viewerState';
import { domRectFromPoints, type Point2D } from '~/utils/geometry';
import { ctrlCmdPressed } from '~/utils/keyboard';
import styles from './Canvas.module.css';
import Scale from './Scale';
import {
  transparentLayers,
  showBorders
} from './ExpertOptions';

interface INewRect {
  layer: string;
  start: Point2D;
  end: Point2D;
}

const keyboardShortcuts = {
  Delete: 'D',
  EditWidth: 'F',
  EditLength: 'R',
  SetLabel: 'S',
};

export default function Canvas(props: { size: number }) {
  const [svgRef, setSVGRef] = createSignal<SVGSVGElement | null>(null);
  const [newRect, setNewRect] = createSignal<INewRect | null>(null);
  const [popMenu, setPopMenu] = createSignal(false);

  // Context menu
  const [contextMenu, setContextMenu] = createSignal<{
    left: number;
    top: number;
  } | null>(null);
  const open = () => Boolean(contextMenu());
  const handleClose = () => {
    setContextMenu(null);
  };

  const selectedRect = () => {
    const index = selectedRectIndex();
    return index != null ? layout.rects[index] : null;
  };

  const selectedRectLayer = () => {
    const rect = selectedRect();
    return rect != null ? rectLayer(rect) : null;
  };

  const handleDelete = () => {
    setLayout('rects', (rects) => rects.filter((r, index) => index !== selectedRectIndex()));
    setSelectedRectIndex(null);
  };

  const handleSetLabel = () => {
    const selection = selectedRect();
    const selectionIndex = selectedRectIndex();
    if (selection == null || selectionIndex == null || !selectedRectLayer()?.hasLabels) {
      return;
    }
    const label = prompt('Enter new label (or an empty string to delete label)', selection.label);
    if (label != null) {
      const trimmedLabel = label.trim();
      if (!spiceIdentifierRegexp.test(trimmedLabel)) {
        alert(
          'Label must begin with an alphabetic character and contain only alphanumeric characters and underscores',
        );
        return;
      }
      if (spiceIdentifierReservedNames.includes(trimmedLabel.toLowerCase())) {
        alert(`${trimmedLabel} is a reserved word in ngspice. Please choose a different label.`);
        return;
      }
      setLayout('rects', selectionIndex, { ...selection, label: trimmedLabel });
    }
  };

  const handleEditWidth = () => {
    const selection = selectedRect();
    const selectionIndex = selectedRectIndex();
    if (selection == null || selectionIndex == null) {
      return;
    }
    const currentValue = (selection.width * lambdaToMicrons).toFixed(2).replace(/\.?0+$/, '');
    const newWidth = prompt('Enter new width in µm', currentValue);
    if (newWidth != null) {
      setLayout('rects', selectionIndex, { width: parseFloat(newWidth) / lambdaToMicrons });
    }
  };

  const handleEditLength = () => {
    const selection = selectedRect();
    const selectionIndex = selectedRectIndex();
    if (selection == null || selectionIndex == null) {
      return;
    }
    const currentValue = (selection.height * lambdaToMicrons).toFixed(2).replace(/\.?0+$/, '');
    const newLength = prompt('Enter new length in µm', currentValue);
    if (newLength != null) {
      setLayout('rects', selectionIndex, { height: parseFloat(newLength) / lambdaToMicrons });
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const cmdCtrl = ctrlCmdPressed(e);
    const upperKey = e.key.toUpperCase();
    if (e.key === 'Delete' || upperKey === keyboardShortcuts.Delete) {
      handleDelete();
      return true;
    }
    if (upperKey === 'Z' && cmdCtrl) {
      layoutUndo.undo();
      return true;
    }
    if (upperKey === 'Y' && cmdCtrl) {
      layoutUndo.redo();
      return true;
    }

    if (upperKey === keyboardShortcuts.SetLabel) {
      handleSetLabel();
      return true;
    }
    if (upperKey === keyboardShortcuts.EditWidth) {
      handleEditWidth();
      return true;
    }
    if (upperKey === keyboardShortcuts.EditLength) {
      handleEditLength();
      return true;
    }
    return false; /* not handled */
  };

  const translatePoint = ({ x, y }: Point2D) => {
    const matrix = svgRef()?.getScreenCTM();
    if (matrix == null) {
      return { x, y };
    }
    const transformedPoint = new DOMPoint(x, y).matrixTransform(matrix.inverse());
    return { x: transformedPoint.x, y: transformedPoint.y };
  };

  const handleMouseDown = (e: MouseEvent) => {
    const layer = viewerState.activeLayer;
    const point = translatePoint({ x: e.clientX, y: e.clientY });
    if (layer != null) {
      setNewRect({ start: point, end: point, layer });
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    const point = translatePoint({ x: e.clientX, y: e.clientY });
    setNewRect((rect) => (rect != null ? { ...rect, end: point } : null));
  };

  const handleMouseUp = (e: MouseEvent) => {
    const rect = newRect();
    if (rect != null) {
      setNewRect(null);

      const domRect = domRectFromPoints(rect.start, rect.end);
      if (domRect.width < 3 || domRect.height < 3) {
        // Don't create a rect that's too small, see https://github.com/wokwi/siliwiz/issues/10
        return;
      }

      setPopMenu(false); // Ensures the context menu won't pop after drawing a rect

      setLayout('rects', (rects) =>
        sortRects([
          ...rects,
          {
            x: domRect.x,
            y: domRect.y,
            height: domRect.height,
            width: domRect.width,
            layer: rect.layer,
          },
        ]),
      );
    }
  };

  return (
    <>
      <Menu
        open={open()}
        onClose={handleClose}
        onClick={handleClose}
        // eslint-disable-next-line solid/reactivity
        onKeyDown={(e) => {
          if (handleKeyDown(e)) {
            e.preventDefault();
            svgRef()?.focus({ preventScroll: true });
            setContextMenu(null);
          }
        }}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu() ?? undefined}
        sx={{
          '& .MuiMenu-list': { width: 180, maxWidth: '100%' },
        }}
      >
        <MenuItem onClick={handleDelete}>
          <ListItemIcon>
            <Delete fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
          <Typography variant="body2" color="text.secondary">
            {keyboardShortcuts.Delete}
          </Typography>
        </MenuItem>
        <MenuItem onClick={handleSetLabel} disabled={!selectedRectLayer()?.hasLabels}>
          <ListItemIcon>
            <Edit fontSize="small" />
          </ListItemIcon>
          <ListItemText>Set Label</ListItemText>
          <Typography variant="body2" color="text.secondary">
            {keyboardShortcuts.SetLabel}
          </Typography>
        </MenuItem>
        <MenuItem onClick={handleEditWidth}>
          <ListItemIcon>
            <SwapHoriz fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit Width</ListItemText>
          <Typography variant="body2" color="text.secondary">
            {keyboardShortcuts.EditWidth}
          </Typography>
        </MenuItem>
        <MenuItem onClick={handleEditLength}>
          <ListItemIcon>
            <SwapVert fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit Length</ListItemText>
          <Typography variant="body2" color="text.secondary">
            {keyboardShortcuts.EditLength}
          </Typography>
        </MenuItem>
      </Menu>
      <svg
        tabIndex={0}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${props.size} ${props.size}`}
        width={props.size}
        height={props.size}
        ref={setSVGRef}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <defs>
          <pattern
            id="hatch-pattern"
            patternUnits="userSpaceOnUse"
            width="20"
            height="20"
            patternTransform="rotate(-45 0 0)"
          >
            <line x1="0" y1="0" x2="0" y2="20" stroke="white" stroke-width="20" />
          </pattern>
          <pattern
            id="hatch-pattern-for-mask"
            patternUnits="userSpaceOnUse"
            width="20"
            height="20"
            patternTransform="rotate(-45 0 0)"
          >
            <line x1="0" y1="0" x2="0" y2="20" stroke="black" stroke-width="20" />
          </pattern>

          <mask id="hatch-mask" x="0" y="0" width="1" height="1">
            <rect x="0" y="0" width="1000" height="1000" fill="url(#hatch-pattern)"/>
          </mask>

          <rect id="union_canvas" width="100%" height="100%" fill="black" />
          <rect id="union_canvas_inv" width="100%" height="100%" fill="white" />

          {/* White filled shape */}
          <For each={layerTypes}>
            {(layer, index) => {
              return (
                <Show when={isLayerVisible(layer.name)}>
                  <g id={"shape_" + layer.magicName}>
                    <For each={getLayerRects(layer)}>
                      {(rect, index) => {
                        const layer = rectLayer(rect);
                        if (layer == null) {
                          return;
                        }

                        return (
                          <rect
                            x={rect.x}
                            y={rect.y}
                            height={rect.height}
                            width={rect.width}
                            fill="white"
                            class={styles.rect}
                          />
                        );
                      }}
                    </For>
                  </g>
                </Show>
              );
            }}
          </For>

          {/* Black filled shape */}
          <For each={layerTypes}>
            {(layer, index) => {
              return (
                <g id={"shape_inv_" + layer.magicName}>
                  <For each={getLayerRects(layer)}>
                    {(rect, index) => {
                      const layer = rectLayer(rect);
                      if (layer == null) {
                        return;
                      }

                      return (
                        <rect
                          x={rect.x}
                          y={rect.y}
                          height={rect.height}
                          width={rect.width}
                          fill="black"
                          class={styles.rect}
                        />
                      );
                    }}
                  </For>
                </g>
              );
            }}
          </For>


          {/* Positive mask */}
          <For each={layerTypes}>
            {(layer, index) => {
              return (
                <mask id={"mask_" + layer.magicName}>
                  <use href="#union_canvas" />
                  <use href={"#shape_" + layer.magicName} />
                  <Show when={layer.hatched}>
                    <rect x="0" y="0" width="100%" height="100%" fill="url(#hatch-pattern-for-mask)"/>
                  </Show>
                </mask>
              );
            }}
          </For>

          {/* Negative mask */}
          <For each={layerTypes}>
            {(layer, index) => {
              return (
                <mask id={"mask_inv_" + layer.magicName}>
                  <use href="#union_canvas_inv" />
                  <use href={"#shape_inv_" + layer.magicName} />
                </mask>
              );
            }}
          </For>


        </defs>

        <For each={layerTypes}>
          {(layer) => {
            return (
              <Show when={isLayerVisible(layer.name)}>
                <rect
                  x={0}
                  y={0}
                  height={"100%"}
                  width={"100%"}
                  fill={layer.color}
                  opacity={transparentLayers() ? 0.75 : 1.0}
                  mask={"url(#mask_" + layer.magicName}
                />

              </Show>
            );
          }}
        </For>

        <Show when={showBorders()}>
          <For each={layout.rects}>
            {(rect, index) => {
              const layer = rectLayer(rect);
              if (layer == null) {
                return;
              }

              return (
                <Show when={isLayerVisible(layer.name)}>
                  <rect
                    x={rect.x}
                    y={rect.y}
                    height={rect.height}
                    width={rect.width}
                    fill="#ffffff00"
                    opacity="0.3"
                    class={styles.rect}
                    stroke="black"
                    stroke-width={2}
                    stroke-dasharray='4 2'
                    mask={"url(#mask_inv_" + layer.magicName}

                  />

                </Show>
              );
            }}
          </For>
        </Show>


        <For each={layout.rects}>
          {(rect, index) => {
            const layer = rectLayer(rect);
            if (layer == null) {
              return;
            }

            return (
              <Show when={isLayerVisible(layer.name)}>
                <g
                  onClick={(event) => {
                    if (!popMenu()) {
                      return;
                    }
                    setSelectedRectIndex(index);
                    event.preventDefault();
                    setContextMenu(
                      contextMenu() === null
                        ? {
                          left: event.clientX + 2,
                          top: event.clientY,
                        }
                        : null,
                    );
                  }}
                  onMouseDown={(e) => {
                    setPopMenu(true);
                    if (e.detail > 1) {
                      // Prevent text selection on double click
                      e.preventDefault();
                    }
                  }}
                >
                  {/* { <rect
                    x={rect.x}
                    y={rect.y}
                    height={rect.height}
                    width={rect.width}
                    fill={layer.color}
                    class={styles.rect}
                    mask={layer.hatched ? 'url(#hatch-mask)' : undefined}
                    opacity={transparentLayers() ? 0.75 : 1.0}
                  /> } */}
                </g>
              </Show>
            );
          }}
        </For>

        <For each={layout.rects}>
          {(rect) => {
            return (
              <Show when={rect.label != null && isLayerVisible(rect.layer)}>
                <text
                  style={{ 'user-select': 'none', 'pointer-events': 'none' }}
                  x={rect.x + rect.width / 2}
                  y={rect.y}
                  text-anchor="middle"
                  alignment-baseline="before-edge"
                >
                  {rect.label}
                </text>
              </Show>
            );
          }}
        </For>

        <Show when={selectedRect()} keyed>
          {(rect) => (
            <rect
              x={rect.x}
              y={rect.y}
              height={rect.height}
              width={rect.width}
              fill="none"
              stroke="blue"
            />
          )}
        </Show>

        <Show when={newRect()} keyed>
          {(rect) => {

            const layer = rectLayer(rect);
            if (layer == null) {
              return;
            }

            const domRect = domRectFromPoints(rect.start, rect.end);
            return (
              <rect
                x={domRect.x}
                y={domRect.y}
                height={domRect.height}
                width={domRect.width}
                fill={layer.color}
                mask={layer.hatched ? 'url(#hatch-mask)' : undefined}
              />
            );
          }}
        </Show>

        {activeDRCItem()?.coords.map((rect) => (
          <rect
            x={rect.x0}
            y={rect.y0}
            width={rect.x1 - rect.x0}
            height={rect.y1 - rect.y0}
            fill="red"
            fill-opacity="0.5"
            stroke="red"
          />
        ))}
        <line
          x1={0}
          y1={viewerState.crossSectionY}
          x2={props.size}
          y2={viewerState.crossSectionY}
          stroke="black"
          stroke-width="1"
        />

        <Scale y={props.size} />
      </svg>
    </>
  );
}
