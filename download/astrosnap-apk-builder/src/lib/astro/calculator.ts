// AstroSnap – beállításszámító motor
// Célpont + égbolt + eszköz alapján ajánlott beállításokat generál.
// Figyelembe veszi a 500-szabályt (csillagmozgás) és az előzár-időt is.

import type {
  AstroSettings,
  EquipmentType,
  SkyConditions,
  TargetType,
} from "./types";

// Alapbeállítások célpontonként (sötét égbolt, phone_tripod, 1x zoom alapfeltevés)
// focalLengthMm és zoomFactor, trackingEnabled az applyEquipmentAdjustments-ben lesz beállítva
const BASE_SETTINGS: Record<
  TargetType,
  Omit<AstroSettings, "focalLengthMm" | "zoomFactor" | "trackingEnabled" | "maxExposureSeconds">
> = {
  milky_way: {
    iso: 3200,
    exposureSeconds: 20, // 500-szabály 24mm-nél: 20.8s, kicsit alatta
    aperture: "f/2.8 vagy nagyobb nyílás",
    whiteBalanceK: 4000,
    focusMode: "infinity",
    burstCount: 20,
    intervalSeconds: 2,
    rawRecommended: true,
    stabilization: false,
    timerSeconds: 5, // előzár-idő a rezgés elkerülésére
    notes:
      "500-as szabály: 500 ÷ fókusztávolság = max expozíció másodpercben (csillagmozgás nélkül). " +
      "Ha lehetséges, használj RAW formátumot és utófeldolgozást. Fix állványon a csillagok elmozdulnak, " +
      "ezért a stackelés előtt az auto-align funkciót hagyd bekapcsolva.",
  },
  moon: {
    iso: 100,
    exposureSeconds: 1 / 500,
    aperture: "f/8 (ha állítható)",
    whiteBalanceK: 5500,
    focusMode: "manual",
    burstCount: 10,
    intervalSeconds: 1,
    rawRecommended: true,
    stabilization: false,
    timerSeconds: 2,
    notes:
      "A Hold nagyon fényes! Rövid expozíció szükséges. Ha túl fényes, ISO 64-re vagy 1/1000s-re csökkentsd.",
  },
  planets: {
    iso: 100,
    exposureSeconds: 1 / 100,
    aperture: "f/10 vagy teleobjektív",
    whiteBalanceK: 5500,
    focusMode: "manual",
    burstCount: 100,
    intervalSeconds: 0.2,
    rawRecommended: false,
    stabilization: false,
    timerSeconds: 2,
    notes:
      "Bolygókhoz sok rövid képet készíts (videós stackelés). Később a legélesebb 25%-ot stackeld.",
  },
  nebula: {
    iso: 1600,
    exposureSeconds: 20,
    aperture: "f/2.8 vagy távcső f/4-6",
    whiteBalanceK: 3800,
    focusMode: "manual",
    burstCount: 30,
    intervalSeconds: 3,
    rawRecommended: true,
    stabilization: false,
    timerSeconds: 5,
    notes:
      "A ködök halványak, sok kép és hosszú expozíció kell. Sötét égbolt elengedhetetlen. " +
      "Távcsővel sokkal jobb eredmény, de ott már tracking szükséges a 20s feletti expozíciókhoz.",
  },
  galaxy: {
    iso: 1600,
    exposureSeconds: 20,
    aperture: "távcső f/4-6",
    whiteBalanceK: 4200,
    focusMode: "manual",
    burstCount: 40,
    intervalSeconds: 3,
    rawRecommended: true,
    stabilization: false,
    timerSeconds: 5,
    notes:
      "Galaxisok távcsővel fotózhatók igazán. Tracking nélkül az expozíciót a 500-szabály korlátozza, " +
      "ezért sok rövid képet stackelj. Motoros követéssel lehet 60s+ expozíciót használni.",
  },
  star_cluster: {
    iso: 800,
    exposureSeconds: 15,
    aperture: "f/2.8 vagy távcső",
    whiteBalanceK: 4500,
    focusMode: "infinity",
    burstCount: 20,
    intervalSeconds: 2,
    rawRecommended: true,
    stabilization: false,
    timerSeconds: 5,
    notes:
      "Csillaghalmazok fényesebbek, könnyebb fotózni. Közepes ISO és közepes expozíció.",
  },
  star_trails: {
    iso: 800,
    exposureSeconds: 30,
    aperture: "f/4-5.6",
    whiteBalanceK: 4500,
    focusMode: "infinity",
    burstCount: 150,
    intervalSeconds: 1,
    rawRecommended: false,
    stabilization: false,
    timerSeconds: 0, // csillagcsíkoknál nem zavar a rezgés
    notes:
      "Folyamatos sorozat, 100+ kép. Itt szándékosan hosszú expozíciót használunk, hogy a csillagok " +
      "elmozduljanak és csíkokat hozzanak létre. Később lighten vagy maximum stackelés csinálja a csíkokat.",
  },
  aurora: {
    iso: 2400,
    exposureSeconds: 5,
    aperture: "f/2.8 vagy nagyobb nyílás",
    whiteBalanceK: 4500,
    focusMode: "infinity",
    burstCount: 25,
    intervalSeconds: 1,
    rawRecommended: true,
    stabilization: false,
    timerSeconds: 2,
    notes:
      "Sarki fény gyorsan változik. Rövidebb expozíció, de több kép. Auto WB vagy daylight használható.",
  },
  constellation: {
    iso: 1600,
    exposureSeconds: 12,
    aperture: "f/2.8-4",
    whiteBalanceK: 4200,
    focusMode: "infinity",
    burstCount: 15,
    intervalSeconds: 2,
    rawRecommended: true,
    stabilization: false,
    timerSeconds: 5,
    notes:
      "Csillagképekhez 24-35mm-es látómező jó. 500-szabály: max 15-20s expozíció 24mm-nél.",
  },
};

