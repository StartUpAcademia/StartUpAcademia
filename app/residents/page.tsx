"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ALL_RESIDENTS, FACILITY_NAME, STAFF_LIST } from "@/lib/constants";
import { getFormatFields, getRecords } from "@/lib/storage";
import { seedOtherResidentsIfNeeded } from "@/lib/seed";
import { CareRecord, FormatField } from "@/lib/types";

const DISPLAY_RESIDENTS = [...ALL_RESIDENTS, { id: "", name: "利用者未指定（要確認）", roomNumber: "―" }];

const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  介護士: { bg: "#E4EFEE", color: "#2B6E68" },
  看護師: { bg: "#FBEEDD", color: "#8A5A1E" },
};

export default function ResidentsPage() {
  const [records, setRecords] = useState<CareRecord[]>([]);
  const [fields, setFields] = useState<FormatField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    seedOtherResidentsIfNeeded();
    // Initial hydration from the browser-only record store.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecords(getRecords());
    setFields(getFormatFields().slice().sort((a, b) => a.order - b.order));
  }, []);

  const effectiveId = selectedId ?? ALL_RESIDENTS[0].id;
  const currentResident = DISPLAY_RESIDENTS.find((r) => r.id === effectiveId) ?? ALL_RESIDENTS[0];

  const timeline = useMemo(
    () =>
      records
        .filter((r) => r.residentId === effectiveId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [records, effectiveId]
  );

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside
        className={`${selectedId !== null ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-border bg-surface md:w-64 md:border-r`}
      >
        <div className="px-5 pt-6 pb-3 md:px-5 md:pt-6">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-muted-2 hover:text-primary" aria-label="ホームへ戻る">
              ←
            </Link>
            <div className="text-xs font-medium text-muted">{FACILITY_NAME}</div>
          </div>
          <div className="mt-1 text-[17px] font-semibold">入居者ごとの記録</div>
        </div>
        <div className="flex flex-col gap-1 overflow-y-auto px-3 pb-4">
          {DISPLAY_RESIDENTS.map((resident) => {
            const count = records.filter((r) => r.residentId === resident.id).length;
            const isSelected = resident.id === effectiveId;
            return (
              <button
                key={resident.id}
                type="button"
                onClick={() => {
                  setSelectedId(resident.id);
                  setExpandedId(null);
                }}
                className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors"
                style={{ background: isSelected ? "var(--color-primary-soft)" : "transparent" }}
              >
                <div
                  className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
                  style={{
                    background: isSelected ? "var(--color-primary)" : "#EFEDE6",
                    color: isSelected ? "#FFFFFF" : "#6B6A63",
                  }}
                >
                  {resident.name.slice(0, 1)}
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div
                    className="truncate text-sm font-medium"
                    style={{ color: isSelected ? "var(--color-primary-dark)" : "var(--foreground)" }}
                  >
                    {resident.name}{records.some(r => r.residentId === resident.id && r.reviewRequired) ? " ⚠ 要確認" : ""}
                  </div>
                  <div className="text-[11px] text-muted-2">
                    {resident.roomNumber}号室{count > 0 ? ` ・ ${count}件` : ""}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className={`${selectedId !== null ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-4.5 md:px-8">
          <div className="flex items-baseline gap-2.5">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="mr-1 text-muted-2 hover:text-primary md:hidden"
              aria-label="入居者一覧へ戻る"
            >
              ←
            </button>
            <div className="text-lg font-semibold md:text-xl">{currentResident.name}</div>
            <div className="text-[13px] text-muted-2">{currentResident.roomNumber}号室</div>
          </div>
          <div className="hidden text-xs text-muted-2 md:block">複数の介護士・看護師の記録をまとめて表示</div>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4 md:px-8 md:py-5">
          {timeline.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-muted">まだ記録がありません。</p>
              {currentResident.id === ALL_RESIDENTS[0].id && (
                <Link href="/main" className="text-sm text-primary underline">
                  記録を開始する
                </Link>
              )}
            </div>
          ) : (
            timeline.map((record) => {
              const staff = STAFF_LIST.find((s) => s.id === record.staffId);
              const roleStyle = staff ? ROLE_STYLE[staff.role] : undefined;
              const isExpanded = expandedId === record.id;

              return (
                <div key={record.id} className={`rounded-xl border bg-surface ${record.reviewRequired ? "border-amber-500 ring-1 ring-amber-300" : "border-border"}`}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : record.id)}
                    className="flex w-full items-start gap-3 p-4 text-left md:gap-4"
                  >
                    <div className="flex w-16 shrink-0 flex-col gap-0.5 md:w-[76px]">
                      <div className="text-xs font-semibold">{formatTime(record.createdAt)}</div>
                      <div className="text-[11px] text-muted-2">{formatRelativeDate(record.createdAt)}</div>
                    </div>
                    <div className="w-px shrink-0 self-stretch bg-border" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      {record.reviewRequired && <div className="font-semibold text-amber-800">⚠ 要確認 ・ 音声記録未完了</div>}
                      <div className="text-xs text-muted">{new Date(record.createdAt).toLocaleString('ja-JP')}{record.inputMethod === 'voice' ? ' ・ 音声入力' : ''}</div>
                      {record.category && <div className="text-sm font-semibold">{record.category}：{record.content}</div>}
                      {record.reviewRequired && <div className="text-xs text-muted">開始：{record.startedAt && new Date(record.startedAt).toLocaleString('ja-JP')}<br />終了：{record.endedAt && new Date(record.endedAt).toLocaleString('ja-JP')}</div>}
                      <div className="flex items-center gap-2">
                        {staff && (
                          <span
                            className="rounded-md px-2 py-0.5 text-xs font-semibold"
                            style={{ background: roleStyle?.bg, color: roleStyle?.color }}
                          >
                            {staff.role}
                          </span>
                        )}
                        <span className="text-[13px] font-medium">{staff?.name ?? "職員"}</span>
                      </div>
                      <div className="line-clamp-2 text-[13px] leading-relaxed text-[#4A493F]">
                        {summaryOf(record, fields)}
                      </div>
                    </div>
                    <span className="shrink-0 self-center text-muted-2">{isExpanded ? "︿" : "﹀"}</span>
                  </button>

                  {isExpanded && (
                    <div className="flex flex-col gap-2 border-t border-border px-4 pb-4 pt-3 md:pl-[112px]">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {fields
                          .filter((field) => !isLongTextField(field, record))
                          .map((field) => {
                            const fv = record.fields.find((f) => f.fieldId === field.id);
                            const filled = fv && !fv.isMissing && fv.value;
                            return (
                              <div key={field.id} className="flex items-baseline justify-between gap-3 rounded-lg bg-[#FAF9F6] px-3 py-2">
                                <span className="shrink-0 text-xs text-muted">{field.label}</span>
                                <span className="text-right text-[13px] font-medium">{filled ? fv!.value : "―"}</span>
                              </div>
                            );
                          })}
                      </div>
                      {fields
                        .filter((field) => isLongTextField(field, record))
                        .map((field) => {
                          const fv = record.fields.find((f) => f.fieldId === field.id);
                          const filled = fv && !fv.isMissing && fv.value;
                          return (
                            <div key={field.id} className="flex flex-col gap-1 rounded-lg bg-[#FAF9F6] px-3 py-2">
                              <span className="text-xs text-muted">{field.label}</span>
                              <span className="text-[13px] leading-relaxed">{filled ? fv!.value : "―"}</span>
                            </div>
                          );
                        })}
                      <div className="mt-1 rounded-lg bg-[#F1EFE9] px-3.5 py-3 text-xs leading-relaxed text-muted">
                        <div className="mb-1 text-[10px] text-muted-2">元の発話内容</div>
                        「{record.rawTranscript}」
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function formatRelativeDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "本日";
  if (sameDay(d, yesterday)) return "昨日";
  return d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function isLongTextField(field: FormatField, record: CareRecord) {
  if (field.type.includes("自由記述")) return true;
  const fv = record.fields.find((f) => f.fieldId === field.id);
  return (fv?.value.length ?? 0) > 12;
}

function summaryOf(record: CareRecord, fields: FormatField[]) {
  if (record.content) return record.content;
  const noteField = fields.find((f) => f.label.includes("特記"));
  if (noteField) {
    const fv = record.fields.find((f) => f.fieldId === noteField.id);
    if (fv && !fv.isMissing && fv.value) return fv.value;
  }
  const firstFilled = record.fields.find((f) => !f.isMissing && f.value);
  if (firstFilled) return firstFilled.value;
  return record.rawTranscript;
}
