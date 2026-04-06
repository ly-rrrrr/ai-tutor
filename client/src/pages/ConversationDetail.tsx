import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Mic, Send, ArrowLeft, Sparkles, User, Loader2,
  CheckCircle2, AlertCircle, Lightbulb, Volume2, Square,
  Pause, Languages, MessageSquarePlus, ArrowRightLeft, X
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";
import ClickableText from "@/components/ClickableText";
import WordDictPanel from "@/components/WordDictPanel";

type FeedbackData = {
  grammarCorrections: Array<{ original: string; corrected: string; explanation: string }>;
  expressionSuggestions: Array<{ original: string; better: string; reason: string }>;
  overallScore: number;
  encouragement: string;
};

type PronunciationData = {
  accuracy: number;
  fluency: number;
  completeness: number;
  overallScore: number;
  suggestions: string[];
};

type DisplayMessage = {
  id?: number;
  role: "user" | "assistant" | "system";
  content: string;
  feedback?: FeedbackData | null;
  pronunciation?: PronunciationData | null;
  audioUrl?: string | null;
  audioObjectKey?: string | null;
  audioContentType?: string | null;
  translation?: string | null;
};

// Input mode: text or voice
type InputMode = "text" | "voice";

// State for zh2en voice modal
type Zh2EnState =
  | { phase: "idle" }
  | { phase: "recording" }
  | { phase: "processing" }
  | { phase: "result"; chineseText: string; english: string; alternatives: string[] };

