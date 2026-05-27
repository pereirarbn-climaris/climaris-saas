import { useEffect, useState } from "react";
import QRCode from "qrcode";
import "../v0-ui/clients/PublicEquipmentProfileView.embedded.css";

type Props = {
  providerName: string;
  logoUrl?: string | null;
  publicUrl: string;
  tag: string;
  brand: string;
  model: string;
};

export function EquipmentThermalLabelPrint({ providerName, logoUrl, publicUrl, tag, brand, model }: Props) {
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const brandModel = [brand, model].filter((v) => v && v !== "—").join(" · ");

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(publicUrl, {
      width: 180,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (!cancelled) setQrSrc(url);
      })
      .catch(() => {
        if (!cancelled) setQrSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [publicUrl]);

  return (
    <div className="thermalPrintRoot" aria-hidden>
      <div className="thermalPrintSheet">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="thermalPrintLogo" />
        ) : (
          <div className="thermalPrintLogoFallback">{providerName.charAt(0)}</div>
        )}
        {qrSrc ? (
          <div className="thermalPrintQrWrap">
            <img src={qrSrc} alt="" className="thermalPrintQr" />
          </div>
        ) : null}
        <p className="thermalPrintTag">{tag || "Equipamento"}</p>
        {brandModel ? <p className="thermalPrintBrandModel">{brandModel}</p> : null}
      </div>
    </div>
  );
}
