package hu.astrosnap.camera2;

/**
 * CameraSettings – Adatosztály a kamera beállításokhoz.
 *
 * Ez tartalmazza az összes beállítást, amit a frontend-ről át lehet adni
 * a natív Camera2 API-nak.
 */
public class CameraSettings {
    /**
     * Expozíciós idő másodpercben (1.0 - 30.0).
     * A Camera2 API nanosecundumban várja, de ez a beállítás másodpercben van megadva.
     */
    public double exposureSeconds = 1.0;

    /**
     * ISO érték (50 - 6400).
     * Magasabb ISO = több zaj, de rövidebb expozíció elegendő.
     */
    public int iso = 800;

    /**
     * Fehérmérleg Kelvin-ben (2500 - 9000).
     * 0 = auto fehérmérleg
     * 4000K = meleg (Tejúthoz ajánlott)
     * 5500K = semleges napfény (Holdhoz, bolygókhoz)
     */
    public int whiteBalanceK = 0;

    /**
     * Fókusz mód:
     *  - "auto" - automatikus fókusz
     *  - "manual" - kézi fókusz (focusDistance alapján)
     *  - "infinity" - végtelenre állított fókusz (csillagokhoz ajánlott)
     */
    public String focusMode = "infinity";

    /**
     * Fókusz távolság dioptriában (0.0 = végtelen, magasabb érték = közelebbi fókusz).
     * Csak "manual" focusMode esetén használatos.
     */
    public float focusDistance = 0.0f;

    /**
     * Zoom szorzó (1.0 - 8.0).
     * 1.0 = nincs zoom
     * 2.0 = 2x zoom
     * 8.0 = maximális zoom
     */
    public float zoom = 1.0f;

    /**
     * RAW (DNG) formátum mentése.
     * true = DNG fájl (nagy, 10-30 MB, de maximális minőség)
     * false = JPEG (kisebb, 1-5 MB, de komprimált)
     */
    public boolean rawFormat = false;

    /**
     * Kimeneti könyvtár (a ExternalStorageDirectory alatt).
     * Például: "AstroSnap/light" vagy "AstroSnap/dark"
     */
    public String outputDir = "AstroSnap/light";

    /**
     * Fájlnév (opcionális).
     * Ha null, automatikus timestamp alapú név generálódik.
     */
    public String fileName = null;

    /**
     * Képkocka típusa:
     *  - "light" - normál asztrofotó (a tényleges célpont)
     *  - "dark" - sötét frame (lencse lefedve, zaj méréséhez)
     *  - "flat" - flat frame (egyenletes megvilágítás, vignettálás korrigálásához)
     *  - "bias" - bias frame (legrövidebb expozíció, offset méréséhez)
     */
    public String frameType = "light";

    /**
     * Burst sorozat esetén a képkockák száma (5 - 100).
     */
    public int frameCount = 1;

    /**
     * Burst sorozat esetén a képkockák közötti idő másodpercben (0.1 - 5.0).
     */
    public double intervalSeconds = 1.0;

    /**
     * Vákuum (torch) bekapcsolása.
     */
    public boolean torch = false;

    /**
     * Stabilizáció bekapcsolása (kézből fotózáshoz ajánlott).
     * Asztrofotózáshoz (állványon) általában kikapcsoljuk.
     */
    public boolean stabilization = false;
}
