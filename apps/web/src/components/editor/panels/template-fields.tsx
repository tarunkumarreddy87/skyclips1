"use client";

import { useEffect, useId, useState } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Keep incomplete numeric input local; only finite, in-range values enter the timeline. */
export function TemplateNumber({ label, value, onChange, min, max, placeholder }: {
  label: string; value?: number; onChange: (value: number) => void; min?: number; max?: number; placeholder?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value ?? ""));
  useEffect(() => setDraft(String(value ?? "")), [value]);
  const invalid = draft !== "" && (!Number.isFinite(Number(draft)) || (min != null && Number(draft) < min) || (max != null && Number(draft) > max));
  return <Field data-invalid={invalid}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Input id={id} type="number" step="any" min={min} max={max} value={draft} placeholder={placeholder} aria-invalid={invalid}
      onChange={e => {
        const text = e.target.value;
        setDraft(text);
        const n = e.target.valueAsNumber;
        if (text && Number.isFinite(n) && (min == null || n >= min) && (max == null || n <= max)) onChange(n);
      }} onBlur={() => setDraft(String(value ?? ""))} />
  </Field>;
}

export function TemplateChoice({ label, value, options, onChange }: {
  label: string; value: string; options: ReadonlyArray<{ value: string; label: string }>; onChange: (value: string) => void;
}) {
  const id = useId();
  return <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select value={value} onValueChange={v => { if (v != null) onChange(v); }}>
      <SelectTrigger id={id} className="w-full"><SelectValue>{options.find(o => o.value === value)?.label ?? value}</SelectValue></SelectTrigger>
      <SelectContent><SelectGroup>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  </Field>;
}
