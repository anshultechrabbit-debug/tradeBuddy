import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { askAssistant } from '../store/aiSlice';
import { Spinner } from './ui';

const PROMPTS = ['What should I buy today?', 'Should I add more banking stocks?', 'Explain RELIANCE'];

export function AiAssistant() {
  const dispatch = useAppDispatch();
  const { assistantAnswer, assistantLoading, assistantError } = useAppSelector((s) => s.ai);
  const [input, setInput] = useState('');

  function ask(question: string) {
    const q = question.trim();
    if (!q || assistantLoading) return;
    dispatch(askAssistant(q));
    setInput('');
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  return (
    <div className="buddy-card">
      <div className="buddy-head">
        <span className="buddy-avatar">
          <span className="buddy-avatar-bolt">⚡</span>
        </span>
        <div>
          <div className="buddy-name">Buddy</div>
          <div className="muted small">Your AI trading co-pilot — ask me anything about the market</div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="buddy-form">
        <input
          type="text"
          className="input buddy-input"
          placeholder="Ask Buddy about a stock, your portfolio, or the market…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={assistantLoading}
        />
        <button type="submit" className="btn btn-primary" disabled={assistantLoading || !input.trim()}>
          {assistantLoading ? '…' : 'Ask'}
        </button>
      </form>

      {!assistantAnswer && !assistantLoading ? (
        <div className="buddy-prompts">
          {PROMPTS.map((p) => (
            <button key={p} type="button" className="buddy-prompt-chip" onClick={() => ask(p)}>
              {p}
            </button>
          ))}
        </div>
      ) : null}

      {assistantLoading ? (
        <div className="buddy-thinking">
          <Spinner />
          <span className="muted small">Buddy is thinking…</span>
        </div>
      ) : null}

      {assistantError && !assistantLoading ? <div className="buddy-error">{assistantError}</div> : null}

      {assistantAnswer && !assistantLoading ? (
        <div className="buddy-answer">
          <span className="buddy-avatar buddy-avatar-sm">
            <span className="buddy-avatar-bolt">⚡</span>
          </span>
          <div className="buddy-bubble">{assistantAnswer}</div>
        </div>
      ) : null}
    </div>
  );
}
