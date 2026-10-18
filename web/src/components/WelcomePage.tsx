import { useState } from "react";
import { Icon } from "./Icon";

const questionBatches = [
  ["孩子总是不愿意收拾玩具怎么办？", "孩子发脾气时，我应该怎么回应？"],
  ["孩子晚上总是不肯睡觉，怎么调整？", "孩子挑食，只吃喜欢的东西怎么办？"],
  ["孩子不愿意和小朋友分享，正常吗？", "怎么让孩子更愿意自己尝试？"],
];

interface WelcomePageProps {
  disabled: boolean;
  onAsk: (question: string) => void;
}

export function WelcomePage({ disabled, onAsk }: WelcomePageProps) {
  const [batch, setBatch] = useState(0);

  return (
    <section className="welcome-card" aria-labelledby="welcome-title">
      <p className="welcome-eyebrow">陪你一起慢慢来</p>
      <h1 id="welcome-title">你好，我是育儿顾问 Rimi</h1>
      <p className="welcome-description">
        养育没有标准答案。聊聊孩子的成长，也聊聊你正在经历的小难题。
      </p>
      <p className="welcome-prompt">今天有什么想和我聊聊？</p>

      <div className="suggestions">
        {questionBatches[batch].map((suggestion) => (
          <button
            className="suggestion"
            disabled={disabled}
            key={suggestion}
            onClick={() => onAsk(suggestion)}
            type="button"
          >
            <span>{suggestion}</span>
            <span className="suggestion-arrow" aria-hidden="true">
              <Icon name="chevron" />
            </span>
          </button>
        ))}
      </div>

      <button
        className="refresh-button"
        onClick={() => setBatch((current) => (current + 1) % questionBatches.length)}
        type="button"
      >
        <Icon name="refresh" />
        换一组问题
      </button>
    </section>
  );
}
