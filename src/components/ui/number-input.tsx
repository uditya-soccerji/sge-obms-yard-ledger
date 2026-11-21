"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"

/**
 * A number box that starts blank instead of showing 0, and stays blank when cleared
 * (owner, 2026-11-21: "0645" — the 0 stayed in front of what was typed).
 * The saved figure is still a number: blank counts as 0.
 */
function NumberInput({
  value,
  onValue,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: number | undefined
  onValue: (n: number) => void
}) {
  const [text, setText] = React.useState(value ? String(value) : "")
  // Follow changes made outside the box (a reset, a loaded draft) without fighting the typing
  React.useEffect(() => {
    if ((Number(text) || 0) !== (value ?? 0)) setText(value ? String(value) : "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <Input
      type="number"
      inputMode="decimal"
      {...props}
      value={text}
      onChange={(e) => {
        // No leading zeros: "012" → "12", but "0.5" stays
        const t = e.target.value.replace(/^0+(?=\d)/, "")
        setText(t)
        onValue(Number(t) || 0)
      }}
    />
  )
}

export { NumberInput }
