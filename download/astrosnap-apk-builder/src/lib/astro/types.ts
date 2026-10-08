// AstroSnap – közös típusok az asztrofotó alkalmazáshoz

// Célpont objektum típusok
export type TargetType =
  | "milky_way"
  | "moon"
  | "planets"
  | "nebula"
  | "galaxy"
  | "star_cluster"
  | "star_trails"
  | "aurora"
  | "constellation";

// Eszköz konfiguráció
export type EquipmentType =
  | "phone_handheld"
  | "phone_tripod"
  | "phone_telescope_afocal"
  | "phone_telescope_prime"
  | "dslr_tripod"
  | "dslr_telescope";

// Égbolt körülmények (Bortle skála 1-9)
export interface SkyConditions {
  bortle: number; // 1 (sötét) - 9 (városi)
  moonPhase: number; // 0-1, 0=újhold, 1=telihold
  seeing: "excellent" | "good" | "average" | "poor";
  cloudCover: number; // 0-100%
}

// Ajánlott beállítások egy adott célpont+égbolt+eszközhöz
export interface AstroSettings {
  iso: number;
  exposureSeconds: number; // egész vagy tört másodperc
  aperture: string; // pl. "f/2.8"
  whiteBalanceK: number; // Kelvin
  focusMode: "auto" | "manual" | "infinity";
  focusDistanceM?: number;
  burstCount: number; // hány képet ajánlunk készíteni
  intervalSeconds: number; // képek közötti szünet
  rawRecommended: boolean;
  stabilization: boolean;
  timerSeconds: number; // önkioldó / előzár-idő (késleltetés exponáló nyomása után)
  notes: string;
  // 500-szabályhoz:
  focalLengthMm: number; // effektív fókusztávolság mm-ben (FF ekvivalens)
  zoomFactor: number; // 1, 2, 3, 5, ... (telefon zoom szorzó)
  trackingEnabled: boolean; // van-e motoros követés (equatoriális állvány)
  maxExposureSeconds: number; // 500-szabály alapján max expozíció csillagmozgás nélkül
}

// Kalibrációs frame típusok
export type CalibrationType = "dark" | "flat" | "bias" | "light";

// Egy mentett kép a helyi tárolóban
export interface StoredImage {
  id: string;
  type: CalibrationType | "light_stack" | "result";
  target?: TargetType;
  blob: Blob;
  thumbnail: Blob;
  capturedAt: number;
  settings?: Partial<AstroSettings>;
  metadata?: {
    width: number;
    height: number;
    iso?: number;
    exposureSeconds?: number;
    bortle?: number;
    equipment?: EquipmentType;
    stackCount?: number;
    label?: string;
  };
}

// Képek egybeillesztési beállítások
export interface StackOptions {
  alignImages: boolean;
  rotateAlign: boolean;
  useDarkFrame: boolean;
  darkFrameId?: string;
  useFlatFrame: boolean;
  flatFrameId?: string;
  useBiasFrame: boolean;
  biasFrameId?: string;
  method: "average" | "median" | "sigma_clip";
  manualRotationDeg: number;
  manualOffsetX: number;
  manualOffsetY: number;
}

// Színkorrekciós beállítások
export interface ColorSettings {
  temperatureK: number; // -100 (hidegebb) - +100 (melegebb)
  tint: number; // -100 (zöld) - +100 (magenta)
  exposureEv: number; // -2 - +2 EV
  contrast: number; // -100 - +100
  highlights: number; // -100 - +100
  shadows: number; // -100 - +100
  saturation: number; // -100 - +100
  vibrance: number; // -100 - +100
  gamma: number; // 0.5 - 2.0
  blackPoint: number; // 0 - 100
  whitePoint: number; // 0 - 100
  autoLevels: boolean;
}

// Alapértelmezett színbeállítások
export const defaultColorSettings: ColorSettings = {
  temperatureK: 0,
  tint: 0,
  exposureEv: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  vibrance: 0,
  gamma: 1.0,
  blackPoint: 0,
  whitePoint: 100,
  autoLevels: false,
};

// Alapértelmezett stacking beállítások
export const defaultStackOptions: StackOptions = {
  alignImages: true,
  rotateAlign: false,
  useDarkFrame: false,
  useFlatFrame: false,
  useBiasFrame: false,
  method: "average",
  manualRotationDeg: 0,
  manualOffsetX: 0,
  manualOffsetY: 0,
};

// Célpont metaadatok (UI-hoz)
export interface TargetMeta {
  type: TargetType;
  label: string;
  emoji: string;
  description: string;
  tip: string;
}

// Eszköz metaadatok
export interface EquipmentMeta {
  type: EquipmentType;
  label: string;
  emoji: string;
  description: string;
}

