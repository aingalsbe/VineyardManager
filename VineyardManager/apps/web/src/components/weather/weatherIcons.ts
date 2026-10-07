import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Sun,
  Cloudy,
  type LucideIcon,
} from "lucide-react";

/** Map WMO / Open-Meteo weather codes to a lucide icon. */
export function weatherIconForCode(code: number): LucideIcon {
  if (code === 0 || code === 1) return Sun;
  if (code === 2) return Cloudy;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) {
    return CloudDrizzle;
  }
  if (
    code === 61 ||
    code === 63 ||
    code === 65 ||
    code === 66 ||
    code === 67 ||
    code === 80 ||
    code === 81 ||
    code === 82
  ) {
    return CloudRain;
  }
  if (
    code === 71 ||
    code === 73 ||
    code === 75 ||
    code === 77 ||
    code === 85 ||
    code === 86
  ) {
    return CloudSnow;
  }
  if (code === 95 || code === 96 || code === 99) return CloudLightning;
  return Cloud;
}
