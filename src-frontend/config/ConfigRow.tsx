import type { ConfigOption, ConfigValue } from "./types";

interface Props {
  option: ConfigOption;
  value: ConfigValue | undefined;
  onChange: (v: ConfigValue) => void;
}

export function ConfigRow({ option, value, onChange }: Props) {
  const id = `cfg-${option.var}`;

  if (option.type === "check") {
    return (
      <label htmlFor={id} className="cfg-row cfg-row-check" title={option.tooltip}>
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{option.label}</span>
      </label>
    );
  }

  if (option.type === "count") {
    return (
      <label htmlFor={id} className="cfg-row cfg-row-count" title={option.tooltip}>
        <span>{option.label}</span>
        <input
          id={id}
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        />
      </label>
    );
  }

  // list
  const items = (option.list ?? []).filter((i): i is NonNullable<typeof i> => i != null);
  if (items.length === 0) {
    return (
      <label className="cfg-row cfg-row-list" title={option.tooltip}>
        <span>{option.label}</span>
        <em style={{ opacity: 0.5 }}>(no options)</em>
      </label>
    );
  }
  const current = value ?? items[(option.defaultIndex ?? 1) - 1]?.val ?? items[0].val;
  return (
    <label htmlFor={id} className="cfg-row cfg-row-list" title={option.tooltip}>
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
    </label>
  );
}
