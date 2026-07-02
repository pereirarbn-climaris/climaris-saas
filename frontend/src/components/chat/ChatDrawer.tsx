import { useCallback, useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { useKnowledgeChatContext } from "../../context/KnowledgeChatContext";
import { KnowledgeBaseQueryService } from "../../services/knowledgeBaseQueryService";
import { IrisAvatar } from "./IrisAvatar";
import { getIrisIntroMessage, IRIS_TAGLINE } from "./irisCopy";
import styles from "./ChatDrawer.module.css";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  manualsUsed?: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
};

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatDrawer({ open, onClose }: Props) {
  const { equipmentId, brand, model, label, source } = useKnowledgeChatContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const contextLabel = [brand, model].filter(Boolean).join(" · ");
  const equipmentLabel = label?.trim() || null;

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (!open) return;
    scrollToBottom();
  }, [messages, loading, open, scrollToBottom]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setBootstrapped(false);
      return;
    }
    if (bootstrapped) return;
    setBootstrapped(true);
    setMessages([
      {
        id: makeId(),
        role: "assistant",
        text: getIrisIntroMessage({ contextLabel: contextLabel || undefined, source }),
      },
    ]);
  }, [open, bootstrapped, contextLabel, source]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSend() {
    const question = draft.trim();
    if (!question || loading) return;

    setMessages((prev) => [...prev, { id: makeId(), role: "user", text: question }]);
    setDraft("");
    setLoading(true);

    try {
      const result = await KnowledgeBaseQueryService.ask(question, {
        equipmentId,
        brand,
        model,
        label: equipmentLabel,
      });
      const manualsUsed = result.manuals_used?.map((m) => m.title).filter(Boolean) ?? [];
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          text: result.answer,
          manualsUsed: manualsUsed.length > 0 ? manualsUsed : undefined,
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          text: e instanceof Error ? e.message : "Erro ao consultar os manuais.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  if (!open) return null;

  return (
    <div className={styles.root} role="presentation">
      <button type="button" className={styles.backdrop} aria-label="Fechar Iris" onClick={onClose} />
      <section className={styles.drawer} role="dialog" aria-modal="true" aria-label="Iris">
        <header className={styles.header}>
          <div className={styles.headerBrand}>
            <IrisAvatar size="md" />
            <div className={styles.headerText}>
              <h2 className={styles.title}>Iris</h2>
              <p className={styles.tagline}>{IRIS_TAGLINE}</p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
            <X size={20} aria-hidden />
          </button>
        </header>

        {(equipmentLabel || contextLabel) && (
          <div className={styles.contextBar}>
            {equipmentLabel ? <span className={styles.contextEquipment}>{equipmentLabel}</span> : null}
            {contextLabel ? (
              <span className={styles.contextMeta}>
                {equipmentLabel ? " · " : ""}
                {contextLabel}
              </span>
            ) : null}
          </div>
        )}

        <div ref={listRef} className={styles.messages} aria-live="polite">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`${styles.messageRow} ${msg.role === "user" ? styles.messageRowUser : styles.messageRowAssistant}`}
            >
              {msg.role === "assistant" ? <IrisAvatar size="xs" className={styles.messageAvatar} /> : null}
              <div className={`${styles.bubble} ${msg.role === "user" ? styles.bubbleUser : styles.bubbleAssistant}`}>
                <p className={styles.bubbleText}>{msg.text}</p>
                {msg.manualsUsed && msg.manualsUsed.length > 0 ? (
                  <p className={styles.sources}>Manuais: {msg.manualsUsed.join(", ")}</p>
                ) : null}
              </div>
            </div>
          ))}
          {loading ? (
            <div className={`${styles.messageRow} ${styles.messageRowAssistant}`}>
              <IrisAvatar size="xs" className={styles.messageAvatar} />
              <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
                <p className={styles.typing}>
                  <span className={styles.typingDots} aria-hidden>
                    <span />
                    <span />
                    <span />
                  </span>
                  Consultando manuais…
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <footer className={styles.composer}>
          <textarea
            ref={inputRef}
            className={styles.input}
            rows={2}
            placeholder="Pergunte à Iris sobre manuais e procedimentos…"
            value={draft}
            disabled={loading}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Pergunta para a Iris"
          />
          <button
            type="button"
            className={styles.sendBtn}
            disabled={loading || !draft.trim()}
            onClick={() => void handleSend()}
            aria-label="Enviar pergunta"
          >
            <Send size={18} aria-hidden />
          </button>
        </footer>
      </section>
    </div>
  );
}