// Eszköz alapértelmezett fókusztávolságok (FF ekvivalens mm)
const EQUIPMENT_FOCAL_LENGTH: Record<EquipmentType, number> = {
  phone_handheld: 24, // telefon fő kamera, széles látószög
  phone_tripod: 24,
  phone_telescope_afocal: 1000, // távcső nagyítása miatt
  phone_telescope_prime: 1000,
  dslr_tripod: 50, // alap objektív
  dslr_telescope: 1000,
};

// Eszköz alapértelmezett követés (tracking)
const EQUIPMENT_TRACKING: Record<EquipmentType, boolean> = {
  phone_handheld: false,
  phone_tripod: false,
  phone_telescope_afocal: false,
  phone_telescope_prime: false,
  dslr_tripod: false,
  dslr_telescope: false, // lehet true ha star tracker van, de alapból false
};

// Eszköz-specifikus korrekciók
function applyEquipmentAdjustments(
  base: Omit<
    AstroSettings,
    "focalLengthMm" | "zoomFactor" | "trackingEnabled" | "maxExposureSeconds"
  >,
  equipment: EquipmentType
): AstroSettings {
  const adjusted: AstroSettings = {
    ...base,
    focalLengthMm: EQUIPMENT_FOCAL_LENGTH[equipment],
    zoomFactor: 1,
    trackingEnabled: EQUIPMENT_TRACKING[equipment],
    maxExposureSeconds: 0, // később kiszámoljuk
  };

  // maxExposure = 500 / effektív fókusztávolság
  adjusted.maxExposureSeconds = computeMaxExposure(adjusted);

  switch (equipment) {
    case "phone_handheld":
      // Kézből csak rövid expozíció lehetséges
      if (adjusted.exposureSeconds > 1 / 30) {
        adjusted.exposureSeconds = 1 / 30;
      }
      adjusted.iso = Math.min(adjusted.iso * 1.5, 6400);
      adjusted.stabilization = true;
      adjusted.burstCount = Math.max(adjusted.burstCount, 20);
      adjusted.timerSeconds = 2; // kézből rövidebb is elég
      adjusted.notes =
        (adjusted.notes ? adjusted.notes + " " : "") +
        "Kézből tartva az ISO-t megemeltük és a stabilizációt bekapcsoltuk. " +
        "Minél több képet készíts, a stackelés segít a zajon.";
      break;

    case "phone_tripod":
      // Maradnak az alapbeállítások, de 500-szabály alkalmazása
      adjusted.notes =
        (adjusted.notes ? adjusted.notes + " " : "") +
        "Fix állványon a telefon rezgését a 2-5s előzár-idő (önkioldó) csillapítja. " +
        "Használd az időzítőt, ne nyomd meg közvetlenül az exponálót!";
      break;

    case "phone_telescope_afocal":
      // Afokális módnál a távcső nagyítása rontja a fényerőt
      adjusted.exposureSeconds = Math.max(adjusted.exposureSeconds, 1 / 30);
      adjusted.iso = Math.min(adjusted.iso * 1.5, 6400);
      adjusted.burstCount = Math.max(adjusted.burstCount, 30);
      adjusted.focusMode = "manual";
      adjusted.notes =
        "Afokális módban a telefont az okulár mögé kell illeszteni. " +
        "Kézi élesség szükséges. Nagyon hosszú fókusz → nagyon rövid max expozíció (500-szabály), " +
        "készíts sok képet és stackelj.";
      break;

    case "phone_telescope_prime":
      // Primer fókusz - nagyon hosszú fókusz, halvány
      adjusted.exposureSeconds = Math.max(adjusted.exposureSeconds, 5);
      adjusted.iso = Math.min(adjusted.iso * 1.2, 6400);
      adjusted.burstCount = Math.max(adjusted.burstCount, 30);
      adjusted.focusMode = "manual";
      adjusted.notes =
        "Primer fókuszban a telefon közvetlenül a távcső fókuszpontjában van. " +
        "Nagyon precíz fókuszálás szükséges. A 500-szabály nagyon rövid expozíciót ír elő - " +
        "tracking nélkül csak másodpercekig fotózható, de sok kép stackelésével kompenzálható.";
      break;

    case "dslr_tripod":
      // DSLR alapban jobb minőség
      adjusted.iso = Math.max(adjusted.iso * 0.7, 100);
      adjusted.rawRecommended = true;
      adjusted.notes =
        (adjusted.notes ? adjusted.notes + " " : "") +
        "DSLR-rel használj RAW formátumot és távirányítót/2s önkioldót a rezgés elkerülésére.";
      break;

    case "dslr_telescope":
      adjusted.iso = Math.max(adjusted.iso * 0.7, 100);
      adjusted.rawRecommended = true;
      adjusted.burstCount = Math.max(adjusted.burstCount, 30);
      adjusted.notes =
        "DSLR + távcső kombó. Ha van motoros követésed (star tracker), kapcsold be a " +
        "tracking opciót a beállításokban - így hosszabb expozíció is használható. " +
        "Készíts sötét/flat frame-eket a zaj redukcióhoz.";
      break;
  }

  return adjusted;
}

