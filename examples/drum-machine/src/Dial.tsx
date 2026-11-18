import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

export interface DialProps {
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  disabled: boolean;
  /** Accessible name; also the tooltip-style label shown while interacting. */
  label: string;
  format(value: number): string;
  /** Values to mark with short ticks; the quarter points of the range when omitted. */
  ticks?: readonly number[];
  onChange(value: number): void;
}

const ARC_START = -135;
const ARC_END = 135;
const ARC_SWEEP = ARC_END - ARC_START;

function angleOf(value: number, min: number, max: number): number {
  const fraction = max === min ? 0 : (value - min) / (max - min);
  return ARC_START + fraction * (ARC_END - ARC_START);
}

function roundToStep(raw: number, min: number, max: number, step: number): number {
  const stepped = Math.round((raw - min) / step) * step + min;
  return Math.min(max, Math.max(min, stepped));
}

/** Pointer's angle, in degrees, around the dial's own center — not the drawn arc, just a direction. */
function angleFromPointer(clientX: number, clientY: number, rect: DOMRect): number {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
}

/** Shortest signed turn from one angle to another, so crossing the ±180° seam never jumps. */
function angleDelta(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function Dial({ value, min, max, step, defaultValue, disabled, label, format, ticks, onChange }: DialProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const dragRect = useRef<DOMRect | null>(null);
  const lastAngle = useRef(0);
  const rawValue = useRef(0);
  // Both commit and cancel move focus back to the slider, which blurs the edit field and would
  // otherwise re-enter onEditBlur and double-commit.
  const suppressNextBlur = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const showLabel = !disabled && !editing && (dragging || focused || hovered);

  useEffect(() => {
    if (editing) {
      editRef.current?.focus();
      editRef.current?.select();
    }
  }, [editing]);

  const startEditing = () => {
    if (disabled) return;
    setDraft(String(value));
    setEditing(true);
  };

  const commitEdit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) {
      const next = roundToStep(parsed, min, max, step);
      if (next !== value) onChange(next);
    }
    suppressNextBlur.current = true;
    setEditing(false);
    inputRef.current?.focus();
  };

  const cancelEdit = () => {
    suppressNextBlur.current = true;
    setEditing(false);
    inputRef.current?.focus();
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || editing) return;
    // Otherwise the browser's own "mousedown on a non-focusable target blurs" default action
    // runs right after our explicit focus() below and undoes it.
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    dragRect.current = rect;
    lastAngle.current = angleFromPointer(e.clientX, e.clientY, rect);
    rawValue.current = value;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    inputRef.current?.focus();
    setDragging(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging || dragRect.current === null) return;
    const angle = angleFromPointer(e.clientX, e.clientY, dragRect.current);
    const delta = angleDelta(angle - lastAngle.current);
    lastAngle.current = angle;
    rawValue.current = Math.min(max, Math.max(min, rawValue.current + (delta / ARC_SWEEP) * (max - min)));
    const next = roundToStep(rawValue.current, min, max, step);
    if (next !== value) onChange(next);
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDragging(false);
    dragRect.current = null;
  };

  // jsdom (and no browser) steps a range input's value on arrow keys, so stepping is hand-rolled here.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "Enter") {
      e.preventDefault();
      startEditing();
      return;
    }
    let next: number | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") next = Math.min(max, value + step);
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") next = Math.max(min, value - step);
    else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    if (next === null) return;
    e.preventDefault();
    if (next !== value) onChange(next);
  };

  const onEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commitEdit();
    else if (e.key === "Escape") cancelEdit();
  };

  const onEditBlur = () => {
    if (suppressNextBlur.current) {
      suppressNextBlur.current = false;
      return;
    }
    commitEdit();
  };

  const tick = (at: number, name: string, inner = 7) => (
    <line key={name} data-tick={name} x1="18" y1="3" x2="18" y2={inner} transform={`rotate(${angleOf(at, min, max)} 18 18)`} />
  );
  const marks =
    ticks === undefined
      ? [0.25, 0.5, 0.75].map((fraction) => ({ at: min + fraction * (max - min), name: String(fraction * 100) }))
      : ticks.map((at) => ({ at, name: String(at) }));

  return (
    <div
      className="dial"
      data-disabled={disabled ? "" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={startEditing}
    >
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="dial-face" cx="18" cy="18" r="15" />
        {marks.map(({ at, name }) => tick(at, name, 5))}
        {tick(min, "min")}
        {tick(max, "max")}
        {tick(defaultValue, "default")}
        <line className="dial-pointer" x1="18" y1="18" x2="18" y2="5" transform={`rotate(${angleOf(value, min, max)} 18 18)`} />
      </svg>
      <input
        ref={inputRef}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {editing && (
        <input
          ref={editRef}
          type="text"
          inputMode="decimal"
          className="dial-edit"
          aria-label={label}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onEditKeyDown}
          onBlur={onEditBlur}
        />
      )}
      {showLabel && <span className="dial-value topcoat-tooltip">{format(value)}</span>}
    </div>
  );
}
