import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { IrisAvatar } from "../chat/IrisAvatar";
import { getIrisIntroMessage, IRIS_TAGLINE } from "../chat/irisCopy";
import { KnowledgeBaseQueryService } from "../../services/knowledgeBaseQueryService";
import styles from "./EquipmentKnowledgeChat.module.css";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  manualsUsed?: string[];
};

type Props = {
  equipmentId: string;
  brandName?: string | null;
  modelName?: string | null;
};

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function EquipmentKnowledgeChat({ equipmentId, brandName, modelName }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const contextLabel = [brandName, modelName].filter(Boolean).join(" · ");

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  useEffect(() => {
    if (bootstrapped) return;
    setBootstrapped(true);
    setMessages([
      {
        id: makeId(),
        role: "assistant",
        text: getIrisIntroMessage({ contextLabel: contextLabel || undefined }),
      },
    ]);
  }, [bootstrapped, contextLabel]);

  async function handleSend() {
    const question = draft.trim();
    if (!question || loading) return;

    setMessages((prev) => [...prev, { id: makeId(), role: "user", text: question }]);
    setDraft("");
    setLoading(true);

    try {
      const result = await KnowledgeBaseQueryService.ask(question, {
        equipmentId,
        brand: brandName ?? undefined,
        model: modelName ?? undefined,
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

  return (
    <div className={styles.chat}>
      <header className={styles.header}>
        <IrisAvatar size="sm" />
        <div className={styles.headerText}>
          <p className={styles.title}>Iris</p>
          <p className={styles.tagline}>{IRIS_TAGLINE}</p>
        </div>
        {contextLabel ? (
          <span className={styles.contextChip} title={`Contexto: ${contextLabel}`}>
            {contextLabel}
          </span>
        ) : null}
      </header>

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
              <p className={styles.typing}>Consultando manuais…</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className={styles.composer}>
        <textarea
          className={styles.input}
          rows={2}
          placeholder="Pergunte à Iris…"
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
      </div>
    </div>
  );
}