// 500-szabály: max expozíció csillagmozgás nélkül
// max_exposure = 500 / effektív_fókusztávolság_mm
// biztonsági faktor: 0.85 (kicsit konzervatívabb)
function computeMaxExposure(settings: AstroSettings): number {
  if (settings.trackingEnabled) return 600; // tracking-gel nincs limit (gyakorlatilag)
  const effectiveFocalLength = settings.focalLengthMm * settings.zoomFactor;
  const ruleMax = 500 / effectiveFocalLength;
  // 0.85 biztonsági faktor, hogy biztosan ne legyen látható elmozdulás
  return Math.max(0.1, ruleMax * 0.85);
}

// Égbolt körülmények alapján történő korrekció
function applySkyAdjustments(
  settings: AstroSettings,
  sky: SkyConditions
): AstroSettings {
  const adjusted: AstroSettings = { ...settings };

  // Bortle skála hatása: magasabb érték = több fényszennyezés = rövidebb expozíció
  if (sky.bortle >= 7) {
    // Városi égbolt - drasztikus csökkentés
    adjusted.exposureSeconds = Math.min(adjusted.exposureSeconds, 8);
    adjusted.iso = Math.min(adjusted.iso, 1600);
    adjusted.notes =
      (adjusted.notes ? adjusted.notes + " " : "") +
      "Erős fényszennyezés! Rövid expozíció és alacsony ISO javasolt. " +
      "A stackelés sokat segít a zajon, és utólag színkorrekcióval ellensúlyozható a narancssárga szín.";
  } else if (sky.bortle >= 5) {
    // Elővárosi
    adjusted.exposureSeconds = Math.min(adjusted.exposureSeconds, 15);
    adjusted.iso = Math.min(adjusted.iso, 2400);
    adjusted.notes =
      (adjusted.notes ? adjusted.notes + " " : "") +
      "Mérsékelt fényszennyezés. Rövidebb expozíció + stackelés javasolt.";
  } else if (sky.bortle <= 2) {
    // Kiváló sötét égbolt - hosszabb expozíció engedhető meg (de 500-szabály továbbra is érvényes)
    adjusted.notes =
      (adjusted.notes ? adjusted.notes + " " : "") +
      "Kiváló sötét égbolt! Hosszabb expozíció és alacsonyabb ISO is használható a jobb jel/zaj viszonyhoz.";
  }

  // Hold fázis hatása
  if (sky.moonPhase > 0.6 && adjusted.exposureSeconds > 0.5) {
    // Teli vagy majdnem teli hold - sok extra fény
    adjusted.exposureSeconds = adjusted.exposureSeconds * 0.7;
    adjusted.notes =
      (adjusted.notes ? adjusted.notes + " " : "") +
      "Telihold közelségében rövidebb expozíció elegendő a holdfény miatt. " +
      "Mélyég objektumokhoz várj újholdra.";
  } else if (sky.moonPhase < 0.15) {
    // Újhold - ideális mélyég fotózáshoz
    adjusted.notes =
      (adjusted.notes ? adjusted.notes + " " : "") +
      "Újhold - ideális mélyég objektumokhoz!";
  }

  // Felhőzettség hatása
  if (sky.cloudCover > 30) {
    adjusted.notes =
      (adjusted.notes ? adjusted.notes + " " : "") +
      "Felhős égbolt: az asztrofotózás nem ajánlott 30% feletti felhőzettség esetén.";
  }

  // Látás (seeing) - csak a bolygóknál releváns
  if (sky.seeing === "excellent") {
    adjusted.notes =
      (adjusted.notes ? adjusted.notes + " " : "") +
      "Kiváló látás - bolygók fotózásához ideális.";
  } else if (sky.seeing === "poor") {
    adjusted.notes =
      (adjusted.notes ? adjusted.notes + " " : "") +
      "Gyenge látás - bolygófotók élesek lesznek, érdemes halasztani.";
  }

  return adjusted;
}

