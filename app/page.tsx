import VoiceRecordCard from "./components/VoiceRecordCard";
import Link from "next/link";
import { CURRENT_STAFF, FACILITY_NAME } from "@/lib/constants";

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col">
      <header className="flex items-center justify-between px-5 pt-6 pb-1">
        <div className="flex flex-col gap-0.5">
          <div className="text-xs font-medium text-muted">{FACILITY_NAME}</div>
          <div className="text-lg font-semibold">介護記録アシスタント</div>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
          {CURRENT_STAFF.name}
        </div>
      </header>

      <p className="px-5 pt-1.5 text-[13px] text-muted-2">
        {CURRENT_STAFF.name}さん、お疲れ様です
      </p>

      <main className="flex flex-1 flex-col justify-center gap-3.5 px-5 py-6">
        <VoiceRecordCard />

        <Link
          href="/residents"
          className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface px-5 py-4.5 transition-colors hover:bg-primary-soft/40"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1EFE9]">
            <UsersIcon className="h-[19px] w-[19px]" stroke="#6B6A63" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-medium">入居者ごとの記録を見る</span>
            <span className="text-xs text-muted-2">音声で記録した内容を確認</span>
          </span>
        </Link>
      </main>

      <div className="flex items-center justify-center gap-1.5 pb-6">
        <SettingsIcon className="h-[13px] w-[13px]" stroke="#B0AC9E" />
        <Link href="/format" className="text-xs text-muted-2 hover:text-primary">
          記録フォーマットの設定・再撮影
        </Link>
      </div>
    </div>
  );
}

function UsersIcon({ className, stroke }: { className?: string; stroke: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function SettingsIcon({ className, stroke }: { className?: string; stroke: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
