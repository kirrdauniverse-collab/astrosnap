"use client";

import { useState, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SetupTab } from "./astro/SetupTab";
import { CaptureTab } from "./astro/CaptureTab";
import { CalibrationTab } from "./astro/CalibrationTab";
import { LibraryTab } from "./astro/LibraryTab";
import { ProcessTab } from "./astro/ProcessTab";
import type {
  AstroSettings,
  EquipmentType,
  SkyConditions,
  TargetType,
} from "@/lib/astro/types";
import { computeSettings } from "@/lib/astro/calculator";

export interface AstroSnapshot {
  target: TargetType;
  equipment: EquipmentType;
  sky: SkyConditions;
  settings: AstroSettings;
}

export default function AstroApp() {
  const [activeTab, setActiveTab] = useState<string>("setup");
  const [target, setTarget] = useState<TargetType>("milky_way");
  const [equipment, setEquipment] = useState<EquipmentType>("phone_tripod");
  const [sky, setSky] = useState<SkyConditions>({
    bortle: 4,
    moonPhase: 0.2,
    seeing: "good",
    cloudCover: 0,
  });
  const [manualSettings, setManualSettings] = useState<AstroSettings | null>(
    null
  );
  const [refreshKey, setRefreshKey] = useState(0);

  // Auto-update settings based on inputs unless manual mode is active
  const computed = computeSettings(target, equipment, sky);
  const activeSettings = manualSettings ?? computed;

  const handleSettingsChange = useCallback((s: AstroSettings) => {
    setManualSettings(s);
  }, []);

  // Ha a target, equipment vagy sky megváltozik, automatikusan újraszámolunk
  // (töröljük a manuális beállításokat, hacsak nem kézzel felülírt értékek)
  const handleTargetChange = useCallback((t: TargetType) => {
    setTarget(t);
    setManualSettings(null);
  }, []);

  const handleEquipmentChange = useCallback((e: EquipmentType) => {
    setEquipment(e);
    setManualSettings(null);
  }, []);

  const handleSkyChange = useCallback((s: SkyConditions) => {
    setSky(s);
    setManualSettings(null);
  }, []);

  const handleAutoRecalculate = useCallback(() => {
    setManualSettings(null);
    setRefreshKey((k) => k + 1);
  }, []);

  // Refresh library tab when switching to it
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    if (tab === "library" || tab === "process" || tab === "calibration") {
      setRefreshKey((k) => k + 1);
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#050810] text-slate-100">
      {/* Fejléc */}
      <header className="border-b border-white/10 bg-[#080d1a] backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-2xl sm:text-3xl">🌌</div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold tracking-tight truncate">
                AstroSnap
              </h1>
              <p className="text-[10px] sm:text-xs text-slate-400 truncate">
                Asztrofotó asszisztens
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px]"
            >
              ● Live
            </Badge>
          </div>
        </div>
      </header>

      {/* Fő content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-32">
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-5 h-auto bg-[#0c1322] border border-white/5 p-1">
            <TabsTrigger
              value="setup"
              className="flex flex-col gap-1 py-2 data-[state=active]:bg-slate-700/50 data-[state=active]:text-emerald-300"
            >
              <span className="text-base">⚙️</span>
              <span className="text-[10px] sm:text-xs">Beállítás</span>
            </TabsTrigger>
            <TabsTrigger
              value="capture"
              className="flex flex-col gap-1 py-2 data-[state=active]:bg-slate-700/50 data-[state=active]:text-emerald-300"
            >
              <span className="text-base">📷</span>
              <span className="text-[10px] sm:text-xs">Felvétel</span>
            </TabsTrigger>
            <TabsTrigger
              value="calibration"
              className="flex flex-col gap-1 py-2 data-[state=active]:bg-slate-700/50 data-[state=active]:text-emerald-300"
            >
              <span className="text-base">🎚️</span>
              <span className="text-[10px] sm:text-xs">Kalibráció</span>
            </TabsTrigger>
            <TabsTrigger
              value="library"
              className="flex flex-col gap-1 py-2 data-[state=active]:bg-slate-700/50 data-[state=active]:text-emerald-300"
            >
              <span className="text-base">🖼️</span>
              <span className="text-[10px] sm:text-xs">Könyvtár</span>
            </TabsTrigger>
            <TabsTrigger
              value="process"
              className="flex flex-col gap-1 py-2 data-[state=active]:bg-slate-700/50 data-[state=active]:text-emerald-300"
            >
              <span className="text-base">✨</span>
              <span className="text-[10px] sm:text-xs">Feldolgozás</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="mt-4">
            <SetupTab
              target={target}
              equipment={equipment}
              sky={sky}
              settings={activeSettings}
              isManual={manualSettings !== null}
              onTargetChange={handleTargetChange}
              onEquipmentChange={handleEquipmentChange}
              onSkyChange={handleSkyChange}
              onSettingsChange={handleSettingsChange}
              onAutoRecalculate={handleAutoRecalculate}
            />
          </TabsContent>

          <TabsContent value="capture" className="mt-4">
            <CaptureTab
              settings={activeSettings}
              target={target}
              equipment={equipment}
              sky={sky}
              onCaptured={() => setRefreshKey((k) => k + 1)}
            />
          </TabsContent>

          <TabsContent value="calibration" className="mt-4">
            <CalibrationTab
              settings={activeSettings}
              onCaptured={() => setRefreshKey((k) => k + 1)}
              key={`calib-${refreshKey}`}
            />
          </TabsContent>

          <TabsContent value="library" className="mt-4">
            <LibraryTab key={`lib-${refreshKey}`} />
          </TabsContent>

          <TabsContent value="process" className="mt-4">
            <ProcessTab key={`proc-${refreshKey}`} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/10 bg-[#080d1a]">
        <div className="max-w-6xl mx-auto px-4 py-3 text-center text-[11px] text-slate-500">
          <span>
            🌌 AstroSnap – Készülj fel az éjszakai égbolt fotózására. Minden
            helyileg tárolva a telefonodon.
          </span>
        </div>
      </footer>
    </div>
  );
}
