import { useState } from "react";
import type { Json } from "@loops/core";

export interface JsonTreeProps {
  value: Json;
  /** The key (or array index label) this value was found under; omitted for the root. */
  name?: string;
}

function isPlainObject(value: Json): value is { [k: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatPrimitive(value: string | number | boolean | null): string {
  return value === null ? "null" : typeof value === "string" ? JSON.stringify(value) : String(value);
}

export function JsonTree({ value, name }: JsonTreeProps): React.JSX.Element {
  if (Array.isArray(value) || isPlainObject(value)) return <Composite value={value} name={name} />;
  return (
    <div className="json-node">
      {name !== undefined && <span className="json-key">{name}: </span>}
      <span className={`json-value json-${value === null ? "null" : typeof value}`}>{formatPrimitive(value)}</span>
    </div>
  );
}

function Composite({ value, name }: { value: Json[] | { [k: string]: Json }; name?: string }): React.JSX.Element {
  const [expanded, setExpanded] = useState(true);
  const isArray = Array.isArray(value);
  const entries: ReadonlyArray<readonly [string, Json]> = isArray
    ? value.map((v, i): [string, Json] => [String(i), v])
    : Object.entries(value);
  const count = entries.length;
  const summary = isArray ? `${count} ${count === 1 ? "item" : "items"}` : `${count} ${count === 1 ? "key" : "keys"}`;
  const [open, close] = isArray ? ["[", "]"] : ["{", "}"];

  return (
    <div className="json-node">
      <button
        type="button"
        className="json-toggle"
        aria-expanded={expanded}
        aria-label={name !== undefined ? `${name}: ${summary}` : summary}
        onClick={() => setExpanded((e) => !e)}
      >
        <span aria-hidden="true" className="json-disclosure">
          {expanded ? "▾" : "▸"}
        </span>
        {name !== undefined && <span className="json-key">{name}: </span>}
        <span className="json-brackets">{expanded ? open : `${open}${summary}${close}`}</span>
      </button>
      {expanded && (
        <div className="json-children">
          {entries.map(([k, v]) => (
            <JsonTree key={k} name={isArray ? undefined : k} value={v} />
          ))}
          <div className="json-brackets">{close}</div>
        </div>
      )}
    </div>
  );
}
