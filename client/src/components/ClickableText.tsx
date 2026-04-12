/**
 * ClickableText
 * 将英文文本中的每个单词渲染为可点击的 span。
 * 点击单词时调用 onWordClick(word)，其余标点/空格保持原样。
 */

import React from "react";

interface ClickableTextProps {
  text: string;
  onWordClick: (word: string) => void;
  className?: string;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "he",
  "her",
  "his",
  "i",
  "in",
  "is",
  "it",
  "my",
  "of",
  "on",
  "or",
  "our",
  "she",
  "so",
  "that",
  "the",
  "their",
  "they",
  "this",
  "to",
  "we",
  "with",
  "you",
  "your",
]);

function isLookupCandidate(word: string) {
  return word.length >= 2 && !STOP_WORDS.has(word.toLowerCase());
}

// 将文本拆分为「单词」和「非单词」交替的 token 数组
function tokenize(text: string): Array<{ type: "word" | "other"; value: string }> {
  // 匹配连续英文字母（含撇号缩写，如 don't / I'm）
  const regex = /([A-Za-z][A-Za-z']*)/g;
  const tokens: Array<{ type: "word" | "other"; value: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // 单词前的非单词部分
    if (match.index > lastIndex) {
      tokens.push({ type: "other", value: text.slice(lastIndex, match.index) });
    }
    tokens.push({ type: "word", value: match[0] });
    lastIndex = match.index + match[0].length;
  }

  // 末尾剩余部分
  if (lastIndex < text.length) {
    tokens.push({ type: "other", value: text.slice(lastIndex) });
  }

  return tokens;
}

export default function ClickableText({ text, onWordClick, className }: ClickableTextProps) {
  const tokens = tokenize(text);

  return (
    <span className={className}>
      {tokens.map((token, idx) =>
        token.type === "word" ? (
          <span
            key={idx}
            onClick={(e) => {
              e.stopPropagation();
              // 去掉末尾撇号（如 friends' → friends）
              const clean = token.value.replace(/'+$/, "");
              if (isLookupCandidate(clean)) onWordClick(clean);
            }}
            className="cursor-pointer hover:text-primary hover:underline decoration-dotted underline-offset-2 transition-colors rounded"
            title="点击查看释义"
          >
            {token.value}
          </span>
        ) : (
          <span key={idx}>{token.value}</span>
        )
      )}
    </span>
  );
}
