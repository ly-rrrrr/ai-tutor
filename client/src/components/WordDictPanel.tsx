import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { X, Volume2, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface WordDictPanelProps {
  word: string | null;
  onClose: () => void;
}

const PART_OF_SPEECH_ZH: Record<string, string> = {
  noun: "名词",
  verb: "动词",
  adjective: "形容词",
  adverb: "副词",
  pronoun: "代词",
  preposition: "介词",
  conjunction: "连词",
  interjection: "感叹词",
  article: "冠词",
  determiner: "限定词",
  phrase: "短语",
  idiom: "习语",
};

const LEVEL_COLORS: Record<string, string> = {
  A1: "bg-green-100 text-green-700",
  A2: "bg-green-100 text-green-700",
  B1: "bg-blue-100 text-blue-700",
  B2: "bg-blue-100 text-blue-700",
  C1: "bg-purple-100 text-purple-700",
  C2: "bg-purple-100 text-purple-700",
};

export default function WordDictPanel({ word, onClose }: WordDictPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // 点击面板外部（遮罩层）关闭
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  // 按 Escape 关闭
  useEffect(() => {
    if (!word) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [word, onClose]);

  const { data, isLoading } = trpc.word.lookup.useQuery(
    { word: word ?? "" },
    { enabled: !!word, staleTime: 1000 * 60 * 10 } // 缓存10分钟，避免重复请求
  );

  // 朗读单词
  const handleSpeak = () => {
    if (!word) return;
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  };

  if (!word) return null;

  return (
    // 半透明遮罩层，点击关闭
    <div
      className="fixed inset-0 z-50 flex items-end"
      onClick={handleOverlayClick}
      style={{ backgroundColor: "rgba(0,0,0,0.25)" }}
    >
      {/* 词典面板 */}
      <div
        ref={panelRef}
        className="w-full bg-white rounded-t-2xl shadow-2xl"
        style={{
          maxHeight: "60vh",
          overflowY: "auto",
          animation: "slideUp 0.22s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部拖动条 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* 头部：单词 + 音标 + 操作 */}
        <div className="flex items-start justify-between px-5 pt-2 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-gray-900">{word}</h2>
                {data?.level && (
                  <Badge className={`text-xs px-2 py-0.5 ${LEVEL_COLORS[data.level] ?? "bg-gray-100 text-gray-600"}`}>
                    {data.level}
                  </Badge>
                )}
              </div>
              {data?.phonetic && (
                <p className="text-sm text-gray-500 mt-0.5">{data.phonetic}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <button
              onClick={handleSpeak}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-primary"
              title="朗读单词"
            >
              <Volume2 className="h-5 w-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"
              title="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 内容区 */}
        <div className="px-5 py-4 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="space-y-2 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-16" />
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-full" />
                </div>
              ))}
            </div>
          ) : data?.definitions?.length ? (
            <>
              {/* 释义列表 */}
              <div className="space-y-3">
                {data.definitions.map((def, idx) => (
                  <div key={idx} className="flex gap-3">
                    <span className="shrink-0 text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full h-fit mt-0.5">
                      {PART_OF_SPEECH_ZH[def.partOfSpeech] ?? def.partOfSpeech}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-medium text-gray-800">{def.meaning}</p>
                      {def.example && (
                        <p className="text-sm text-gray-500 mt-1 italic leading-relaxed">
                          "{def.example}"
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* 同义词 */}
              {data.synonyms?.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                    <BookOpen className="h-3 w-3" /> 近义词
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {data.synonyms.map((syn) => (
                      <span
                        key={syn}
                        className="text-sm text-primary bg-primary/8 border border-primary/20 px-3 py-1 rounded-full cursor-pointer hover:bg-primary/15 transition-colors"
                      >
                        {syn}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-400 text-sm text-center py-4">暂无释义</p>
          )}
        </div>

        {/* 底部安全区 */}
        <div className="h-4" />
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
