"use client";

import { useRef, useState } from "react";
import type { StaffOption } from "./apply-form";
import { filterStaff, staffLabel } from "./staff-filter";

/**
 * 担当者の検索付きプルダウン(コンボボックス)。
 * ・クリックで候補一覧を表示、文字入力で氏名・所属会社を絞り込み
 * ・候補クリックで選択(選択値は親へ staff id を返す)
 * ・入力を変えると選択は解除される(親側で未選択=申請ボタン無効を維持)
 * ・スマホでも押しやすいよう候補は大きめに表示
 */
export function StaffCombobox({
  staffMembers,
  value,
  onChange,
}: {
  staffMembers: StaffOption[];
  value: string;
  onChange: (staffId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = staffMembers.find((s) => s.id === value) ?? null;
  const candidates = filterStaff(staffMembers, query);

  function openList() {
    setOpen(true);
    setQuery("");
  }

  function pick(staff: StaffOption) {
    onChange(staff.id);
    setQuery("");
    setOpen(false);
  }

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    // コンテナ外へフォーカスが移ったときだけ閉じる
    if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          value={open ? query : selected ? staffLabel(selected) : ""}
          onChange={(e) => {
            setQuery(e.target.value);
            if (value) onChange(""); // 入力し直したら選択解除
            if (!open) setOpen(true);
          }}
          onFocus={openList}
          onClick={openList}
          placeholder="氏名・所属会社で検索"
          className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2.5 pr-16 text-sm focus:border-blue-500 focus:outline-none"
        />
        {selected && !open && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setQuery("");
            }}
            aria-label="選択を解除"
            className="absolute right-8 top-1/2 mt-0.5 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 text-gray-400"
        >
          ▾
        </span>
      </div>

      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          {candidates.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-500">
              該当する担当者がいません
            </li>
          )}
          {candidates.map((s) => (
            <li key={s.id} role="option" aria-selected={s.id === value}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // blurより先に選択を確定させる
                onClick={() => pick(s)}
                className={`block w-full px-4 py-3 text-left text-sm active:bg-blue-100 ${
                  s.id === value
                    ? "bg-blue-50 font-semibold text-blue-800"
                    : "text-gray-800 hover:bg-gray-50"
                }`}
              >
                {staffLabel(s)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
