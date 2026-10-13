"use client";

import { Input } from "@/components/ui/input";

/**
 * A text box that saves when you leave it (or press Enter), not on every key —
 * so one edit writes one save and one audit line. Re-syncs when the saved value changes.
 */
export function BlurInput({
  value,
  onSave,
  ...rest
}: { value: string; onSave: (v: string) => void } & Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "onBlur" | "defaultValue"
>) {
  return (
    <Input
      key={value}
      defaultValue={value}
      onBlur={(e) => {
        if (e.target.value !== value) onSave(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      {...rest}
    />
  );
}
