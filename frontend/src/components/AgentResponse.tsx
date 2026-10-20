import { responseBlocks } from "@/lib/agent-response";

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={index} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>
      : part
  );
}

export function AgentResponse({ text }: { text: string }) {
  return <div className="space-y-3 break-words text-sm leading-7 text-slate-600">
    {responseBlocks(text).map((block, index) => block.type === "heading"
      ? <h5 key={index} className="pt-1 text-sm font-semibold text-slate-900">{inline(block.lines[0])}</h5>
      : block.type === "list"
        ? <ul key={index} className="list-disc space-y-2 pl-5 marker:text-blue-400">{block.lines.map((line, item) => <li key={item}>{inline(line)}</li>)}</ul>
        : <p key={index} className="whitespace-pre-line">{inline(block.lines.join("\n"))}</p>)}
  </div>;
}
