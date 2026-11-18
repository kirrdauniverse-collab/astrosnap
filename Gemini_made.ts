import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Slider,
  Switch,
  Alert,
} from 'react-native';

// --- TÍPUSOK ÉS INTERFÉSZEK ---
type CaptureMode = 'AUTO' | 'MANUAL';
type TargetPreset = 'MILKY_WAY' | 'MOON' | 'PLANET' | 'DEEP_SKY';
type FrameType = 'LIGHT' | 'DARK' | 'FLAT' | 'BIAS';
type TabType = 'CAMERA' | 'STACKING' | 'POST_PROCESSING';

interface CameraSettings {
  iso: number;
  exposureTime: number; // másodpercben
  focus: number; // 0 (közel) - 1 (végtelen)
  whiteBalance: number; // Kelvin
}

interface StackingSession {
  lightFrames: string[];
  darkFrames: string[];
  flatFrames: string[];
  biasFrames: string[];
  alignAuto: boolean;
  manualRotation: number;
  manualOffsetX: number;
  manualOffsetY: number;
}

interface PostProcessingSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  noiseReduction: number;
  redGain: number;
  greenGain: number;
  blueGain: number;
}

export default function AstroPhotoApp() {
  const [activeTab, setActiveTab] = useState<TabType>('CAMERA');

  // --- KAMERA ÁLLAPOTOK ---
  const [captureMode, setCaptureMode] = useState<CaptureMode>('AUTO');
  const [preset, setPreset] = useState<TargetPreset>('MILKY_WAY');
  const [frameType, setFrameType] = useState<FrameType>('LIGHT');
  const [useTelescope, setUseTelescope] = useState<boolean>(false);
  const [settings, setSettings] = useState<CameraSettings>({
    iso: 800,
    exposureTime: 15,
    focus: 1.0,
    whiteBalance: 4500,
  });

  // --- STACKING ÉS UTÓFELDOLGOZÁS ÁLLAPOTOK ---
  const [stacking, setStacking] = useState<StackingSession>({
    lightFrames: [],
    darkFrames: [],
    flatFrames: [],
    biasFrames: [],
    alignAuto: true,
    manualRotation: 0,
    manualOffsetX: 0,
    manualOffsetY: 0,
  });

  const [postProc, setPostProc] = useState<PostProcessingSettings>({
    brightness: 0,
    contrast: 1,
    saturation: 1,
    noiseReduction: 50,
    redGain: 1,
    greenGain: 1,
    blueGain: 1,
  });

  // PRESET BEÁLLÍTÁSOK ALKALMAZÁSA
  const applyPreset = (target: TargetPreset) => {
    setPreset(target);
    if (captureMode === 'AUTO') {
      switch (target) {
        case 'MILKY_WAY':
          setSettings({ iso: 1600, exposureTime: 15, focus: 1.0, whiteBalance: 3800 });
          break;
        case 'MOON':
          setSettings({ iso: 100, exposureTime: 0.002, focus: 0.99, whiteBalance: 5200 });
          break;
        case 'PLANET':
          setSettings({ iso: 400, exposureTime: 0.02, focus: 0.99, whiteBalance: 5000 });
          break;
        case 'DEEP_SKY':
          setSettings({ iso: 3200, exposureTime: 30, focus: 1.0, whiteBalance: 4000 });
          break;
      }
    }
  };

  // MŰVELETI FUNKCIÓK
  const handleCapture = () => {
    Alert.alert('Expozíció', `${frameType} kép rögzítése (${settings.exposureTime}s, ISO ${settings.iso})...`);
    // Itt hívható meg a natív Android Camera2 API RAW (DNG) mentése
  };

  const handleRunStacking = () => {
    Alert.alert(
      'Stacking indítása',
      `Képek összefűzése elindult.\nZajcsökkentés Dark/Flat képek alapján...\nIllesztés: ${
        stacking.alignAuto ? 'Automagikus csillagillesztés' : 'Manuális korrekció'
      }`
    );
    // Itt fut le a stacking algoritmus (pl. OpenCV / WebAssembly / Native C++ backend)
  };

  const handleSaveProject = () => {
    Alert.alert('Mentés', 'Projekt és színbeállítások sikeresen elmentve!');
  };

  const handleLoadProject = () => {
    Alert.alert('Betöltés', 'Előző munkamenet és beállítások betöltve!');
  };

  return (
    <View style={styles.container}>
      {/* FEJLÉC NAVIGÁCIÓ */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={[styles.navButton, activeTab === 'CAMERA' && styles.activeNav]}
          onPress={() => setActiveTab('CAMERA')}>
          <Text style={styles.navText}>Kamera</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, activeTab === 'STACKING' && styles.activeNav]}
          onPress={() => setActiveTab('STACKING')}>
          <Text style={styles.navText}>Stacking</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, activeTab === 'POST_PROCESSING' && styles.activeNav]}
          onPress={() => setActiveTab('POST_PROCESSING')}>
          <Text style={styles.navText}>Feldolgozás</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.contentContainer}>
        {/* --- 1. KAMERA NÉZET --- */}
        {activeTab === 'CAMERA' && (
          <View>
            <Text style={styles.sectionTitle}>1. Fotózási Mód & Célpont</Text>
            
            <View style={styles.row}>
              <Text style={styles.label}>Távcsöves használat:</Text>
              <Switch value={useTelescope} onValueChange={setUseTelescope} />
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Mód:</Text>
              <View style={styles.buttonGroup}>
                <TouchableOpacity
                  style={[styles.smallBtn, captureMode === 'AUTO' && styles.selectedBtn]}
                  onPress={() => setCaptureMode('AUTO')}>
                  <Text style={styles.btnText}>Auto Égbolt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallBtn, captureMode === 'MANUAL' && styles.selectedBtn]}
                  onPress={() => setCaptureMode('MANUAL')}>
                  <Text style={styles.btnText}>Manuális</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.subTitle}>Célpont kiválasztása (Preset):</Text>
            <View style={styles.buttonGroup}>
              {(['MILKY_WAY', 'MOON', 'PLANET', 'DEEP_SKY'] as TargetPreset[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.presetBtn, preset === t && styles.selectedBtn]}
                  onPress={() => applyPreset(t)}>
                  <Text style={styles.btnText}>{t.replace('_', ' ')}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionTitle}>2. Kép Típusa (Kalibráció)</Text>
            <View style={styles.buttonGroup}>
              {(['LIGHT', 'DARK', 'FLAT', 'BIAS'] as FrameType[]).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.frameBtn, frameType === f && styles.selectedFrameBtn]}
                  onPress={() => setFrameType(f)}>
                  <Text style={styles.btnText}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionTitle}>3. Manuális Expozíciós Paraméterek</Text>
            <Text style={styles.label}>ISO: {settings.iso}</Text>
            <Slider
              minimumValue={100}
              maximumValue={6400}
              step={100}
              value={settings.iso}
              onValueChange={(val) => setSettings({ ...settings, iso: val })}
              disabled={captureMode === 'AUTO'}
            />

            <Text style={styles.label}>Záridő: {settings.exposureTime} mp</Text>
            <Slider
              minimumValue={0.001}
              maximumValue={30}
              step={0.5}
              value={settings.exposureTime}
              onValueChange={(val) => setSettings({ ...settings, exposureTime: val })}
              disabled={captureMode === 'AUTO'}
            />

            <Text style={styles.label}>Fókusz (0: Közel, 1: Végtelen): {settings.focus.toFixed(2)}</Text>
            <Slider
              minimumValue={0}
              maximumValue={1}
              value={settings.focus}
              onValueChange={(val) => setSettings({ ...settings, focus: val })}
            />

            <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
              <Text style={styles.captureText}>FOTÓZÁS ({frameType})</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* --- 2. STACKING NÉZET --- */}
        {activeTab === 'STACKING' && (
          <View>
            <Text style={styles.sectionTitle}>Képek Összeillesztése & Zajcsökkentés</Text>
            
            <View style={styles.row}>
              <Text style={styles.label}>Automata Csillagillesztés (Alignment):</Text>
              <Switch
                value={stacking.alignAuto}
                onValueChange={(val) => setStacking({ ...stacking, alignAuto: val })}
              />
            </View>

            {!stacking.alignAuto && (
              <View style={styles.manualAlignBox}>
                <Text style={styles.subTitle}>Manuális Elfordulás & Korrekció</Text>
                <Text style={styles.label}>Forgatás: {stacking.manualRotation.toFixed(1)}°</Text>
                <Slider
                  minimumValue={-180}
                  maximumValue={180}
                  value={stacking.manualRotation}
                  onValueChange={(val) => setStacking({ ...stacking, manualRotation: val })}
                />

                <Text style={styles.label}>X Eltolás: {stacking.manualOffsetX} px</Text>
                <Slider
                  minimumValue={-200}
                  maximumValue={200}
                  value={stacking.manualOffsetX}
                  onValueChange={(val) => setStacking({ ...stacking, manualOffsetX: val })}
                />

                <Text style={styles.label}>Y Eltolás: {stacking.manualOffsetY} px</Text>
                <Slider
                  minimumValue={-200}
                  maximumValue={200}
                  value={stacking.manualOffsetY}
                  onValueChange={(val) => setStacking({ ...stacking, manualOffsetY: val })}
                />
              </View>
            )}

            <TouchableOpacity style={styles.actionButton} onPress={handleRunStacking}>
              <Text style={styles.actionBtnText}>STACKING FONTOSSÁG INDÍTÁSA</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* --- 3. UTÓFELDOLGOZÁS NÉZET --- */}
        {activeTab === 'POST_PROCESSING' && (
          <View>
            <Text style={styles.sectionTitle}>Szín- és Képkorrekciók</Text>

            <Text style={styles.label}>Fényerő / Hisztogram: {postProc.brightness}</Text>
            <Slider
              minimumValue={-100}
              maximumValue={100}
              value={postProc.brightness}
              onValueChange={(val) => setPostProc({ ...postProc, brightness: val })}
            />

            <Text style={styles.label}>Kontraszt: {postProc.contrast.toFixed(2)}</Text>
            <Slider
              minimumValue={0.5}
              maximumValue={3}
              value={postProc.contrast}
              onValueChange={(val) => setPostProc({ ...postProc, contrast: val })}
            />

            <Text style={styles.label}>Szoftveres Zajcsökkentés: {postProc.noiseReduction}%</Text>
            <Slider
              minimumValue={0}
              maximumValue={100}
              value={postProc.noiseReduction}
              onValueChange={(val) => setPostProc({ ...postProc, noiseReduction: val })}
            />

            <Text style={styles.subTitle}>RGB Csatorna Egyensúly (Manuális Színkorrekció)</Text>
            <Text style={styles.label}>Vörös (Red): {postProc.redGain.toFixed(2)}</Text>
            <Slider
              minimumValue={0}
              maximumValue={2}
              value={postProc.redGain}
              onValueChange={(val) => setPostProc({ ...postProc, redGain: val })}
            />

            <Text style={styles.label}>Zöld (Green): {postProc.greenGain.toFixed(2)}</Text>
            <Slider
              minimumValue={0}
              maximumValue={2}
              value={postProc.greenGain}
              onValueChange={(val) => setPostProc({ ...postProc, greenGain: val })}
            />

            <Text style={styles.label}>Kék (Blue): {postProc.blueGain.toFixed(2)}</Text>
            <Slider
              minimumValue={0}
              maximumValue={2}
              value={postProc.blueGain}
              onValueChange={(val) => setPostProc({ ...postProc, blueGain: val })}
            />

            <View style={styles.projectButtons}>
              <TouchableOpacity style={[styles.actionButton, styles.saveBtn]} onPress={handleSaveProject}>
                <Text style={styles.actionBtnText}>Projekt Mentése</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, styles.loadBtn]} onPress={handleLoadProject}>
                <Text style={styles.actionBtnText}>Projekt Betöltése</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// --- STÍLUSOK (Sötét asztro-téma) ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0f12', paddingTop: 40 },
  navBar: { flexDirection: 'row', backgroundColor: '#1a1d24', paddingVertical: 10 },
  navButton: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  activeNav: { borderBottomWidth: 2, borderBottomColor: '#00d2ff' },
  navText: { color: '#ffffff', fontWeight: 'bold' },
  contentContainer: { padding: 15 },
  sectionTitle: { color: '#00d2ff', fontSize: 16, fontWeight: 'bold', marginTop: 15, marginBottom: 10 },
  subTitle: { color: '#aaaaaa', fontSize: 14, marginTop: 10, marginBottom: 5 },
  label: { color: '#ffffff', marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 5 },
  buttonGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginVertical: 5 },
  smallBtn: { backgroundColor: '#252a34', padding: 8, borderRadius: 5 },
  presetBtn: { backgroundColor: '#252a34', padding: 10, borderRadius: 5, flex: 1, minWidth: '45%', alignItems: 'center' },
  frameBtn: { backgroundColor: '#252a34', padding: 10, borderRadius: 5, flex: 1, alignItems: 'center' },
  selectedBtn: { backgroundColor: '#0055ff' },
  selectedFrameBtn: { backgroundColor: '#ff3366' },
  btnText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },
  captureButton: { backgroundColor: '#ff3366', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 25 },
  captureText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },
  manualAlignBox: { backgroundColor: '#161920', padding: 10, borderRadius: 8, marginTop: 10 },
  actionButton: { backgroundColor: '#00d2ff', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  saveBtn: { backgroundColor: '#28a745', flex: 1 },
  loadBtn: { backgroundColor: '#ffc107', flex: 1 },
  actionBtnText: { color: '#000000', fontWeight: 'bold' },
  projectButtons: { flexDirection: 'row', gap: 10 },
});
