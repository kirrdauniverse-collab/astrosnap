// AstroSnap – beállításszámító motor
// Célpont + égbolt + eszköz alapján ajánlott beállításokat generál.

import type {
  AstroSettings,
  EquipmentType,
  SkyConditions,
  TargetType,
} from "./types";

// Alapbeállítások célpontonként (sötét égbolt, phone_tripod alapfeltevés)
const BASE_SETTINGS: Record<TargetType, AstroSettings> = {
  milky_way: {
    iso: 3200,
    exposureSeconds: 25,
    aperture: "f/2.8 vagy nagyobb nyílás",
    whiteBalanceK: 4000,
    focusMode: "infinity",
    burstCount: 15,
    intervalSeconds: 2,
    rawRecommended: true,
    stabilization: false,
    timerSeconds: 5,
    notes:
      "500-as szabály: 500 ÷ fókusztávolság = max expozíció másodpercben. Ha lehetséges, használj RAW formátumot és utófeldolgozást.",
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
    timerSeconds: 0,
    notes:
      "Bolygókhoz sok rövid képet készíts (videós stackelés). Később a legélesebb 25%-ot stackeld.",
  },
  nebula: {
    iso: 1600,
    exposureSeconds: 30,
    aperture: "f/2.8 vagy távcső f/4-6",
    whiteBalanceK: 3800,
    focusMode: "manual",
    burstCount: 30,
    intervalSeconds: 3,
    rawRecommended: true,
    stabilization: false,
    timerSeconds: 5,
    notes:
      "A ködök halványak, sok kép és hosszú expozíció kell. Sötét égbolt elengedhetetlen. Távcsővel sokkal jobb eredmény.",
  },
  galaxy: {
    iso: 1600,
    exposureSeconds: 60,
    aperture: "távcső f/4-6",
    whiteBalanceK: 4200,
    focusMode: "manual",
    burstCount: 40,
    intervalSeconds: 3,
    rawRecommended: true,
    stabilization: false,
    timerSeconds: 5,
    notes:
      "Galaxisok távcsővel fotózhatók igazán. Ha csak telefonod van, az Andromedát próbáld hosszú expozícióval.",
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
    timerSeconds: 0,
    notes:
      "Folyamatos sorozat, 100+ kép. Később lighten vagy maximum stackelés csinálja a csíkokat.",
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

// Eszköz-specifikus korrekciók
function applyEquipmentAdjustments(
  base: AstroSettings,
  equipment: EquipmentType
): AstroSettings {
  const adjusted: AstroSettings = { ...base };

  switch (equipment) {
    case "phone_handheld":
      // Kézből csak rövid expozíció lehetséges
      if (adjusted.exposureSeconds > 1 / 30) {
        adjusted.exposureSeconds = 1 / 30;
      }
      adjusted.iso = Math.min(adjusted.iso * 1.5, 6400);
      adjusted.stabilization = true;
      adjusted.burstCount = Math.max(adjusted.burstCount, 20);
      adjusted.notes =
        (adjusted.notes ? adjusted.notes + " " : "") +
        "Kézből tartva az ISO-t megemeltük és a stabilizációt bekapcsoltuk. " +
        "Minél több képet készíts, a stackelés segít a zajon.";
      break;

    case "phone_tripod":
      // Maradnak az alapbeállítások, kis emlékeztető
      adjusted.notes =
        (adjusted.notes ? adjusted.notes + " " : "") +
        "Állványon hosszabb expozíció is biztonságos. Használj 2s önkioldót a rázkódás elkerülésére.";
      break;

    case "phone_telescope_afocal":
      // Afokális módnál a távcső nagyítása rontja a fényerőt
      adjusted.exposureSeconds = Math.max(adjusted.exposureSeconds, 1 / 30);
      adjusted.iso = Math.min(adjusted.iso * 1.5, 6400);
      adjusted.burstCount = Math.max(adjusted.burstCount, 30);
      adjusted.focusMode = "manual";
      adjusted.notes =
        "Afokális módban a telefont az okulár mögé kell illeszteni. " +
        "Kézi élesség szükséges. Sok képet készíts, a stackelés javítja az élességet.";
      break;

    case "phone_telescope_prime":
      // Primer fókusz - nagyon hosszú fókusz, halvány
      adjusted.exposureSeconds = Math.max(adjusted.exposureSeconds, 30);
      adjusted.iso = Math.min(adjusted.iso * 1.2, 6400);
      adjusted.burstCount = Math.max(adjusted.burstCount, 30);
      adjusted.focusMode = "manual";
      adjusted.notes =
        "Primer fókuszban a telefon közvetlenül a távcső fókuszpontjában van. " +
        "Nagyon precíz fókuszálás szükséges. Készíts sorozatot és stackelj.";
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
        "DSLR + távcső kombó. Használj guide-ot ha lehetséges, és készíts sötét/flat frame-eket a zaj redukcióhoz.";
      break;
  }

  return adjusted;
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
    // Kiváló sötét égbolt - hosszabb expozíció engedhető meg
    if (adjusted.exposureSeconds < 30) {
      adjusted.exposureSeconds = Math.min(adjusted.exposureSeconds * 1.3, 60);
    }
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

// Fő számító függvény
export function computeSettings(
  target: TargetType,
  equipment: EquipmentType,
  sky: SkyConditions
): AstroSettings {
  const base = { ...BASE_SETTINGS[target] };
  const withEquipment = applyEquipmentAdjustments(base, equipment);
  const finalSettings = applySkyAdjustments(withEquipment, sky);
  return finalSettings;
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
