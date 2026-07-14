/**
 * AI Chat Window component — full conversational interface.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../../api/client.js';
import styles from './ChatWindow.module.css';

const QUICK_PROMPTS = [
  { label: '🧭 How do I get to Section 214?', msg: 'How do I get to Section 214 from the main entrance?' },
  { label: '♿ Wheelchair route to my seat', msg: 'I use a wheelchair. What is the accessible route to Section 214?' },
  { label: '🚽 Nearest toilet', msg: 'Where is the nearest accessible toilet to me?' },
  { label: '🚌 How do I get home?', msg: 'What transport options are available to get home after the match?' },
  { label: '🏥 Medical help nearby', msg: 'Where is the nearest medical room or first aid station?' },
  { label: '🍕 Food and water', msg: 'Where can I find food and water refill stations near the North Concourse?' },
  { label: '🙏 Prayer facilities', msg: 'Is there a prayer room or quiet space available at the venue?' },
  { label: '👧 Lost child assistance', msg: 'I have become separated from my child. Who should I contact?' },
];

function Message({ msg }) {
  const isUser = msg.role === 'user';
  const isLoading = msg.loading;

  return (
    <div
      className={`${styles.message} ${isUser ? styles.messageUser : styles.messageAI}`}
      role={isUser ? undefined : 'article'}
      aria-label={isUser ? undefined : 'AI response'}
    >
      {!isUser && (
        <div className={styles.aiAvatar} aria-hidden="true">AI</div>
      )}
      <div className={styles.bubble}>
        {isLoading ? (
          <div className={styles.typing} aria-label="AI is thinking">
            <span /><span /><span />
          </div>
        ) : (
          <>
            <p className={styles.text}>{msg.content}</p>
            {msg.response && (
              <div className={styles.metadata}>
                {msg.response.warnings?.length > 0 && (
                  <div className={styles.warnings} role="alert">
                    {msg.response.warnings.map((w, i) => (
                      <div key={i} className={styles.warning}>⚠ {w}</div>
                    ))}
                  </div>
                )}
                {msg.response.routeSummary && (
                  <div className={styles.routeSummary}>
                    🧭 <strong>Route:</strong> {msg.response.routeSummary}
                    {msg.response.estimatedMinutes > 0 && (
                      <span className={styles.routeMeta}>
                        · {msg.response.estimatedMinutes} min · {msg.response.distanceMeters}m
                      </span>
                    )}
                  </div>
                )}
                {msg.response.accessibilityNotes?.length > 0 && (
                  <div className={styles.a11yNotes}>
                    {msg.response.accessibilityNotes.map((n, i) => (
                      <div key={i} className={styles.a11yNote}>♿ {n}</div>
                    ))}
                  </div>
                )}
                {msg.response.requiresStaffAssistance && (
                  <div className={styles.staffAlert} role="note">
                    Please speak to a venue staff member for further assistance.
                  </div>
                )}
                <div className={styles.confidence}>
                  <span className={`tag`}>
                    {msg.response.confidence === 'high' ? '✓' : msg.response.confidence === 'medium' ? '~' : '?'} {msg.response.confidence} confidence
                  </span>
                  {msg.response.snapshotVersion && msg.response.snapshotVersion !== 'unknown' && (
                    <span className="tag">Data: {msg.response.dataFreshness || 'simulated'}</span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

let msgId = 0;

export default function ChatWindow({ language, preferences, onRouteRequest }) {
  const [messages, setMessages] = useState([
    {
      id: ++msgId,
      role: 'ai',
      content: 'Welcome to Unity Arena! 👋 I\'m your AI assistant. I can help you navigate the stadium, find facilities, plan your route, and answer any questions about your visit. How can I help you today?',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const loadingMsgId = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text) => {
    const userMsg = text.trim();
    if (!userMsg || isLoading) return;

    setInput('');
    setIsLoading(true);

    const userMsgEntry = { id: ++msgId, role: 'user', content: userMsg };
    const loadingEntry = { id: ++msgId, role: 'ai', content: '', loading: true };
    loadingMsgId.current = loadingEntry.id;

    setMessages((prev) => [...prev, userMsgEntry, loadingEntry]);

    try {
      const response = await api.fanChat({
        message: userMsg,
        language,
        preferences,
        conversationHistory: history.slice(-8),
      });

      const aiMsg = { id: ++msgId, role: 'ai', content: response.answer, response };
      setHistory((prev) => [
        ...prev,
        { role: 'user', content: userMsg },
        { role: 'model', content: response.answer },
      ]);

      setMessages((prev) =>
        prev.filter((m) => m.id !== loadingMsgId.current).concat(aiMsg)
      );
    } catch (err) {
      if (err.code === 'ABORTED') return;
      const errMsg = {
        id: ++msgId,
        role: 'ai',
        content: `I'm unable to process your request right now. ${err.message || 'Please try again or visit the Information Desk.'}`
      };
      setMessages((prev) =>
        prev.filter((m) => m.id !== loadingMsgId.current).concat(errMsg)
      );
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [language, preferences, history, isLoading]);

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const charCount = input.length;
  const maxChars = 2000;

  return (
    <div className={styles.chatWindow}>
      {/* Quick prompts */}
      <div className={styles.quickPrompts} aria-label="Quick questions">
        <div className={styles.quickPromptsLabel}>Quick questions:</div>
        <div className={styles.quickPromptsScroll}>
          {QUICK_PROMPTS.map((p, i) => (
            <button
              key={i}
              className={styles.quickPrompt}
              onClick={() => sendMessage(p.msg)}
              disabled={isLoading}
              aria-label={`Ask: ${p.msg}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div
        className={styles.messages}
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.map((msg) => (
          <Message key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} aria-hidden="true" />
      </div>

      {/* Input */}
      <form className={styles.inputArea} onSubmit={handleSubmit} noValidate>
        <div className={styles.inputWrapper}>
          <label htmlFor="chat-input" className="visually-hidden">
            Type your question
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Ask me anything about Unity Arena…"
            maxLength={maxChars}
            rows={2}
            disabled={isLoading}
            aria-label="Chat message input"
            aria-describedby="char-count"
          />
          <div className={styles.inputMeta}>
            <span
              id="char-count"
              className={styles.charCount}
              aria-live="off"
              style={{ color: charCount > 1800 ? 'var(--color-amber)' : undefined }}
            >
              {charCount}/{maxChars}
            </span>
            <span className={styles.hint}>Enter to send · Shift+Enter for new line</span>
          </div>
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isLoading || !input.trim()}
          aria-label="Send message"
        >
          {isLoading ? <span className="spinner spinner--sm" aria-hidden="true" /> : '↑'}
          <span>{isLoading ? 'Thinking…' : 'Send'}</span>
        </button>
      </form>
    </div>
  );
}
