"use client";

import type { DesignMode } from "@flowcad/shared";
import { useViewerStore } from "@/store/useViewerStore";
import type { LabelMode, ViewMode } from "@/store/useViewerStore";

interface ToolbarProps {
  onGenerate: () => void;
  onLoadSample: () => void;
}

export function Toolbar({ onGenerate, onLoadSample }: ToolbarProps) {
  const {
    mode,
    setMode,
    viewMode,
    setViewMode,
    labelMode,
    setLabelMode,
    searchTerm,
    setSearch,
    loading,
  } = useViewerStore();

  return (
    <header className="flex items-center gap-3 px-4 py-2 bg-panel border-b border-panelLight">
      <div className="font-semibold text-accent mr-2">FlowCAD&nbsp;3D</div>

      <Segmented<DesignMode>
        value={mode}
        onChange={setMode}
        options={[
          { value: "pipe", label: "파이프" },
          { value: "duct", label: "덕트" },
        ]}
      />

      <Segmented<ViewMode>
        value={viewMode}
        onChange={setViewMode}
        options={[
          { value: "true_scale", label: "실척 3D" },
          { value: "iso", label: "ISO 뷰" },
        ]}
      />

      <Segmented<LabelMode>
        value={labelMode}
        onChange={setLabelMode}
        options={[
          { value: "auto", label: "라벨 자동" },
          { value: "all", label: "전체" },
          { value: "joints", label: "조인트만" },
          { value: "none", label: "숨김" },
        ]}
      />

      <input
        value={searchTerm}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="조인트/피팅 검색 (예: JNT-005)"
        className="flex-1 max-w-xs px-3 py-1.5 rounded bg-panelLight text-sm outline-none focus:ring-1 ring-accent"
      />

      <div className="flex-1" />

      <button
        onClick={onLoadSample}
        className="px-3 py-1.5 rounded bg-panelLight hover:bg-[#222b37] text-sm"
      >
        샘플 불러오기
      </button>
      <button
        onClick={onGenerate}
        disabled={loading}
        className="px-4 py-1.5 rounded bg-accent hover:brightness-110 text-white text-sm font-medium disabled:opacity-50"
      >
        {loading ? "생성 중…" : "3D 생성"}
      </button>
    </header>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}

function Segmented<T extends string>({ value, onChange, options }: SegmentedProps<T>) {
  return (
    <div className="flex rounded bg-panelLight p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
            value === o.value ? "bg-accent text-white" : "text-gray-300 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