// 500-szabály alkalmazása: ha az expozíció túllépi a max-ot és nincs tracking
function apply500Rule(settings: AstroSettings): AstroSettings {
  if (settings.trackingEnabled) return settings;

  const maxExp = computeMaxExposure(settings);
  if (settings.exposureSeconds > maxExp) {
    const originalExp = settings.exposureSeconds;
    // Kerekítsük lefelé 0.1s pontossággal
    settings.exposureSeconds = Math.floor(maxExp * 10) / 10;
    settings.notes =
      (settings.notes ? settings.notes + " " : "") +
      `⚠ 500-szabály: ${settings.focalLengthMm * settings.zoomFactor}mm fókusznál ` +
      `max ${maxExp.toFixed(1)}s expozíció ajánlott (csillagmozgás miatt). ` +
      `Eredeti ajánlás ${formatExp(originalExp)} volt, csökkentettük. ` +
      `Zoom növelésével ez az érték tovább csökken. ` +
      `Tracking (motoros követés) esetén ez a korlát nem érvényes.`;
  }
  return settings;
}

// Fő számító függvény
export function computeSettings(
  target: TargetType,
  equipment: EquipmentType,
  sky: SkyConditions
): AstroSettings {
  const base = { ...BASE_SETTINGS[target] };
  const withEquipment = applyEquipmentAdjustments(base, equipment);
  const withSky = applySkyAdjustments(withEquipment, sky);
  const finalSettings = apply500Rule(withSky);
  return finalSettings;
}

// Újraszámolja a maxExposure-t és alkalmazza a 500-szabályt,
// ha a felhasználó megváltoztatta a zoom-ot vagy a tracking-et
export function recalculateWithZoom(
  settings: AstroSettings,
  zoomFactor: number,
  trackingEnabled: boolean
): AstroSettings {
  const updated: AstroSettings = {
    ...settings,
    zoomFactor,
    trackingEnabled,
    focalLengthMm: settings.focalLengthMm, // marad az eredeti
  };
  updated.maxExposureSeconds = computeMaxExposure(updated);

  // Ha tracking be van kapcsolva: ne korlátozzuk
  if (trackingEnabled) {
    // nem módosítjuk az expozíciót
    return updated;
  }

  // Ha az expozíció túllépi az új max-ot, csökkentsük
  if (updated.exposureSeconds > updated.maxExposureSeconds) {
    updated.exposureSeconds = Math.floor(updated.maxExposureSeconds * 10) / 10;
  }
  return updated;
}

// Segédfüggvény: expozíció formázása
export function formatExposure(seconds: number): string {
  if (seconds < 1) {
    const denom = Math.round(1 / seconds);
    return `1/${denom} s`;
  }
  if (seconds < 10) {
    return `${seconds.toFixed(1)} s`;
  }
  return `${Math.round(seconds)} s`;
}

// Rövidített formázás a notes-hoz
function formatExp(seconds: number): string {
  return formatExposure(seconds);
}

// ISO kategória emberi olvasható formában
export function describeIso(iso: number): string {
  if (iso <= 200) return "Nagyon alacsony (fényes célpontokhoz)";
  if (iso <= 800) return "Alacsony";
  if (iso <= 1600) return "Közepes";
  if (iso <= 3200) return "Magas (halvány célpontokhoz)";
  return "Nagyon magas (extrém alacsony fényű célpontokhoz)";
}

// Fehérmérleg Kelvin-ből emberi szöveggé
export function describeWhiteBalance(k: number): string {
  if (k < 3500) return "Hideg (csillagok romló színei)";
  if (k < 4500) return "Enyhén meleg (Tejúthoz ajánlott)";
  if (k < 5500) return "Semleges napfény";
  if (k < 6500) return "Meleg napfény";
  return "Meleg (gyűjtő fényforrásokhoz)";
}

// Effektív fókusztávolság (zoom-al együtt)
export function effectiveFocalLength(settings: AstroSettings): number {
  return settings.focalLengthMm * settings.zoomFactor;
}
