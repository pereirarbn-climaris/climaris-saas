import { useState } from "react";
import { ChatDrawer } from "./ChatDrawer";
import { FloatingChatButton } from "./FloatingChatButton";

export function FloatingActionChat() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <FloatingChatButton onClick={() => setOpen(true)} ariaExpanded={open} />
      <ChatDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
