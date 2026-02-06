import type { TranscriptMessage } from "@ai-tutor/shared";

interface Props {
  message: TranscriptMessage;
}

export function TranscriptBubble({ message }: Props) {
  return (
    <div className={`bubble ${message.role}`}>
      {message.text}
    </div>
  );
}
