import { useState, type ReactNode } from "react";
import { TextTooltip } from "../ui/TextTooltip";
import type { ConfigOption, ConfigValue } from "./types";

interface Props {
  option: ConfigOption;
  value: ConfigValue | undefined;
  onChange: (v: ConfigValue) => void;
}

function HoverRow({
  tooltip,
  className,
  htmlFor,
  children,
}: {
  tooltip?: string;
  className: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const showTip = !!(tooltip && tooltip.trim().length > 0);
  return (
    <>
      <label
        htmlFor={htmlFor}
        className={className}
        onMouseEnter={(e) => showTip && setHover({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setHover(null)}
      >
        {children}
      </label>
      {showTip && hover && <TextTooltip text={tooltip!} x={hover.x} y={hover.y} />}
    </>
  );
}

export function ConfigRow({ option, value, onChange }: Props) {
  const id = `cfg-${option.var}`;

  if (option.type === "check") {
    return (
      <HoverRow tooltip={option.tooltip} className="cfg-row cfg-row-check" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{option.label}</span>
      </HoverRow>
    );
  }

  if (option.type === "count") {
    return (
      <HoverRow tooltip={option.tooltip} className="cfg-row cfg-row-count" htmlFor={id}>
        <span>{option.label}</span>
        <input
          id={id}
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        />
      </HoverRow>
    );
  }

  // list
  const rawList = Array.isArray(option.list)
    ? option.list
    : option.list && typeof option.list === "object"
      ? Object.values(option.list as Record<string, unknown>)
      : [];
  const items = rawList.filter(
    (i): i is { val: number | string; label: string } =>
      i != null && typeof i === "object" && "val" in (i as object),
  );
  if (items.length === 0) {
    return (
      <HoverRow tooltip={option.tooltip} className="cfg-row cfg-row-list">
        <span>{option.label}</span>
        <em style={{ opacity: 0.5 }}>(no options)</em>
      </HoverRow>
    );
  }
  const current = value ?? items[(option.defaultIndex ?? 1) - 1]?.val ?? items[0]?.val ?? "";
  return (
    <HoverRow tooltip={option.tooltip} className="cfg-row cfg-row-list" htmlFor={id}>
      <span>{option.label}</span>
      <select
        id={id}
        value={String(current)}
        onChange={(e) => {
          const raw = e.target.value;
          const match = items.find((i) => String(i.val) === raw);
          onChange(match ? match.val : raw);
        }}
      >
        {items.map((item, idx) => (
          <option key={`${String(item.val)}:${idx}`} value={String(item.val)}>
            {item.label}
          </option>
        ))}
      </select>
    </HoverRow>
  );
}
