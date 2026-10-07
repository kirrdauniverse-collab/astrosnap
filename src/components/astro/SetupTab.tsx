"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BORTLE_LABELS,
  EQUIPMENT,
  TARGETS,
  type AstroSettings,
  type EquipmentType,
  type SkyConditions,
  type TargetType,
} from "@/lib/astro/types";
import {
  computeSettings,
  describeIso,
  describeWhiteBalance,
  formatExposure,
} from "@/lib/astro/calculator";
import {
  Sparkles,
  RotateCcw,
  Info,
  Telescope,
  CloudMoon,
  Aperture,
  Clock,
  Gauge,
  Thermometer,
  Focus,
  Camera,
  Timer,
} from "lucide-react";

interface SetupTabProps {
  target: TargetType;
  equipment: EquipmentType;
  sky: SkyConditions;
  settings: AstroSettings;
  isManual: boolean;
  onTargetChange: (t: TargetType) => void;
  onEquipmentChange: (e: EquipmentType) => void;
  onSkyChange: (s: SkyConditions) => void;
  onSettingsChange: (s: AstroSettings) => void;
  onAutoRecalculate: () => void;
}

export function SetupTab(props: SetupTabProps) {
  const {
    target,
    equipment,
    sky,
    settings,
    isManual,
    onTargetChange,
    onEquipmentChange,
    onSkyChange,
    onSettingsChange,
    onAutoRecalculate,
  } = props;

  const recommendedSettings = useMemo(
    () => computeSettings(target, equipment, sky),
    [target, equipment, sky]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Bal oldali bemenetek */}
      <div className="flex flex-col gap-4">
        {/* Célpont választó */}
        <Card className="bg-[#0c1322] border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Célpont objektum
            </CardTitle>
            <CardDescription className="text-xs">
              Válaszd ki mit szeretnél lefotózni
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ScrollArea className="h-44 rounded-md">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pr-2">
                {TARGETS.map((t) => (
                  <button
                    key={t.type}
                    onClick={() => onTargetChange(t.type)}
                    className={`flex items-start gap-2 p-3 rounded-lg border text-left transition-all ${
                      target === t.type
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "border-white/10 bg-[#080d1a] hover:border-white/20"
                    }`}
                  >
                    <span className="text-xl">{t.emoji}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{t.label}</div>
                      <div className="text-[10px] text-slate-400 line-clamp-2">
                        {t.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Eszköz választó */}
        <Card className="bg-[#0c1322] border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Telescope className="w-4 h-4 text-amber-400" />
              Eszköz / Felépítés
            </CardTitle>
            <CardDescription className="text-xs">
              Telefon vagy távcsővel kombinálva?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={equipment}
              onValueChange={(v) => onEquipmentChange(v as EquipmentType)}
            >
              <SelectTrigger className="bg-[#080d1a] border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0c1322] border-white/10">
                {EQUIPMENT.map((e) => (
                  <SelectItem key={e.type} value={e.type} className="text-sm">
                    <span className="mr-2">{e.emoji}</span>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-slate-400">
              {EQUIPMENT.find((e) => e.type === equipment)?.description}
            </p>
          </CardContent>
        </Card>

        {/* Égbolt körülmények */}
        <Card className="bg-[#0c1322] border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CloudMoon className="w-4 h-4 text-sky-400" />
              Égbolt körülmények
            </CardTitle>
            <CardDescription className="text-xs">
              Automatikus beállításokhoz meg kell adni
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Bortle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Fényszennyezés (Bortle)</Label>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {BORTLE_LABELS[sky.bortle]}
                </Badge>
              </div>
              <Slider
                value={[sky.bortle]}
                onValueChange={(v) => onSkyChange({ ...sky, bortle: v[0] })}
                min={1}
                max={9}
                step={1}
                className="py-2"
              />
            </div>

            {/* Hold fázis */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Hold fázis</Label>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {Math.round(sky.moonPhase * 100)}%
                </Badge>
              </div>
              <Slider
                value={[Math.round(sky.moonPhase * 100)]}
                onValueChange={(v) =>
                  onSkyChange({ ...sky, moonPhase: v[0] / 100 })
                }
                min={0}
                max={100}
                step={5}
                className="py-2"
              />
            </div>

            {/* Felhőzettség */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Felhőzettség</Label>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {sky.cloudCover}%
                </Badge>
              </div>
              <Slider
                value={[sky.cloudCover]}
                onValueChange={(v) => onSkyChange({ ...sky, cloudCover: v[0] })}
                min={0}
                max={100}
                step={5}
                className="py-2"
              />
            </div>

            {/* Látás */}
            <div className="space-y-2">
              <Label className="text-xs">Látás (seeing)</Label>
              <Select
                value={sky.seeing}
                onValueChange={(v) =>
                  onSkyChange({
                    ...sky,
                    seeing: v as SkyConditions["seeing"],
                  })
                }
              >
                <SelectTrigger className="bg-[#080d1a] border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0c1322] border-white/10">
                  <SelectItem value="excellent">Kiváló (1.0")</SelectItem>
                  <SelectItem value="good">Jó (1.5-2")</SelectItem>
                  <SelectItem value="average">Átlagos (2-3")</SelectItem>
                  <SelectItem value="poor">Gyenge (&gt;3")</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Jobb oldali kimenet: ajánlott beállítások */}
      <div className="flex flex-col gap-4">
        <Card className="bg-gradient-to-br from-[#0c1322] to-[#080d1a] border-emerald-500/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Camera className="w-4 h-4 text-emerald-400" />
                  Ajánlott beállítások
                </CardTitle>
                <CardDescription className="text-xs">
                  {TARGETS.find((t) => t.type === target)?.label} •{" "}
                  {EQUIPMENT.find((e) => e.type === equipment)?.label}
                </CardDescription>
              </div>
              {isManual && (
                <Badge className="bg-amber-500/20 text-amber-300 text-[10px]">
                  Manuális
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <SettingBox
                icon={<Gauge className="w-3.5 h-3.5" />}
                label="ISO"
                value={settings.iso.toString()}
                description={describeIso(settings.iso)}
              />
              <SettingBox
                icon={<Clock className="w-3.5 h-3.5" />}
                label="Expozíció"
                value={formatExposure(settings.exposureSeconds)}
                description="Másodperc"
              />
              <SettingBox
                icon={<Aperture className="w-3.5 h-3.5" />}
                label="Blende"
                value={settings.aperture}
                description="Fókusz nyílás"
              />
              <SettingBox
                icon={<Thermometer className="w-3.5 h-3.5" />}
                label="Fehérmérleg"
                value={`${settings.whiteBalanceK}K`}
                description={describeWhiteBalance(settings.whiteBalanceK)}
              />
              <SettingBox
                icon={<Focus className="w-3.5 h-3.5" />}
                label="Fókusz"
                value={
                  settings.focusMode === "infinity"
                    ? "Végtelen"
                    : settings.focusMode === "manual"
                    ? "Manuális"
                    : "Auto"
                }
                description="Fókusz mód"
              />
              <SettingBox
                icon={<Sparkles className="w-3.5 h-3.5" />}
                label="Képek száma"
                value={`${settings.burstCount} db`}
                description={`Interval: ${settings.intervalSeconds}s`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center justify-between p-2 rounded-md bg-[#080d1a]">
                <span className="text-slate-400">RAW formátum</span>
                <Switch
                  checked={settings.rawRecommended}
                  onCheckedChange={(v) =>
                    onSettingsChange({ ...settings, rawRecommended: v })
                  }
                />
              </div>
              <div className="flex items-center justify-between p-2 rounded-md bg-[#080d1a]">
                <span className="text-slate-400">Stabilizáció</span>
                <Switch
                  checked={settings.stabilization}
                  onCheckedChange={(v) =>
                    onSettingsChange({ ...settings, stabilization: v })
                  }
                />
              </div>
            </div>

            <Separator className="bg-white/10" />

            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" />
                ISO finomhangolás
              </Label>
              <Slider
                value={[settings.iso]}
                onValueChange={(v) => onSettingsChange({ ...settings, iso: v[0] })}
                min={50}
                max={6400}
                step={50}
                className="py-1"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Expozíció finomhangolás (s)
              </Label>
              <Slider
                value={[
                  settings.exposureSeconds >= 1
                    ? settings.exposureSeconds
                    : Math.round(-Math.log2(settings.exposureSeconds)),
                ]}
                onValueChange={(v) => {
                  // Ha v < 0, akkor 2^v másodperc; ha >= 1, akkor v másodperc
                  const newVal = v[0] < 0 ? Math.pow(2, v[0]) : v[0];
                  onSettingsChange({
                    ...settings,
                    exposureSeconds: newVal,
                  });
                }}
                min={-10}
                max={120}
                step={1}
                className="py-1"
              />
              <div className="text-[10px] text-slate-500 font-mono">
                Aktuális: {formatExposure(settings.exposureSeconds)}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Fehérmérleg (K)</Label>
              <Slider
                value={[settings.whiteBalanceK]}
                onValueChange={(v) =>
                  onSettingsChange({ ...settings, whiteBalanceK: v[0] })
                }
                min={2500}
                max={9000}
                step={100}
                className="py-1"
              />
            </div>

            {/* 500-szabály panel: zoom + tracking + max exposure */}
            <div className="p-3 rounded-lg bg-sky-500/5 border border-sky-500/20 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-sky-300">
                <Telescope className="w-3.5 h-3.5" />
                500-szabály (csillagmozgás)
              </div>

              {/* Zoom beállítás */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-slate-300">Zoom szorzó</Label>
                  <Badge variant="outline" className="text-[10px] font-mono text-sky-300 border-sky-500/30">
                    {settings.zoomFactor.toFixed(1)}x
                  </Badge>
                </div>
                <Slider
                  value={[Math.round(settings.zoomFactor * 10)]}
                  onValueChange={(v) => {
                    const newZoom = v[0] / 10;
                    const newFocal = settings.focalLengthMm * newZoom;
                    const newMax = settings.trackingEnabled
                      ? 600
                      : Math.max(0.1, (500 / newFocal) * 0.85);
                    let newExp = settings.exposureSeconds;
                    let newNotes = settings.notes;
                    if (!settings.trackingEnabled && newExp > newMax) {
                      newExp = Math.floor(newMax * 10) / 10;
                      newNotes = newNotes.replace(
                        /⚠ 500-szabály:[^]*?(?=\s*$|\s*Tracking)/,
                        ""
                      ).trim();
                      newNotes =
                        (newNotes ? newNotes + " " : "") +
                        `⚠ 500-szabály: ${newFocal.toFixed(0)}mm fókusznál ` +
                        `max ${newMax.toFixed(1)}s expozíció ajánlott. Csökkentettük az expozíciót.`;
                    }
                    onSettingsChange({
                      ...settings,
                      zoomFactor: newZoom,
                      maxExposureSeconds: newMax,
                      exposureSeconds: newExp,
                      notes: newNotes,
                    });
                  }}
                  min={1}
                  max={80}
                  step={1}
                  className="py-1"
                />
              </div>

              {/* Effektív fókusz + max expozíció */}
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="p-2 rounded-md bg-[#080d1a] border border-white/5">
                  <div className="text-slate-400 mb-0.5">Effektív fókusz</div>
                  <div className="font-mono font-bold text-sky-200">
                    {(settings.focalLengthMm * settings.zoomFactor).toFixed(0)} mm
                  </div>
                </div>
                <div className="p-2 rounded-md bg-[#080d1a] border border-white/5">
                  <div className="text-slate-400 mb-0.5">
                    Max expozíció {settings.trackingEnabled ? "(tracking)" : "(500-szabály)"}
                  </div>
                  <div className="font-mono font-bold text-sky-200">
                    {settings.trackingEnabled
                      ? "nincs limit"
                      : `${settings.maxExposureSeconds.toFixed(1)}s`}
                  </div>
                </div>
              </div>

              {/* Tracking kapcsoló */}
              <div className="flex items-center justify-between p-2 rounded-md bg-[#080d1a] border border-white/5">
                <div className="min-w-0">
                  <Label className="text-[11px] text-slate-300">
                    Motoros követés (tracking)
                  </Label>
                  <div className="text-[9px] text-slate-500">
                    Equatoriális állvány / star tracker
                  </div>
                </div>
                <Switch
                  checked={settings.trackingEnabled}
                  onCheckedChange={(v) => {
                    const newMax = v ? 600 : Math.max(0.1, (500 / (settings.focalLengthMm * settings.zoomFactor)) * 0.85);
                    let newExp = settings.exposureSeconds;
                    let newNotes = settings.notes;
                    if (v) {
                      // Tracking bekapcsolása: visszaállítjuk az expozíciót egy ésszerűbb értékre
                      // Célpontspecifikus alap expozíció: hosszabb célpontoknál 30-60s
                      if (newExp < 30) {
                        // A korábban csökkentett értéket felemeljük
                        newExp = Math.min(60, Math.max(30, newExp * 2));
                      }
                      // Töröljük a 500-szabály figyelmeztetést a notes-ból
                      newNotes = newNotes.replace(/⚠ 500-szabály:[^]*?(?=\.|$)/g, "").trim();
                      newNotes = newNotes.replace(/\s+/g, " ");
                      if (!newNotes.includes("Tracking aktív")) {
                        newNotes = (newNotes ? newNotes + " " : "") +
                          "✓ Tracking aktív - a 500-szabály korlát nem érvényes, " +
                          "hosszabb expozíció is használható. ISO-t érdemes csökkenteni a túlzsír elkerülésére.";
                      }
                    } else {
                      // Tracking kikapcsolása: alkalmazzuk a 500-szabályt
                      if (newExp > newMax) {
                        newExp = Math.floor(newMax * 10) / 10;
                        const eff = settings.focalLengthMm * settings.zoomFactor;
                        newNotes = (newNotes ? newNotes + " " : "") +
                          `⚠ 500-szabály: ${eff.toFixed(0)}mm fókusznál max ${newMax.toFixed(1)}s expozíció ajánlott. Csökkentettük az expozíciót.`;
                      }
                    }
                    onSettingsChange({
                      ...settings,
                      trackingEnabled: v,
                      maxExposureSeconds: newMax,
                      exposureSeconds: newExp,
                      notes: newNotes,
                    });
                  }}
                />
              </div>

              {!settings.trackingEnabled &&
                settings.exposureSeconds >= settings.maxExposureSeconds && (
                  <div className="text-[10px] text-amber-300 p-2 rounded-md bg-amber-500/5 border border-amber-500/20">
                    ⚠ Az expozíció elérte a 500-szabály maximumot. Ha növeled, a csillagok
                    elmozdulnak és csíkokat hoznak létre.
                  </div>
                )}
            </div>

            {/* Előzár-idő (pre-shutter delay) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1">
                  <Timer className="w-3 h-3" />
                  Előzár-idő (önkioldó)
                </Label>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {settings.timerSeconds}s
                </Badge>
              </div>
              <Slider
                value={[settings.timerSeconds]}
                onValueChange={(v) =>
                  onSettingsChange({ ...settings, timerSeconds: v[0] })
                }
                min={0}
                max={15}
                step={1}
                className="py-1"
              />
              <div className="text-[10px] text-slate-500">
                Késleltetés az exponáló megnyomása után, hogy a telefon rezgése
                megszűnjön. Fix állványon ajánlott 2-5s.
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={onAutoRecalculate}
              className="w-full border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
              disabled={!isManual}
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Automatikus újraszámolás
            </Button>
          </CardContent>
        </Card>

        {/* Megjegyzések / tippek */}
        <Card className="bg-[#0c1322] border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-sky-400" />
              Tippek & megjegyzések
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-xs text-slate-300 leading-relaxed p-3 rounded-md bg-[#080d1a] border border-emerald-500/10">
              {settings.notes}
            </div>
            <Separator className="bg-white/10" />
            <div className="text-xs text-slate-300 leading-relaxed p-3 rounded-md bg-[#080d1a] border border-amber-500/10">
              <span className="text-amber-300 font-medium">Tipp: </span>
              {TARGETS.find((t) => t.type === target)?.tip}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SettingBox({
  icon,
  label,
  value,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-[#080d1a] border border-white/5">
      <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-base font-bold font-mono">{value}</div>
      {description && (
        <div className="text-[9px] text-slate-500 mt-0.5 truncate">
          {description}
        </div>
      )}
    </div>
  );
}
