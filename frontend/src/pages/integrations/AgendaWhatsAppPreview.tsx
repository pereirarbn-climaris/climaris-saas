import type { ReactNode } from "react";
import { substituteAgendaPreview } from "../../lib/agendaTemplateUtils";

type Props = {
  message: string;
  label?: string;
};

function formatMessage(text: string) {
  return text.split("\n").map((line, i) => {
    const formatted = line.replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
    return <span key={i} dangerouslySetInnerHTML={{ __html: formatted }} />;
  }).reduce((acc: ReactNode[], curr, i, arr) => {
    acc.push(curr);
    if (i < arr.length - 1) acc.push(<br key={`br-${i}`} />);
    return acc;
  }, []);
}

export function AgendaWhatsAppPreview({ message, label = "Prévia" }: Props) {
  const previewMessage = substituteAgendaPreview(message || "Digite o template para visualizar…");

  return (
    <div className="flex flex-col items-center scale-[0.92] origin-top">
      <div className="relative w-[148px] h-[268px] bg-slate-900 rounded-[20px] p-1 shadow-md">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-14 h-3 bg-slate-900 rounded-b-lg z-10" />
        <div className="w-full h-full bg-[#e5ddd5] rounded-[16px] overflow-hidden flex flex-col">
          <div className="bg-[#075e54] px-1.5 py-1 flex items-center gap-1.5 pt-4">
            <div className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center shrink-0">
              <span className="text-[7px] font-semibold text-slate-600">AC</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[9px] font-medium truncate leading-tight">Agenda</p>
              <p className="text-green-200 text-[7px] leading-tight">online</p>
            </div>
          </div>
          <div
            className="flex-1 p-1.5 overflow-y-auto min-h-0"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c5baaf' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          >
            <div className="max-w-[90%] ml-auto">
              <div className="bg-[#dcf8c6] rounded-md rounded-tr-none p-1.5 shadow-sm relative">
                <p className="text-[9px] text-slate-800 leading-tight whitespace-pre-wrap break-words">
                  {formatMessage(previewMessage)}
                </p>
                <div className="flex items-center justify-end gap-1 mt-1">
                  <span className="text-[8px] text-slate-500">14:32</span>
                  <svg className="w-3 h-2.5 text-[#53bdeb]" viewBox="0 0 16 11" fill="currentColor" aria-hidden>
                    <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.336-.136.47.47 0 0 0-.323.136l-.883.882a.479.479 0 0 0-.141.34.474.474 0 0 0 .141.34l3.56 3.364a.54.54 0 0 0 .373.152.535.535 0 0 0 .406-.188l7.194-8.866a.478.478 0 0 0 .098-.32.467.467 0 0 0-.16-.307l-.649-.637z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-1 text-[9px] text-slate-500 text-center">{label}</p>
    </div>
  );
}
