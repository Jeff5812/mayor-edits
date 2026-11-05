"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { CheckIcon } from "./PlayerIcons";

export interface PlayerMenuOption {
  value: string;
  label: string;
  lang?: string;
}

// A short list that opens above its button in the control bar. It is drawn by the site rather than left to the browser,
// because a native list's colours and position vary by system, and it has to read clearly over any video and in full screen.
export function PlayerMenu({
  title,
  testId,
  trigger,
  triggerTitle,
  triggerClass,
  options,
  value,
  onChange,
  onOpenChange,
}: {
  title: string;
  testId: string;
  trigger: ReactNode;
  triggerTitle: string;
  triggerClass: string;
  options: PlayerMenuOption[];
  value: string;
  onChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  function change(next: boolean) {
    setOpen(next);
    onOpenChange(next);
  }

  useEffect(() => {
    if (!open) return;
    // The whole list in view, even when the frame sits right under the site's header. Instantly, so the focus below starts from there.
    list.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    // Land on the current choice, so the keyboard starts from where the viewer already is.
    list.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const onPress = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        onOpenChange(false);
      }
    };
    document.addEventListener("pointerdown", onPress);
    return () => document.removeEventListener("pointerdown", onPress);
  }, [open, onOpenChange]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      change(false);
      button.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    items[(at + step + items.length) % items.length]?.focus();
  }

  return (
    <div ref={root} data-player-menu className="relative" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerTitle}
        title={triggerTitle}
        data-testid={testId}
        className={triggerClass}
        onClick={() => change(!open)}
      >
        {trigger}
      </button>
      {open ? (
        <div ref={list} role="menu" aria-label={title} data-testid={`${testId}-menu`} className="player-menu">
          <p className="player-menu-title">{title}</p>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              className="player-menu-item"
              onClick={() => {
                onChange(option.value);
                change(false);
                button.current?.focus();
              }}
            >
              {/* The name reads in its own direction, while the list itself stays lined up on one side. */}
              <span lang={option.lang} dir="auto">
                {option.label}
              </span>
              {option.value === value ? <CheckIcon /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