export default function ConversationDetail() {
  const params = useParams<{ id: string }>();
  const conversationId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const [input, setInput] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [isRecording, setIsRecording] = useState(false);
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [expandedFeedback, setExpandedFeedback] = useState<number | null>(null);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [ttsLoadingIdx, setTtsLoadingIdx] = useState<number | null>(null);
  const [translatingIdx, setTranslatingIdx] = useState<number | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ text: string; hint: string }>>([]);

  // zh2en modal state
  const [zh2enOpen, setZh2enOpen] = useState(false);
  const [zh2enState, setZh2enState] = useState<Zh2EnState>({ phase: "idle" });
  // Word dictionary panel
  const [selectedWord, setSelectedWord] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const zh2enMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const zh2enChunksRef = useRef<Blob[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);

  const { data, isLoading: loadingConv } = trpc.conversation.getById.useQuery(
    { id: conversationId },
    { enabled: conversationId > 0 }
  );

  const sendMessage = trpc.chat.send.useMutation({
    onSuccess: (result) => {
      setDisplayMessages(prev => [...prev, {
        id: result.assistantMessageId,
        role: "assistant",
        content: result.content,
        audioUrl: null,
      }]);
      scrollToBottom();
    },
    onError: () => toast.error("Failed to get response"),
  });

  const analyzeMessage = trpc.chat.analyze.useMutation();
  const translateMsg = trpc.chat.translate.useMutation();
  const suggestReplyMutation = trpc.chat.suggestReply.useMutation();
  const translateToEnglishMutation = trpc.chat.translateToEnglish.useMutation();
  const uploadAudio = trpc.voice.uploadAudio.useMutation();
  const transcribe = trpc.voice.transcribe.useMutation();
  const assessPronunciation = trpc.voice.assessPronunciation.useMutation();
  const ttsMutation = trpc.voice.tts.useMutation();
  const completeConv = trpc.conversation.complete.useMutation({
    onSuccess: (result) => {
      toast.success("Conversation completed! Check your feedback.");
      setDisplayMessages(prev => [...prev, {
        role: "assistant",
        content: `**Session Summary**\n\n${result.feedback}\n\n${result.avgScore ? `**Average Score: ${Math.round(result.avgScore)}/100**` : ""}`,
      }]);
    },
  });

  // Initialize messages from loaded conversation
  useEffect(() => {
    if (data?.messages) {
      setDisplayMessages(
        data.messages
          .filter(m => m.role !== "system")
          .map(m => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            audioUrl: m.audioUrl ?? null,
            audioObjectKey: m.audioObjectKey ?? null,
            audioContentType: m.audioContentType ?? null,
          }))
      );
    }
  }, [data]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Reset zh2en state when modal closes
  useEffect(() => {
    if (!zh2enOpen) {
      setZh2enState({ phase: "idle" });
      // Stop any ongoing zh2en recording
      if (zh2enMediaRecorderRef.current && zh2enMediaRecorderRef.current.state !== "inactive") {
        zh2enMediaRecorderRef.current.stop();
      }
    }
  }, [zh2enOpen]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement;
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
      }
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [displayMessages, scrollToBottom]);

  // ==================== TTS Playback ====================
  const handlePlayTTS = async (msgIdx: number, text: string) => {
    if (playingIdx === msgIdx) {
      stopAudio();
      return;
    }
    stopAudio();

    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/#{1,6}\s/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .trim();

    const cachedUrl = displayMessages[msgIdx]?.audioUrl;
    if (cachedUrl) {
      playAudioUrl(cachedUrl, msgIdx);
      return;
    }

    // Primary: Web Speech API
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        speechSynthRef.current = utterance;
        const voices = window.speechSynthesis.getVoices();
        const englishVoice = voices.find(v =>
          v.lang.startsWith('en') && (v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Moira') || v.name.includes('Tessa') || v.name.includes('Victoria'))
        ) || voices.find(v => v.lang === 'en-US') || voices.find(v => v.lang.startsWith('en'));
        if (englishVoice) utterance.voice = englishVoice;
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        utterance.pitch = 1.05;
        utterance.volume = 1.0;
        setPlayingIdx(msgIdx);
        utterance.onend = () => { setPlayingIdx(null); speechSynthRef.current = null; };
        utterance.onerror = () => { setPlayingIdx(null); speechSynthRef.current = null; tryBackendTTS(msgIdx, cleanText); };
        window.speechSynthesis.speak(utterance);
        return;
      } catch {
        // Fall through to backend TTS
      }
    }
    await tryBackendTTS(msgIdx, cleanText);
  };

  const tryBackendTTS = async (msgIdx: number, cleanText: string) => {
    setTtsLoadingIdx(msgIdx);
    try {
      const result = await ttsMutation.mutateAsync({
        text: cleanText,
        voice: "nova",
        speed: 0.9,
        messageId: displayMessages[msgIdx]?.id,
      });
      setDisplayMessages(prev => {
        const updated = [...prev];
        if (updated[msgIdx]) {
          updated[msgIdx] = {
            ...updated[msgIdx],
            audioUrl: result.audioUrl,
            audioObjectKey: result.audioObjectKey,
            audioContentType: result.audioContentType,
          };
        }
        return updated;
      });
      playAudioUrl(result.audioUrl, msgIdx);
    } catch {
      toast.error("Speech synthesis unavailable.");
    } finally {
      setTtsLoadingIdx(null);
    }
  };

  const playAudioUrl = (url: string, msgIdx: number) => {
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingIdx(msgIdx);
    audio.onended = () => { setPlayingIdx(null); audioRef.current = null; };
    audio.onerror = () => { setPlayingIdx(null); audioRef.current = null; toast.error("Failed to play audio"); };
    audio.play().catch(() => { setPlayingIdx(null); audioRef.current = null; });
  };

  const stopAudio = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      speechSynthRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlayingIdx(null);
  };

  // ==================== Translate AI Message ====================
  const handleTranslate = async (msgIdx: number, text: string) => {
    if (displayMessages[msgIdx]?.translation) {
      setDisplayMessages(prev => {
        const updated = [...prev];
        if (updated[msgIdx]) updated[msgIdx] = { ...updated[msgIdx], translation: null };
        return updated;
      });
      return;
    }
    setTranslatingIdx(msgIdx);
    try {
      const cleanText = text
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/#{1,6}\s/g, "")
        .trim();
      const result = await translateMsg.mutateAsync({ text: cleanText, targetLanguage: "Chinese" });
      setDisplayMessages(prev => {
        const updated = [...prev];
        if (updated[msgIdx]) updated[msgIdx] = { ...updated[msgIdx], translation: result.translation };
        return updated;
      });
    } catch {
      toast.error("Translation failed. Please try again.");
    } finally {
      setTranslatingIdx(null);
    }
  };

  // ==================== Smart Reply Suggestions ====================
  const handleSuggestReply = async () => {
    if (showSuggestions && suggestions.length > 0) {
      setShowSuggestions(false);
      return;
    }
    try {
      const result = await suggestReplyMutation.mutateAsync({ conversationId });
      setSuggestions(result.suggestions);
      setShowSuggestions(true);
    } catch {
      toast.error("Failed to get suggestions. Please try again.");
    }
  };

  const handleUseSuggestion = (text: string) => {
    setInput(text);
    setShowSuggestions(false);
    setInputMode("text");
    textareaRef.current?.focus();
  };

  // ==================== Zh2En Modal: Voice Recording ====================
  const startZh2EnRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      zh2enMediaRecorderRef.current = mediaRecorder;
      zh2enChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) zh2enChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setZh2enState({ phase: "processing" });
        const blob = new Blob(zh2enChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];
          try {
            // Step 1: Upload audio
            const { audioUrl } = await uploadAudio.mutateAsync({ audioBase64: base64, mimeType: "audio/webm" });
            // Step 2: Transcribe as Chinese
            const { text: chineseText } = await transcribe.mutateAsync({ audioUrl, language: "zh" });
            if (!chineseText || chineseText.trim().length === 0) {
              toast.error("未能识别语音，请重试。");
              setZh2enState({ phase: "idle" });
              return;
            }
            // Step 3: Translate Chinese to English
            const result = await translateToEnglishMutation.mutateAsync({
              chineseText: chineseText.trim(),
              conversationId,
            });
            setZh2enState({
              phase: "result",
              chineseText: chineseText.trim(),
              english: result.english,
              alternatives: result.alternatives,
            });
          } catch {
            toast.error("处理失败，请重试。");
            setZh2enState({ phase: "idle" });
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.start();
      setZh2enState({ phase: "recording" });
    } catch {
      toast.error("麦克风权限被拒绝，请允许麦克风访问。");
    }
  };

  const stopZh2EnRecording = () => {
    if (zh2enMediaRecorderRef.current && zh2enMediaRecorderRef.current.state !== "inactive") {
      zh2enMediaRecorderRef.current.stop();
    }
  };

  const handleUseZh2EnResult = (text: string) => {
    setInput(text);
    setZh2enOpen(false);
    setInputMode("text");
    textareaRef.current?.focus();
  };

  // Play English result using Web Speech API
  const playEnglishResult = (text: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const englishVoice = voices.find(v =>
        v.lang.startsWith('en') && (v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Karen'))
      ) || voices.find(v => v.lang === 'en-US') || voices.find(v => v.lang.startsWith('en'));
      if (englishVoice) utterance.voice = englishVoice;
      utterance.lang = 'en-US';
      utterance.rate = 0.85;
      window.speechSynthesis.speak(utterance);
    }
  };

  // ==================== Text Send ====================
  const handleSendText = async () => {
    const text = input.trim();
    if (!text || sendMessage.isPending) return;
    setInput("");
    setShowSuggestions(false);

    const msgIndex = displayMessages.length;
    setDisplayMessages(prev => [...prev, { role: "user", content: text }]);
    scrollToBottom();

    sendMessage.mutateAsync({ conversationId, content: text }).then(result => {
      const messageId = result.userMessageId;
      analyzeMessage.mutate(
        { userMessage: text, conversationId, messageId },
        {
          onSuccess: (feedback) => {
            setDisplayMessages(prev => {
              const updated = [...prev];
              if (updated[msgIndex]) updated[msgIndex] = { ...updated[msgIndex], feedback: feedback as FeedbackData };
              return updated;
            });
          },
        }
      );
    }).catch(() => {});
  };

  // ==================== Voice Recording (English) ====================
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];
          try {
            const { audioUrl, audioObjectKey, audioContentType } = await uploadAudio.mutateAsync({
              audioBase64: base64,
              mimeType: "audio/webm",
            });
            const { text } = await transcribe.mutateAsync({ audioUrl, language: "en" });
            if (!text || text.trim().length === 0) {
              toast.error("Could not recognize speech. Please try again.");
              return;
            }
            const msgIndex = displayMessages.length;
            setDisplayMessages(prev => [...prev, {
              role: "user",
              content: text,
              audioUrl,
              audioObjectKey,
              audioContentType,
            }]);
            scrollToBottom();
            sendMessage.mutateAsync({
              conversationId,
              content: text,
              audioUrl,
              audioObjectKey,
              audioContentType,
            }).then(result => {
              const messageId = result.userMessageId;
              analyzeMessage.mutate({ userMessage: text, conversationId, messageId }, {
                onSuccess: (feedback) => {
                  setDisplayMessages(prev => {
                    const updated = [...prev];
                    if (updated[msgIndex]) updated[msgIndex] = { ...updated[msgIndex], feedback: feedback as FeedbackData };
                    return updated;
                  });
                },
              });
              assessPronunciation.mutate({ spokenText: text, conversationId, messageId }, {
                onSuccess: (pronunciation) => {
                  setDisplayMessages(prev => {
                    const updated = [...prev];
                    if (updated[msgIndex]) updated[msgIndex] = { ...updated[msgIndex], pronunciation: pronunciation as PronunciationData };
                    return updated;
                  });
                },
              });
            }).catch(() => {});
          } catch {
            toast.error("Failed to process audio");
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      toast.error("Microphone access denied. Please allow microphone access.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const isProcessing = sendMessage.isPending || uploadAudio.isPending || transcribe.isPending;

  if (loadingConv) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[600px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b mb-4 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => setLocation("~/app/chat")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-foreground truncate">
            {data?.conversation?.title || "Conversation"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {data?.conversation?.status === "active" ? "In progress" : "Completed"}
          </p>
        </div>
        {data?.conversation?.status === "active" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => completeConv.mutate({ id: conversationId })}
            disabled={completeConv.isPending}
          >
            {completeConv.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            End Session
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden" ref={scrollRef}>
        <ScrollArea className="h-full">
          <div className="space-y-4 pb-4">
            {displayMessages.map((msg, idx) => (
              <div key={idx}>
                <div className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && (
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className={cn(
                    "max-w-[80%] rounded-xl px-4 py-3",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}>
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ClickableText
                          text={msg.content}
                          onWordClick={(word) => setSelectedWord(word)}
                          className="text-sm leading-relaxed"
                        />
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}

                    {/* Translation display (below message content) */}
                    {msg.role === "assistant" && msg.translation && (
                      <div className="mt-2 pt-2 border-t border-border/30">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          <span className="text-primary font-medium mr-1">译：</span>
                          {msg.translation}
                        </p>
                      </div>
                    )}

                    {/* Action buttons for assistant messages: Listen | Translate | Suggest Reply */}
                    {msg.role === "assistant" && (
                      <div className="mt-2 pt-2 border-t border-border/30 flex items-center gap-1 flex-wrap">
                        {/* Listen button */}
                        <button
                          className={cn(
                            "inline-flex items-center gap-1.5 text-xs transition-colors rounded-md px-2 py-1",
                            playingIdx === idx
                              ? "text-primary bg-primary/10 font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                          )}
                          onClick={() => handlePlayTTS(idx, msg.content)}
                          disabled={ttsLoadingIdx === idx}
                        >
                          {ttsLoadingIdx === idx ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Loading...</span></>
                          ) : playingIdx === idx ? (
                            <><Pause className="h-3.5 w-3.5" /><span>Stop</span></>
                          ) : (
                            <><Volume2 className="h-3.5 w-3.5" /><span>Listen</span></>
                          )}
                        </button>

                        {/* Translate button */}
                        <button
                          className={cn(
                            "inline-flex items-center gap-1.5 text-xs transition-colors rounded-md px-2 py-1",
                            msg.translation
                              ? "text-primary bg-primary/10 font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                          )}
                          onClick={() => handleTranslate(idx, msg.content)}
                          disabled={translatingIdx === idx}
                        >
                          {translatingIdx === idx ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>翻译中...</span></>
                          ) : msg.translation ? (
                            <><Languages className="h-3.5 w-3.5" /><span>隐藏译文</span></>
                          ) : (
                            <><Languages className="h-3.5 w-3.5" /><span>翻译</span></>
                          )}
                        </button>

                        {/* Suggest Reply button (only on last assistant message) */}
                        {idx === displayMessages.length - 1 && msg.role === "assistant" && data?.conversation?.status === "active" && (
                          <button
                            className={cn(
                              "inline-flex items-center gap-1.5 text-xs transition-colors rounded-md px-2 py-1",
                              showSuggestions
                                ? "text-primary bg-primary/10 font-medium"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                            )}
                            onClick={handleSuggestReply}
                            disabled={suggestReplyMutation.isPending}
                          >
                            {suggestReplyMutation.isPending ? (
                              <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>思考中...</span></>
                            ) : (
                              <><MessageSquarePlus className="h-3.5 w-3.5" /><span>智能回复</span></>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-1">
                      <User className="h-4 w-4 text-secondary-foreground" />
                    </div>
                  )}
                </div>

                {/* Feedback Panel for user messages */}
                {msg.role === "user" && (msg.feedback || msg.pronunciation) && (
                  <div className="ml-0 mr-12 mt-2">
                    <button
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                      onClick={() => setExpandedFeedback(expandedFeedback === idx ? null : idx)}
                    >
                      <Lightbulb className="h-3 w-3" />
                      {expandedFeedback === idx ? "Hide feedback" : "View feedback"}
                      {msg.feedback && (
                        <Badge variant="secondary" className="text-xs ml-1">
                          Score: {msg.feedback.overallScore}
                        </Badge>
                      )}
                      {msg.pronunciation && (
                        <Badge variant="secondary" className="text-xs ml-1">
                          <Volume2 className="h-3 w-3 mr-0.5" />
                          {msg.pronunciation.overallScore}
                        </Badge>
                      )}
                    </button>

                    {expandedFeedback === idx && (
                      <Card className="mt-2 bg-muted/50">
                        <CardContent className="p-3 space-y-3">
                          {msg.pronunciation && (
                            <div>
                              <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
                                <Volume2 className="h-3.5 w-3.5" /> Pronunciation
                              </p>
                              <div className="grid grid-cols-3 gap-2 mb-2">
                                {(["accuracy", "fluency", "completeness"] as const).map(key => (
                                  <div key={key} className="text-center">
                                    <div className="text-lg font-bold text-primary">{msg.pronunciation![key]}</div>
                                    <div className="text-xs text-muted-foreground capitalize">{key}</div>
                                  </div>
                                ))}
                              </div>
                              {msg.pronunciation.suggestions.length > 0 && (
                                <div className="space-y-1">
                                  {msg.pronunciation.suggestions.map((s, i) => (
                                    <p key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                                      <span className="text-primary mt-0.5">-</span> {s}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {msg.feedback?.grammarCorrections && msg.feedback.grammarCorrections.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1">
                                <AlertCircle className="h-3.5 w-3.5 text-amber-500" /> Grammar
                              </p>
                              {msg.feedback.grammarCorrections.map((gc, i) => (
                                <div key={i} className="text-xs mb-1.5">
                                  <span className="line-through text-destructive">{gc.original}</span>
                                  {" → "}
                                  <span className="text-green-600 font-medium">{gc.corrected}</span>
                                  <p className="text-muted-foreground mt-0.5">{gc.explanation}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {msg.feedback?.expressionSuggestions && msg.feedback.expressionSuggestions.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1">
                                <Sparkles className="h-3.5 w-3.5 text-primary" /> Better Expressions
                              </p>
                              {msg.feedback.expressionSuggestions.map((es, i) => (
                                <div key={i} className="text-xs mb-1.5">
                                  <span className="text-muted-foreground">{es.original}</span>
                                  {" → "}
                                  <span className="text-primary font-medium">{es.better}</span>
                                  <p className="text-muted-foreground mt-0.5">{es.reason}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {msg.feedback?.encouragement && (
                            <div className="flex items-start gap-1.5 pt-1 border-t">
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                              <p className="text-xs text-muted-foreground">{msg.feedback.encouragement}</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {isProcessing && (
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div className="rounded-xl bg-muted px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Smart Reply Suggestions Panel */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="border-t pt-3 mt-1 shrink-0">
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-primary" />
            智能回复推荐 — 点击使用
          </p>
          <div className="space-y-1.5">
            {suggestions.map((s, i) => (
              <button
                key={i}
                className="w-full text-left rounded-lg border border-border/60 bg-muted/40 hover:bg-accent/60 hover:border-primary/40 transition-colors px-3 py-2 group"
                onClick={() => handleUseSuggestion(s.text)}
              >
                <p className="text-sm text-foreground group-hover:text-primary transition-colors">{s.text}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.hint}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      {data?.conversation?.status === "active" && (
        <div className="border-t pt-4 mt-2 shrink-0">
          {/* Mode toggle row */}
          <div className="flex items-center gap-1.5 mb-2">
            <button
              className={cn(
                "inline-flex items-center gap-1 text-xs rounded-full px-3 py-1 transition-colors border",
                inputMode === "voice"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              )}
              onClick={() => setInputMode(inputMode === "voice" ? "text" : "voice")}
              disabled={isProcessing}
            >
              <Mic className="h-3 w-3" />
              语音输入
            </button>
            <button
              className={cn(
                "inline-flex items-center gap-1 text-xs rounded-full px-3 py-1 transition-colors border",
                "text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              )}
              onClick={() => setZh2enOpen(true)}
              disabled={isProcessing}
            >
              <ArrowRightLeft className="h-3 w-3" />
              中译英
            </button>
          </div>

          {/* Voice recording mode (English) */}
          {inputMode === "voice" && (
            <div className="flex items-center gap-2">
              <Button
                variant={isRecording ? "destructive" : "default"}
                className="flex-1 h-10"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing}
              >
                {isRecording ? (
                  <><Square className="h-4 w-4 mr-2" />停止录音</>
                ) : (
                  <><Mic className="h-4 w-4 mr-2" />开始录音（英语）</>
                )}
              </Button>
              {isRecording && (
                <div className="flex items-center gap-1.5 text-sm text-destructive">
                  <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                  录音中...
                </div>
              )}
            </div>
          )}

          {/* Text input mode */}
          {inputMode === "text" && (
            <div className="flex items-end gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message in English..."
                className="flex-1 max-h-24 resize-none min-h-10"
                rows={1}
                disabled={isProcessing}
              />
              <Button
                size="icon"
                className="shrink-0 h-10 w-10"
                onClick={handleSendText}
                disabled={!input.trim() || isProcessing}
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ==================== Zh2En Voice Modal ==================== */}
      <Dialog open={zh2enOpen} onOpenChange={setZh2enOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle className="text-lg font-bold">
              {zh2enState.phase === "result"
                ? "如符合你的意图 可跟读英文"
                : "说中文，AI 帮你翻译成英文"}
            </DialogTitle>
            <button
              className="rounded-full h-8 w-8 flex items-center justify-center bg-muted hover:bg-accent transition-colors"
              onClick={() => setZh2enOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </DialogHeader>

          <div className="flex flex-col items-center gap-6 py-4 min-h-[280px]">
            {/* Result phase */}
            {zh2enState.phase === "result" && (
              <>
                {/* English result */}
                <div className="w-full text-center">
                  <p className="text-2xl font-medium text-foreground leading-relaxed">
                    {zh2enState.english}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    className="rounded-full px-5 gap-2"
                    onClick={() => setZh2enState({ phase: "idle" })}
                  >
                    <X className="h-4 w-4" />
                    重录中文
                  </Button>
                  <Button
                    className="rounded-full px-5 gap-2 bg-teal-500 hover:bg-teal-600 text-white"
                    onClick={() => handleUseZh2EnResult(zh2enState.english)}
                  >
                    <Send className="h-4 w-4" />
                    发送英文
                  </Button>
                  <button
                    className="h-9 w-9 rounded-full flex items-center justify-center border border-border hover:bg-accent transition-colors"
                    onClick={() => zh2enState.phase === "result" && playEnglishResult(zh2enState.english)}
                    title="朗读英文"
                  >
                    <Volume2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Divider */}
                <div className="w-full border-t border-dashed border-border" />

                {/* Chinese original */}
                <div className="w-full text-center">
                  <p className="text-lg text-muted-foreground">
                    {zh2enState.chineseText}
                  </p>
                </div>

                {/* Alternative options */}
                {zh2enState.alternatives.length > 0 && (
                  <div className="w-full space-y-2">
                    <p className="text-xs text-muted-foreground text-center">备选表达</p>
                    {zh2enState.alternatives.map((alt, i) => (
                      <button
                        key={i}
                        className="w-full text-left rounded-lg border border-border/60 bg-muted/40 hover:bg-accent/60 transition-colors px-3 py-2"
                        onClick={() => handleUseZh2EnResult(alt)}
                      >
                        <p className="text-sm text-foreground">{alt}</p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Processing phase */}
            {zh2enState.phase === "processing" && (
              <div className="flex flex-col items-center gap-4 flex-1 justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">正在识别并翻译...</p>
              </div>
            )}

            {/* Idle / Recording phase */}
            {(zh2enState.phase === "idle" || zh2enState.phase === "recording") && (
              <>
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  {zh2enState.phase === "recording" ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                        <div className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
                        录音中，说中文...
                      </div>
                      <p className="text-xs text-muted-foreground">说完后点击停止</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center px-4">
                      点击麦克风，用中文说出你想表达的意思
                    </p>
                  )}
                </div>

                {/* Big microphone button */}
                <button
                  className={cn(
                    "h-16 w-16 rounded-full flex items-center justify-center transition-all shadow-lg",
                    zh2enState.phase === "recording"
                      ? "bg-destructive hover:bg-destructive/90 scale-110 ring-4 ring-destructive/30"
                      : "bg-teal-500 hover:bg-teal-600 hover:scale-105"
                  )}
                  onClick={zh2enState.phase === "recording" ? stopZh2EnRecording : startZh2EnRecording}
                >
                  {zh2enState.phase === "recording" ? (
                    <Square className="h-6 w-6 text-white" />
                  ) : (
                    <Mic className="h-7 w-7 text-white" />
                  )}
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Word Dictionary Panel */}
      <WordDictPanel
        word={selectedWord}
        onClose={() => setSelectedWord(null)}
      />
    </div>
  );
}
