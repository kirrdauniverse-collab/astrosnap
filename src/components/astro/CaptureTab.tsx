"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Camera,
  CameraOff,
  Upload,
  Save,
  Timer,
  Zap,
  ZapOff,
  Focus,
  Sun,
  Moon,
  ImagePlus,
  RotateCcw,
  Play,
  Square,
} from "lucide-react";
import type {
  AstroSettings,
  EquipmentType,
  SkyConditions,
  StoredImage,
  TargetType,
} from "@/lib/astro/types";
import { TARGETS } from "@/lib/astro/types";
import { formatExposure } from "@/lib/astro/calculator";
import {
  saveImage,
  genId,
} from "@/lib/storage/db";
import {
  imageToImageData,
  imageDataToBlob,
  imageDataToThumbnail,
} from "@/lib/processing/stacking";

interface CaptureTabProps {
  settings: AstroSettings;
  target: TargetType;
  equipment: EquipmentType;
  sky: SkyConditions;
  onCaptured: () => void;
}

type CameraFacing = "environment" | "user";

export function CaptureTab({
  settings,
  target,
  equipment,
  sky,
  onCaptured,
}: CaptureTabProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<CameraFacing>("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [focusMode, setFocusMode] = useState<"continuous" | "manual">(
    "continuous"
  );
  const [focusDistance, setFocusDistance] = useState(0); // 0..1
  const [wbMode, setWbMode] = useState<"auto" | "manual" | number>("auto");
  const [exposureComp, setExposureComp] = useState(0); // -2..2 EV
  const [zoom, setZoom] = useState(1);
  const [isBurst, setIsBurst] = useState(false);
  const [burstProgress, setBurstProgress] = useState(0);
  const [burstTotal, setBurstTotal] = useState(0);
  const [capturedCount, setCapturedCount] = useState(0);
  const [autoTimer, setAutoTimer] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null); // előzár-idő visszaszámláló
  const [countdownLabel, setCountdownLabel] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const burstIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Kamera indítása
  const startCamera = useCallback(async () => {
    setError(null);
    try {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 4096 },
          height: { ideal: 3072 },
        },
        audio: false,
      });
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      toast({
        title: "Kamera aktív",
        description: `Facing: ${facing === "environment" ? "hátsó" : "első"}`,
      });
    } catch (e: unknown) {
      const err = e as Error;
      setError(err.message || "Kamera indítása sikertelen");
      toast({
        title: "Kamera hiba",
        description: err.message,
        variant: "destructive",
      });
    }
  }, [facing, stream, toast]);

  // Kamera leállítása
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream]);

  // Track constraint-ek alkalmazása (ha támogatott)
  const applyTrackConstraints = useCallback(async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;

    const capabilities = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
      focusMode?: string[];
      focusDistance?: { min: number; max: number; step: number };
      exposureCompensation?: { min: number; max: number; step: number };
      zoom?: { min: number; max: number; step: number };
      torch?: boolean;
      whiteBalanceMode?: string[];
      whiteBalanceTemperature?: { min: number; max: number; step: number };
    };

    const constraints: MediaTrackConstraintSet = {};

    if (focusMode === "manual" && capabilities.focusDistance) {
      constraints.focusMode = "manual";
      constraints.focusDistance = focusDistance * (capabilities.focusDistance.max || 1);
    } else {
      constraints.focusMode = "continuous";
    }

    if (exposureComp !== 0 && capabilities.exposureCompensation) {
      constraints.exposureCompensation = exposureComp;
    }

    if (zoom > 1 && capabilities.zoom) {
      constraints.zoom = zoom * (capabilities.zoom.max || 1);
    }

    if (capabilities.torch !== undefined) {
      constraints.torch = torchOn;
    }

    try {
      await track.applyConstraints({ advanced: [constraints] });
    } catch (e) {
      // Néhány constraint nem támogatott, ne dobjunk hibát
      console.warn("Constraint alkalmazása sikertelen", e);
    }
  }, [stream, focusMode, focusDistance, exposureComp, zoom, torchOn]);

  useEffect(() => {
    applyTrackConstraints();
  }, [applyTrackConstraints]);

  // Komponens unmount - leállítjuk a kamerát
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (burstIntervalRef.current) {
        clearInterval(burstIntervalRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [stream]);

  // Egy kép rögzítése és mentése
  const captureAndStore = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // ImageData → StoredImage
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const blob = await imageDataToBlob(imageData);
    const thumbnail = await imageDataToThumbnail(imageData, 240);

    const stored: StoredImage = {
      id: genId("light"),
      type: "light",
      target,
      blob,
      thumbnail,
      capturedAt: Date.now(),
      settings: {
        iso: settings.iso,
        exposureSeconds: settings.exposureSeconds,
        whiteBalanceK: settings.whiteBalanceK,
      },
      metadata: {
        width: canvas.width,
        height: canvas.height,
        iso: settings.iso,
        exposureSeconds: settings.exposureSeconds,
        bortle: sky.bortle,
        equipment,
        label: `${TARGETS.find((t) => t.type === target)?.label ?? "Light"} • ${formatExposure(
          settings.exposureSeconds
        )}`,
      },
    };

    await saveImage(stored);
    return stored;
  }, [settings, target, sky, equipment]);

  // Várakozás előzár-idővel, visszaszámláló UI-jal
  const waitForPreShutterDelay = useCallback(
    (label: string): Promise<boolean> => {
      return new Promise((resolve) => {
        const delay = settings.timerSeconds ?? 0;
        if (delay <= 0) {
          resolve(true);
          return;
        }
        setCountdownLabel(label);
        setCountdown(delay);
        let remaining = delay;
        countdownIntervalRef.current = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            setCountdown(null);
            setCountdownLabel("");
            resolve(true);
          } else {
            setCountdown(remaining);
          }
        }, 1000);
      });
    },
    [settings.timerSeconds]
  );

  // Várakozás megszakítása
  const cancelCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
    setCountdownLabel("");
  }, []);

  // Egyetlen kép készítése
  const handleSingleCapture = useCallback(async () => {
    if (!stream) {
      toast({
        title: "Kamera nincs aktív",
        description: "Először indítsd el a kamerát",
        variant: "destructive",
      });
      return;
    }
    // Várjunk előzár-időt, ha be van állítva
    if (settings.timerSeconds > 0) {
      await waitForPreShutterDelay("Fotó készítése...");
    }
    const img = await captureAndStore();
    if (img) {
      setCapturedCount((c) => c + 1);
      onCaptured();
      toast({
        title: "Kép mentve",
        description: `ISO ${settings.iso} • ${formatExposure(settings.exposureSeconds)}`,
      });
    }
  }, [stream, captureAndStore, settings, toast, onCaptured, waitForPreShutterDelay]);

  // Burst sorozat indítása
  const handleStartBurst = useCallback(async () => {
    if (!stream) {
      toast({
        title: "Kamera nincs aktív",
        description: "Először indítsd el a kamerát",
        variant: "destructive",
      });
      return;
    }
    setIsBurst(true);
    setBurstProgress(0);
    setBurstTotal(settings.burstCount);

    let count = 0;
    const interval = Math.max(500, settings.intervalSeconds * 1000);

    // Előzár-idő az első kép előtt (ha be van állítva)
    if (settings.timerSeconds > 0) {
      await waitForPreShutterDelay("Sorozat indul...");
    }

    // Első kép
    await captureAndStore();
    count++;
    setBurstProgress(count);
    setCapturedCount((c) => c + 1);
    onCaptured();

    burstIntervalRef.current = setInterval(async () => {
      await captureAndStore();
      count++;
      setBurstProgress(count);
      setCapturedCount((c) => c + 1);
      onCaptured();

      if (count >= settings.burstCount) {
        if (burstIntervalRef.current) {
          clearInterval(burstIntervalRef.current);
          burstIntervalRef.current = null;
        }
        setIsBurst(false);
        toast({
          title: "Sorozat kész",
          description: `${count} kép elmentve a könyvtárba`,
        });
      }
    }, interval);
  }, [stream, settings, captureAndStore, onCaptured, toast, waitForPreShutterDelay]);

  const handleStopBurst = useCallback(() => {
    if (burstIntervalRef.current) {
      clearInterval(burstIntervalRef.current);
      burstIntervalRef.current = null;
    }
    cancelCountdown();
    setIsBurst(false);
    toast({
      title: "Sorozat leállítva",
      description: `${burstProgress} kép elmentve`,
    });
  }, [burstProgress, toast, cancelCountdown]);

  // Fájl feltöltése (támogatott alternatíva)
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const blob = file;
        // Készítsünk belőle ImageData-t, hogy thumbnail-t csinálhassunk
        try {
          const url = URL.createObjectURL(blob);
          const img = new Image();
          await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = rej;
            img.src = url;
          });
          const data = imageToImageData(img, 4096);
          const thumbnail = await imageDataToThumbnail(data, 240);
          const stored: StoredImage = {
            id: genId("light"),
            type: "light",
            target,
            blob,
            thumbnail,
            capturedAt: Date.now() + i,
            settings: {
              iso: settings.iso,
              exposureSeconds: settings.exposureSeconds,
              whiteBalanceK: settings.whiteBalanceK,
            },
            metadata: {
              width: data.width,
              height: data.height,
              iso: settings.iso,
              exposureSeconds: settings.exposureSeconds,
              bortle: sky.bortle,
              equipment,
              label: `${file.name}`,
            },
          };
          await saveImage(stored);
          URL.revokeObjectURL(url);
        } catch (err) {
          console.error(err);
        }
      }

      setCapturedCount((c) => c + files.length);
      onCaptured();
      toast({
        title: "Képek betöltve",
        description: `${files.length} kép mentve a könyvtárba`,
      });
      // Reset
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [target, settings, sky, equipment, onCaptured, toast]
  );

  // Aktív track képességei (capabilities)
  const [capabilities, setCapabilities] = useState<
    Partial<{
      focusDistance: boolean;
      exposureCompensation: boolean;
      zoom: boolean;
      torch: boolean;
      whiteBalanceMode: boolean;
    }>
  >({});

  useEffect(() => {
    if (!stream) {
      setCapabilities({});
      return;
    }
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    const caps = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
    setCapabilities({
      focusDistance: !!caps.focusDistance,
      exposureCompensation: !!caps.exposureCompensation,
      zoom: !!caps.zoom,
      torch: !!caps.torch,
      whiteBalanceMode: !!caps.whiteBalanceMode,
    });
  }, [stream]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Kamera viewfinder */}
      <div className="lg:col-span-2">
        <Card className="bg-[#0c1322] border-white/10 overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Camera className="w-4 h-4 text-emerald-400" />
                  Élő kamera
                </CardTitle>
                <CardDescription className="text-xs">
                  {TARGETS.find((t) => t.type === target)?.emoji}{" "}
                  {TARGETS.find((t) => t.type === target)?.label}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="text-[10px]">
                  ISO {settings.iso}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {formatExposure(settings.exposureSeconds)}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-white/10">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />

              {!stream && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                  <CameraOff className="w-12 h-12 text-slate-500 mb-3" />
                  <p className="text-sm text-slate-400 mb-4">
                    {error
                      ? `Hiba: ${error}`
                      : "Kamera nincs bekapcsolva. Indítsd el a megtekintéshez."}
                  </p>
                  <Button
                    onClick={startCamera}
                    className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Kamera indítása
                  </Button>
                </div>
              )}

              {stream && (
                <>
                  {/* Overlay: burst progress */}
                  {isBurst && (
                    <div className="absolute top-2 left-2 right-2 bg-black/60 backdrop-blur rounded-md p-2 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-emerald-300 font-medium">
                          ⚡ Burst sorozat
                        </span>
                        <span className="font-mono">
                          {burstProgress}/{burstTotal}
                        </span>
                      </div>
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 transition-all"
                          style={{
                            width: `${(burstProgress / burstTotal) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Overlay: előzár-idő visszaszámláló */}
                  {countdown !== null && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
                      <div className="text-[10px] uppercase tracking-widest text-amber-300 mb-2">
                        {countdownLabel || "Várakozás..."}
                      </div>
                      <div className="text-8xl font-bold text-white tabular-nums animate-pulse">
                        {countdown}
                      </div>
                      <div className="text-xs text-slate-300 mt-4">
                        Ne mozgasd a telefont!
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={cancelCountdown}
                        className="mt-4 border-red-500/30 text-red-300 hover:bg-red-500/10"
                      >
                        Mégse
                      </Button>
                    </div>
                  )}

                  {/* Alsó overlay: gyorsgombok */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setFacing((f) =>
                          f === "environment" ? "user" : "environment"
                        )
                      }
                      className="bg-black/60 backdrop-blur border border-white/10 hover:bg-black/80"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1" />
                      Fordítás
                    </Button>
                    {capabilities.torch && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setTorchOn((v) => !v)}
                        className={`bg-black/60 backdrop-blur border border-white/10 hover:bg-black/80 ${
                          torchOn ? "text-amber-300" : ""
                        }`}
                      >
                        {torchOn ? (
                          <Zap className="w-3.5 h-3.5 mr-1" />
                        ) : (
                          <ZapOff className="w-3.5 h-3.5 mr-1" />
                        )}
                        Vaku
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Capture gombok */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              <Button
                onClick={handleSingleCapture}
                disabled={!stream}
                className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40"
              >
                <Camera className="w-4 h-4 mr-1" />
                Fotó
              </Button>
              {!isBurst ? (
                <Button
                  onClick={handleStartBurst}
                  disabled={!stream}
                  className="bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 disabled:opacity-40"
                >
                  <Play className="w-4 h-4 mr-1" />
                  Sorozat
                </Button>
              ) : (
                <Button
                  onClick={handleStopBurst}
                  className="bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30"
                >
                  <Square className="w-4 h-4 mr-1" />
                  Stop
                </Button>
              )}
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="border-white/20 text-slate-200 hover:bg-white/5"
              >
                <Upload className="w-4 h-4 mr-1" />
                Feltöltés
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            <div className="mt-2 text-center text-[10px] text-slate-400">
              {capturedCount > 0
                ? `${capturedCount} kép mentve ez alkalommal.`
                : "Tipp: külső fényképezővel készített képeket a Feltöltés gombbal is hozzáadhatod."}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Manuális beállítások oldalsáv */}
      <div className="lg:col-span-1">
        <Card className="bg-[#0c1322] border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Focus className="w-4 h-4 text-amber-400" />
              Manuális vezérlők
            </CardTitle>
            <CardDescription className="text-[10px]">
              A támogatott funkciók eszközfüggők
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Focus */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1">
                  <Focus className="w-3 h-3" /> Fókusz mód
                </Label>
                <Switch
                  checked={focusMode === "manual"}
                  onCheckedChange={(v) =>
                    setFocusMode(v ? "manual" : "continuous")
                  }
                  disabled={!capabilities.focusDistance}
                />
              </div>
              {focusMode === "manual" && (
                <div>
                  <Slider
                    value={[focusDistance]}
                    onValueChange={(v) => setFocusDistance(v[0])}
                    min={0}
                    max={1}
                    step={0.01}
                    disabled={!capabilities.focusDistance}
                  />
                  <div className="text-[10px] text-slate-500 mt-1">
                    Fókusz távolság: {(focusDistance * 100).toFixed(0)}%
                    {!capabilities.focusDistance && " (nem támogatott)"}
                  </div>
                </div>
              )}
            </div>

            {/* Exposure compensation */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1">
                  <Sun className="w-3 h-3" /> Expozíció kompenzáció
                </Label>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {exposureComp > 0 ? "+" : ""}
                  {exposureComp.toFixed(1)} EV
                </Badge>
              </div>
              <Slider
                value={[exposureComp * 100]}
                onValueChange={(v) => setExposureComp(v[0] / 100)}
                min={-200}
                max={200}
                step={10}
                disabled={!capabilities.exposureCompensation}
              />
              {!capabilities.exposureCompensation && (
                <div className="text-[10px] text-slate-500">
                  Nem támogatott ezen az eszközön
                </div>
              )}
            </div>

            {/* Zoom */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1">
                  <Moon className="w-3 h-3" /> Zoom
                </Label>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {zoom.toFixed(1)}x
                </Badge>
              </div>
              <Slider
                value={[zoom * 100]}
                onValueChange={(v) => setZoom(v[0] / 100)}
                min={100}
                max={800}
                step={10}
                disabled={!capabilities.zoom}
              />
              {!capabilities.zoom && (
                <div className="text-[10px] text-slate-500">
                  Nem támogatott ezen az eszközön
                </div>
              )}
            </div>

            {/* White balance */}
            <div className="space-y-2">
              <Label className="text-xs">Fehérmérleg</Label>
              <Select
                value={wbMode === "auto" || wbMode === "manual" ? wbMode : "manual"}
                onValueChange={(v) =>
                  setWbMode(v === "auto" ? "auto" : "manual")
                }
                disabled={!capabilities.whiteBalanceMode}
              >
                <SelectTrigger className="bg-[#080d1a] border-white/10 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0c1322] border-white/10">
                  <SelectItem value="auto">Auto WB</SelectItem>
                  <SelectItem value="manual">Manuális ({settings.whiteBalanceK}K)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-2 border-t border-white/10">
              <Button
                onClick={stopCamera}
                disabled={!stream}
                variant="outline"
                size="sm"
                className="w-full border-red-500/30 text-red-300 hover:bg-red-500/10"
              >
                <CameraOff className="w-3 h-3 mr-1" />
                Kamera leállítása
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
