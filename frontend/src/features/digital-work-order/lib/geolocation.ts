export type GeolocationCapture = {
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  captured_at: string;
};

export class GeolocationError extends Error {
  readonly code: "unsupported" | "denied" | "unavailable" | "timeout" | "unknown";

  constructor(code: GeolocationError["code"], message: string) {
    super(message);
    this.name = "GeolocationError";
    this.code = code;
  }
}

function mapGeolocationError(error: GeolocationPositionError): GeolocationError {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return new GeolocationError(
        "denied",
        "Permissão de localização negada. Autorize o GPS nas configurações do navegador para registrar evidências.",
      );
    case error.POSITION_UNAVAILABLE:
      return new GeolocationError("unavailable", "Não foi possível obter a localização. Tente novamente em área aberta.");
    case error.TIMEOUT:
      return new GeolocationError("timeout", "Tempo esgotado ao obter localização. Tente novamente.");
    default:
      return new GeolocationError("unknown", "Erro ao capturar geolocalização.");
  }
}

export function captureGeolocation(): Promise<GeolocationCapture> {
  if (!navigator.geolocation) {
    return Promise.reject(
      new GeolocationError("unsupported", "Geolocalização não suportada neste dispositivo ou navegador."),
    );
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_meters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          captured_at: new Date().toISOString(),
        });
      },
      (error) => reject(mapGeolocationError(error)),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}
