import { useState } from "react";
import { Icon } from "./Icon";

const questionBatches = [
  ["课程适合多大孩子？", "零基础也能学吗？"],
  ["每天学多久比较合适？", "怎样制定学习计划？"],
];

interface WelcomePageProps {
  onStartChat: (question?: string) => void;
}

export function WelcomePage({ onStartChat }: WelcomePageProps) {
  const [batch, setBatch] = useState(0);

  return (
    <>
      <section className="welcome-card" aria-labelledby="welcome-title">
        <h1 id="welcome-title">Hi！我是你的专属顾问 Rimi</h1>
        <p className="welcome-description">懂教育，更懂你 — AI 顾问，解答的不只是问题，更是关心</p>
        <p className="welcome-prompt">你关心的问题，我都能为你解答～</p>

        <div className="suggestions">
          {questionBatches[batch].map((suggestion) => (
            <button
              className="suggestion"
              key={suggestion}
              onClick={() => onStartChat(suggestion)}
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
          换一批
        </button>
      </section>

      <button className="start-button" onClick={() => onStartChat()} type="button">
        开始对话 <Icon name="arrow" />
      </button>
    </>
  );
}
