import asyncio
from pathlib import Path

import edge_tts


PHRASES = {
    "start-record.mp3": "記録を開始します。誰の記録をしますか？",
    "retry.mp3": "聞き取れませんでした。もう一度話してください。",
    "end-record.mp3": "記録を終了します",
    "already-recording.mp3": "記録中です。終了する場合はエンドと話してください",
    "unknown-resident.mp3": "利用者を特定できませんでした。登録されているフルネームでもう一度話してください",
    "correction.mp3": "訂正内容を話してください",
    "confirm-save.mp3": "登録する場合は、はい、修正する場合は、訂正、と話してください",
    "saved.mp3": "確認画面の項目に反映しました。記録全体の保存は画面下の保存するボタンを押してください。",
    "record-content.mp3": "記録内容を話してください",
    "confirm-temporary-save.mp3": "この内容を一時保存しますか？",
    "save-error.mp3": "下書きに反映できませんでした。もう一度、はい、と話してください。",
    "resident-tanaka.mp3": "田中花子さんの記録を開始します。記録内容を話してください",
    "resident-suzuki.mp3": "鈴木一郎さんの記録を開始します。記録内容を話してください",
    "resident-takahashi.mp3": "高橋幸子さんの記録を開始します。記録内容を話してください",
    "resident-watanabe.mp3": "渡辺誠さんの記録を開始します。記録内容を話してください",
    "resident-ito.mp3": "伊藤みつさんの記録を開始します。記録内容を話してください",
    "demo-temperature-365.mp3": "体温、三十六点五度",
    "demo-blood-pressure-120-80.mp3": "血圧、上が百二十、下が八十",
    "demo-vitals-365.mp3": "体温、三十六点五度。血圧、上が百二十、下が八十",
    "demo-vitals-372.mp3": "体温、三十七点二度。血圧、上が百二十、下が八十",
    "demo-vitals-394.mp3": "体温、三十九点四度。血圧、上が百二十、下が八十",
}


async def main() -> None:
    output = Path(__file__).resolve().parent.parent / "public" / "audio" / "voice"
    output.mkdir(parents=True, exist_ok=True)
    for filename, text in PHRASES.items():
        await edge_tts.Communicate(text, "ja-JP-NanamiNeural").save(output / filename)
    print(f"Generated {len(PHRASES)} Japanese demo audio files.")


if __name__ == "__main__":
    asyncio.run(main())