export const TARGETS: TargetMeta[] = [
  {
    type: "milky_way",
    label: "Tejútrendszer",
    emoji: "🌌",
    description: "Széles látómező, hosszú expozíció, nagy ISO.",
    tip: "Használj 500-as szabályt: 500 ÷ fókusztávolság = max expozíció másodpercben. Távoli fényforrásoktól távol dolgozz.",
  },
  {
    type: "moon",
    label: "Hold",
    emoji: "🌙",
    description: "Nagyon fényes célpont, rövid expozíció, alacsony ISO.",
    tip: "Telihold: ISO 100, 1/500s. Félhold: ISO 200, 1/250s. Holdsarló: ISO 400, 1/125s.",
  },
  {
    type: "planets",
    label: "Bolygók",
    emoji: "🪐",
    description: "Kicsi, fényes – videó stackelés vagy sok rövid kép.",
    tip: "Legalább 60-100 képet készíts, a legjobb 25%-ot stackeld. Kézi élesség szükséges.",
  },
  {
    type: "nebula",
    label: "Köd",
    emoji: "☁️",
    description: "Halvány, kiterjedt – hosszú expozíció, sok kép stackelés.",
    tip: "ISO 1600, 30s, minimum 20 kép. Sötét égbolt alatt érdemes próbálkozni.",
  },
  {
    type: "galaxy",
    label: "Galaxis",
    emoji: "🌀",
    description: "Kicsi és halvány – hosszú expozíció, távcső nélkül nehéz.",
    tip: "Távolabbi galaxisokhoz távcső szükséges. ISO 1600, 60s per frame, 30+ kép.",
  },
  {
    type: "star_cluster",
    label: "Csillaghalmaz",
    emoji: "✨",
    description: "Fényes pontok, közepes expozíció.",
    tip: "ISO 800, 10-15s. Kisebb halmazokhoz távcső ajánlott.",
  },
  {
    type: "star_trails",
    label: "Csillagcsíkok",
    emoji: "💫",
    description: "Hosszú expozíció sorozat, földforgásból adódó csíkok.",
    tip: "100+ kép, mindegyik 30s, ISO 800. Később stackeld össze lighten mode-ban.",
  },
  {
    type: "aurora",
    label: "Sarki fény",
    emoji: "🌠",
    description: "Gyorsan változó, közepes expozíció.",
    tip: "ISO 1600-3200, 2-10s expozíció. Fehérmérleg daylight vagy auto.",
  },
  {
    type: "constellation",
    label: "Csillagkép",
    emoji: "⭐",
    description: "Széles látómező, rövidebb expozíció mint a Tejút.",
    tip: "ISO 1600, 8-15s. Használj 24-35mm-es fókusztávolságot.",
  },
];

export const EQUIPMENT: EquipmentMeta[] = [
  {
    type: "phone_handheld",
    label: "Telefon, kézből",
    emoji: "📱",
    description: "Csak telefonkamera, kézben tartva. Csak rövid expozíció lehetséges.",
  },
  {
    type: "phone_tripod",
    label: "Telefon állványon",
    emoji: "🛗",
    description: "Telefon kis állványon/tripodon. Hosszabb expozíció lehetséges.",
  },
  {
    type: "phone_telescope_afocal",
    label: "Telefon + távcső (afokál)",
    emoji: "🔭",
    description: "Telefon a távcső okulárjához tartva. Nagyítás, de kis látómező.",
  },
  {
    type: "phone_telescope_prime",
    label: "Telefon + távcső (primer fókusz)",
    emoji: "🔬",
    description: "Telefon közvetlenül a távcső fókuszpontjában. Nagy fókusz, halvány célpontok.",
  },
  {
    type: "dslr_tripod",
    label: "DSLR/Mirrorless állványon",
    emoji: "📷",
    description: "Profi fényképező állványon. Széles lehetőségek.",
  },
  {
    type: "dslr_telescope",
    label: "DSLR + távcső",
    emoji: "🌠",
    description: "Profi fényképező távcsővel. Mélyég objektumokhoz.",
  },
];

// Bortle skála címkék
export const BORTLE_LABELS: Record<number, string> = {
  1: "1 – Kiváló sötét égbolt",
  2: "2 – Valóban sötét",
  3: "3 – Vidéki égbolt",
  4: "4 – Vidéki/elővárosi átmenet",
  5: "5 – Elővárosi égbolt",
  6: "6 – Fényes elővárosi",
  7: "7 – Városi átmenet",
  8: "8 – Városi égbolt",
  9: "9 – Fényes belváros",
};

export const SEEING_LABELS = {
  excellent: "Kiváló (1.0\")",
  good: "Jó (1.5-2\")",
  average: "Átlagos (2-3\")",
  poor: "Gyenge (>3\")",
} as const;
