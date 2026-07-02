import { useCallback, useEffect, useRef } from "react";

export type SignaturePadProps = {
  onChange?: (dataUrl: string | null) => void;
  className?: string;
  /** Assinatura já salva (restaura no canvas). */
  value?: string | null;
  disabled?: boolean;
};

export function SignaturePad({ onChange, className, value, disabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasStrokeRef = useRef(false);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const getPoint = useCallback((event: PointerEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }, []);

  const paintBackground = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }, []);

  const drawValue = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, dataUrl: string) =>
      new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(width / img.width, height / img.height, 1);
          const w = img.width * scale;
          const h = img.height * scale;
          const x = (width - w) / 2;
          const y = (height - h) / 2;
          paintBackground(ctx, width, height);
          ctx.drawImage(img, x, y, w, h);
          hasStrokeRef.current = true;
          resolve(true);
        };
        img.onerror = () => resolve(false);
        img.src = dataUrl;
      }),
    [paintBackground],
  );

  const setupCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#0f172a";

    const saved = valueRef.current;
    if (saved) {
      await drawValue(ctx, rect.width, rect.height, saved);
      return;
    }

    paintBackground(ctx, rect.width, rect.height);
    hasStrokeRef.current = false;
  }, [drawValue, paintBackground]);

  useEffect(() => {
    void setupCanvas();
    const onResize = () => void setupCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setupCanvas, value]);

  const emitSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokeRef.current) {
      onChange?.(null);
      return;
    }
    onChange?.(canvas.toDataURL("image/png"));
  }, [onChange]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    hasStrokeRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPoint(event.nativeEvent, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPoint(event.nativeEvent, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    emitSignature();
  };

  const clear = () => {
    if (disabled) return;
    valueRef.current = null;
    void setupCanvas().then(() => onChange?.(null));
  };

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        className={`h-44 w-full touch-none rounded-xl border border-[#e2e8f0] bg-white ${disabled ? "opacity-80" : ""}`}
        aria-label="Área de assinatura digital"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      {!disabled ? (
        <button
          type="button"
          onClick={clear}
          className="mt-3 inline-flex items-center justify-center rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm font-semibold text-[#64748b] transition-colors hover:border-[#006FEE]/40 hover:text-[#006FEE]"
        >
          Limpar assinatura
        </button>
      ) : null}
    </div>
  );
}
