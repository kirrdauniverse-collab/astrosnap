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
  Grid3x3,
  BarChart3,
  Settings2,
  X,
  Plus,
  Minus,
  Crosshair,
  AlertTriangle,
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

  // Pro funkciók state-ek
  const [showGrid, setShowGrid] = useState(false); // rule of thirds rács
  const [showHistogram, setShowHistogram] = useState(false); // élő hisztogram
  const [showZebra, setShowZebra] = useState(false); // túlexpoziált területek
  const [showProPanel, setShowProPanel] = useState(false); // pro vezérlők panel
  const [histogramData, setHistogramData] = useState<{
    r: number[];
    g: number[];
    b: number[];
  }>({ r: [], g: [], b: [] });
  const [overexposedPixels, setOverexposedPixels] = useState<number>(0); // % túlexponált

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const histCanvasRef = useRef<HTMLCanvasElement>(null); // hisztogram rajzoláshoz
  const analyzeCanvasRef = useRef<HTMLCanvasElement>(null); // rejtett canvas elemzéshez
  const fileInputRef = useRef<HTMLInputElement>(null);
  const burstIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const analyzeIntervalRef = useRef<NodeJS.Timeout | null>(null);
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

  // Élő kép elemzése: hisztogram és túlexponált pixel arány számítása
  // 1 másodpercenként fut, kis felbontású mintavételezés a videóból
  const analyzeVideoFrame = useCallback(() => {
    if (!videoRef.current || !analyzeCanvasRef.current) return;
    const video = videoRef.current;
    if (!video.videoWidth || !video.videoHeight) return;

    // Kis felbontású mintavétel a sebesség kedvéért (160x90)
    const sampleW = 160;
    const sampleH = 90;
    const canvas = analyzeCanvasRef.current;
    canvas.width = sampleW;
    canvas.height = sampleH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, sampleW, sampleH);
    const imageData = ctx.getImageData(0, 0, sampleW, sampleH);
    const data = imageData.data;

    // Hisztogram: 32 bin / csatorna (R, G, B)
    const bins = 32;
    const r = new Array(bins).fill(0);
    const g = new Array(bins).fill(0);
    const b = new Array(bins).fill(0);
    let overexp = 0;
    const total = sampleW * sampleH;
    const overexpThreshold = 240; // felette túlexponált

    for (let i = 0; i < data.length; i += 4) {
      const R = data[i];
      const G = data[i + 1];
      const B = data[i + 2];
      r[Math.floor((R / 256) * bins)]++;
      g[Math.floor((G / 256) * bins)]++;
      b[Math.floor((B / 256) * bins)]++;
      // Túlexponált: legalább két csatorna > 240
      const channelsHigh = (R > overexpThreshold ? 1 : 0) + (G > overexpThreshold ? 1 : 0) + (B > overexpThreshold ? 1 : 0);
      if (channelsHigh >= 2) overexp++;
    }

    setHistogramData({ r, g, b });
    setOverexposedPixels(Math.round((overexp / total) * 100));
  }, []);

  // Élő elemzés indítása/leállítása a stream-mel
  useEffect(() => {
    if (stream && (showHistogram || showZebra)) {
      // Indítsuk el a mintavételezést 1s-onként
      analyzeIntervalRef.current = setInterval(analyzeVideoFrame, 1000);
      // Azonnal is futtassunk egy elemzést
      setTimeout(analyzeVideoFrame, 100);
    } else {
      if (analyzeIntervalRef.current) {
        clearInterval(analyzeIntervalRef.current);
        analyzeIntervalRef.current = null;
      }
    }
    return () => {
      if (analyzeIntervalRef.current) {
        clearInterval(analyzeIntervalRef.current);
        analyzeIntervalRef.current = null;
      }
    };
  }, [stream, showHistogram, showZebra, analyzeVideoFrame]);

  // Hisztogram rajzolása a canvas-ra
  useEffect(() => {
    if (!showHistogram || !histCanvasRef.current) return;
    const canvas = histCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Háttér
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, w, h);

    const bins = histogramData.r.length;
    if (bins === 0) return;
    const binW = w / bins;
    const maxVal = Math.max(
      ...histogramData.r,
      ...histogramData.g,
      ...histogramData.b,
      1
    );

    // RGB csatornák
    const drawChannel = (
      arr: number[],
      color: string,
      alpha: number
    ) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      for (let i = 0; i < bins; i++) {
        const barH = (arr[i] / maxVal) * h * 0.9;
        ctx.fillRect(i * binW, h - barH, binW - 0.5, barH);
      }
      ctx.globalAlpha = 1;
    };
    drawChannel(histogramData.r, "#ef4444", 0.6);
    drawChannel(histogramData.g, "#22c55e", 0.6);
    drawChannel(histogramData.b, "#3b82f6", 0.6);
  }, [histogramData, showHistogram]);

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
      if (analyzeIntervalRef.current) {
        clearInterval(analyzeIntervalRef.current);
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
              <div className="flex gap-2 flex-wrap justify-end">
                <Badge variant="outline" className="text-[10px]">
                  ISO {settings.iso}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {formatExposure(settings.exposureSeconds)}
                </Badge>
                {settings.timerSeconds > 0 && (
                  <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/30">
                    <Timer className="w-2.5 h-2.5 mr-1" />
                    {settings.timerSeconds}s
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Nagy kamera viewfinder overlay gombokkal */}
            <div className="relative w-full bg-black rounded-lg overflow-hidden border border-white/10 aspect-[3/4] sm:aspect-[4/3] lg:aspect-[16/10]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
              {/* Rejtett canvas az élő elemzéshez */}
              <canvas ref={analyzeCanvasRef} className="hidden" />

              {!stream && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-[#050810]">
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
                  {/* === FELSŐ SÁV: Pro funkciók gyorsgombjai === */}
                  <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-2 z-10">
                    {/* Bal: Burst progress (ha aktív) */}
                    {isBurst ? (
                      <div className="flex-1 bg-black/60 backdrop-blur rounded-md p-2 text-xs">
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
                    ) : (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                          className="bg-black/60 backdrop-blur border border-white/10 hover:bg-black/80 text-white p-2 rounded-full transition"
                          title="Kamera fordítása"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        {capabilities.torch && (
                          <button
                            onClick={() => setTorchOn((v) => !v)}
                            className={`bg-black/60 backdrop-blur border border-white/10 hover:bg-black/80 p-2 rounded-full transition ${torchOn ? "text-amber-300 ring-2 ring-amber-500/50" : "text-white"}`}
                            title="Vaku"
                          >
                            {torchOn ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Jobb: Pro funkciók kapcsolók */}
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setShowGrid((v) => !v)}
                        className={`bg-black/60 backdrop-blur border p-2 rounded-full transition ${
                          showGrid
                            ? "border-emerald-500/50 text-emerald-300 ring-2 ring-emerald-500/30"
                            : "border-white/10 hover:bg-black/80 text-white"
                        }`}
                        title="Rács (rule of thirds)"
                      >
                        <Grid3x3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setShowHistogram((v) => !v)}
                        className={`bg-black/60 backdrop-blur border p-2 rounded-full transition ${
                          showHistogram
                            ? "border-sky-500/50 text-sky-300 ring-2 ring-sky-500/30"
                            : "border-white/10 hover:bg-black/80 text-white"
                        }`}
                        title="Hisztogram"
                      >
                        <BarChart3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setShowZebra((v) => !v)}
                        className={`bg-black/60 backdrop-blur border p-2 rounded-full transition ${
                          showZebra
                            ? "border-amber-500/50 text-amber-300 ring-2 ring-amber-500/30"
                            : "border-white/10 hover:bg-black/80 text-white"
                        }`}
                        title="Túlexpozíció (zebra)"
                      >
                        <AlertTriangle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setShowProPanel((v) => !v)}
                        className={`bg-black/60 backdrop-blur border p-2 rounded-full transition ${
                          showProPanel
                            ? "border-purple-500/50 text-purple-300 ring-2 ring-purple-500/30"
                            : "border-white/10 hover:bg-black/80 text-white"
                        }`}
                        title="Pro vezérlők"
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* === GRID OVERLAY (rule of thirds) === */}
                  {showGrid && (
                    <div className="absolute inset-0 pointer-events-none z-5">
                      <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30" />
                      <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30" />
                      <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30" />
                      <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30" />
                      {/* Középső kereszt pontos fókuszhoz */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <Crosshair className="w-6 h-6 text-emerald-400/60" />
                      </div>
                    </div>
                  )}

                  {/* === ZEBRA OVERLAY (túlexponált területek) === */}
                  {showZebra && overexposedPixels > 0 && (
                    <div className="absolute top-2 right-2 z-20 bg-amber-500/90 text-black text-[10px] font-bold px-2 py-1 rounded">
                      ⚠ {overexposedPixels}% túlexponált
                    </div>
                  )}
                  {showZebra && overexposedPixels > 5 && (
                    <div className="absolute inset-0 pointer-events-none z-5 flex items-center justify-center">
                      <div className="bg-amber-500/20 backdrop-blur-[1px] w-full h-full" style={{ mixBlendMode: "overlay" }} />
                    </div>
                  )}

                  {/* === HISTOGRAM OVERLAY === */}
                  {showHistogram && (
                    <div className="absolute top-12 right-2 z-10 bg-black/70 backdrop-blur rounded-md p-1.5 border border-white/10">
                      <div className="text-[8px] text-slate-300 mb-1 uppercase tracking-wide">Hisztogram</div>
                      <canvas
                        ref={histCanvasRef}
                        width={120}
                        height={50}
                        className="block"
                      />
                      <div className="text-[8px] text-slate-400 mt-0.5 flex justify-between">
                        <span>0</span>
                        <span>255</span>
                      </div>
                    </div>
                  )}

                  {/* === ZOOM SLIDER (közvetlenül a kamera alatt, overlay) === */}
                  <div className="absolute left-3 right-3 bottom-16 z-10">
                    <div className="bg-black/60 backdrop-blur rounded-full px-3 py-1.5 border border-white/10 flex items-center gap-2">
                      <button
                        onClick={() => setZoom((z) => Math.max(1, z - 0.2))}
                        className="text-white hover:text-emerald-300 transition"
                        disabled={!capabilities.zoom}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <div className="flex-1 flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 w-8 font-mono">{zoom.toFixed(1)}x</span>
                        <input
                          type="range"
                          min={1}
                          max={8}
                          step={0.1}
                          value={zoom}
                          onChange={(e) => setZoom(parseFloat(e.target.value))}
                          disabled={!capabilities.zoom}
                          className="flex-1 accent-emerald-500 h-1"
                        />
                      </div>
                      <button
                        onClick={() => setZoom((z) => Math.min(8, z + 0.2))}
                        className="text-white hover:text-emerald-300 transition"
                        disabled={!capabilities.zoom}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {!capabilities.zoom && (
                      <div className="text-[9px] text-amber-300 text-center mt-1 bg-black/60 rounded px-2 py-0.5">
                        Zoom nem támogatott ezen az eszközen
                      </div>
                    )}
                  </div>

                  {/* === ELŐZÁR-IDŐ VISSZASZÁMLÁLÓ === */}
                  {countdown !== null && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm z-30">
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
                        <X className="w-3 h-3 mr-1" />
                        Mégse
                      </Button>
                    </div>
                  )}

                  {/* === PRO VEZÉRLŐK PANEL (lebegő) === */}
                  {showProPanel && (
                    <div className="absolute top-12 left-2 w-56 max-h-[calc(100%-180px)] overflow-y-auto z-20 bg-black/80 backdrop-blur rounded-md p-3 border border-white/10 text-[10px]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-purple-300 uppercase tracking-wide flex items-center gap-1">
                          <Settings2 className="w-3 h-3" /> Pro vezérlők
                        </span>
                        <button
                          onClick={() => setShowProPanel(false)}
                          className="text-slate-400 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Fókusz mód */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-slate-300 flex items-center gap-1">
                            <Focus className="w-3 h-3" /> Fókusz
                          </span>
                          <Switch
                            checked={focusMode === "manual"}
                            onCheckedChange={(v) => setFocusMode(v ? "manual" : "continuous")}
                            disabled={!capabilities.focusDistance}
                          />
                        </div>
                        {focusMode === "manual" && (
                          <div className="mt-1">
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.01}
                              value={focusDistance}
                              onChange={(e) => setFocusDistance(parseFloat(e.target.value))}
                              disabled={!capabilities.focusDistance}
                              className="w-full accent-emerald-500 h-1"
                            />
                            <div className="text-[9px] text-slate-500">
                              Távolság: {(focusDistance * 100).toFixed(0)}%
                            </div>
                          </div>
                        )}
                        {!capabilities.focusDistance && (
                          <div className="text-[9px] text-slate-500">Nem támogatott</div>
                        )}
                      </div>

                      {/* Expozíció kompenzáció */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-slate-300 flex items-center gap-1">
                            <Sun className="w-3 h-3" /> Expozíció
                          </span>
                          <span className="font-mono text-emerald-300">
                            {exposureComp > 0 ? "+" : ""}
                            {exposureComp.toFixed(1)} EV
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-2}
                          max={2}
                          step={0.1}
                          value={exposureComp}
                          onChange={(e) => setExposureComp(parseFloat(e.target.value))}
                          disabled={!capabilities.exposureCompensation}
                          className="w-full accent-emerald-500 h-1"
                        />
                        {!capabilities.exposureCompensation && (
                          <div className="text-[9px] text-slate-500">Nem támogatott</div>
                        )}
                      </div>

                      {/* Fehérmérleg */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-slate-300">Fehérmérleg</span>
                          <span className="font-mono text-emerald-300">
                            {wbMode === "auto" ? "Auto" : `${settings.whiteBalanceK}K`}
                          </span>
                        </div>
                        <select
                          value={wbMode === "auto" ? "auto" : "manual"}
                          onChange={(e) => setWbMode(e.target.value === "auto" ? "auto" : "manual")}
                          disabled={!capabilities.whiteBalanceMode}
                          className="w-full bg-[#080d1a] border border-white/10 text-white text-[10px] p-1 rounded"
                        >
                          <option value="auto">Auto WB</option>
                          <option value="manual">Manuális</option>
                        </select>
                        {!capabilities.whiteBalanceMode && (
                          <div className="text-[9px] text-slate-500">Nem támogatott</div>
                        )}
                      </div>

                      {/* Jelenlegi beállítások összefoglaló */}
                      <div className="pt-2 border-t border-white/10 space-y-1">
                        <div className="text-slate-400 text-[9px] uppercase tracking-wide mb-1">Beállítások</div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">ISO:</span>
                          <span className="font-mono text-white">{settings.iso}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Expozíció:</span>
                          <span className="font-mono text-white">{formatExposure(settings.exposureSeconds)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Blende:</span>
                          <span className="font-mono text-white text-[9px]">{settings.aperture}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Fókusz:</span>
                          <span className="font-mono text-white">
                            {settings.focusMode === "infinity" ? "∞" : settings.focusMode === "manual" ? "M" : "A"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* === ALSÓ SÁV: Capture gombok (overlay) === */}
                  <div className="absolute bottom-3 left-3 right-3 z-10">
                    <div className="flex items-center justify-center gap-3">
                      {/* Bal: Feltöltés */}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-black/60 backdrop-blur border border-white/10 hover:bg-black/80 text-white p-3 rounded-full transition"
                        title="Kép feltöltése"
                      >
                        <Upload className="w-5 h-5" />
                      </button>

                      {/* Közép: Nagy Fotó gomb */}
                      {!isBurst ? (
                        <button
                          onClick={handleSingleCapture}
                          disabled={!stream}
                          className="w-16 h-16 rounded-full bg-white/10 backdrop-blur border-4 border-white/80 hover:border-emerald-400 hover:bg-emerald-500/20 transition flex items-center justify-center disabled:opacity-40"
                          title="Fotó készítése"
                        >
                          <div className="w-12 h-12 rounded-full bg-emerald-500/80 flex items-center justify-center">
                            <Camera className="w-6 h-6 text-white" />
                          </div>
                        </button>
                      ) : (
                        <button
                          onClick={handleStopBurst}
                          className="w-16 h-16 rounded-full bg-red-500/30 backdrop-blur border-4 border-red-400 hover:bg-red-500/50 transition flex items-center justify-center"
                          title="Sorozat leállítása"
                        >
                          <Square className="w-7 h-7 text-red-300" />
                        </button>
                      )}

                      {/* Jobb: Sorozat mód */}
                      <button
                        onClick={isBurst ? handleStopBurst : handleStartBurst}
                        disabled={!stream}
                        className={`bg-black/60 backdrop-blur border p-3 rounded-full transition disabled:opacity-40 ${
                          isBurst
                            ? "border-amber-500/50 text-amber-300 ring-2 ring-amber-500/30"
                            : "border-white/10 hover:bg-black/80 text-white"
                        }`}
                        title="Sorozat mód"
                      >
                        {isBurst ? <Square className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                      </button>
                    </div>

                    {/* Sorozat állapot kijelzés */}
                    {isBurst && (
                      <div className="text-center mt-2 text-[10px] text-amber-300 bg-black/60 backdrop-blur rounded px-2 py-1 inline-block w-full">
                        ⚡ Sorozat: {burstProgress}/{burstTotal}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Rejtett file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* Állapot és tippek */}
            <div className="mt-3 text-center text-[10px] text-slate-400">
              {capturedCount > 0
                ? `${capturedCount} kép mentve ez alkalommal.`
                : "Tipp: a kamera gombsorán a ⊕ és ⊖ gombbal zoomolhatsz, a felső ikonokkal rácsot/hisztogramot/zebrát kapcsolhatsz be."}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Jobb oldali súgó panel */}
      <div className="lg:col-span-1">
        <Card className="bg-[#0c1322] border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-purple-400" />
              Pro funkciók súgó
            </CardTitle>
            <CardDescription className="text-[10px]">
              A vezérlők a kamera ablakán overlay-ként jelennek meg
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 text-xs">
              <ProHelpRow
                icon={<Grid3x3 className="w-3 h-3 text-emerald-400" />}
                title="Rács (rule of thirds)"
                desc="Kompozíciós segédvonalak a kép harmolásához és pontos fókuszhoz."
              />
              <ProHelpRow
                icon={<BarChart3 className="w-3 h-3 text-sky-400" />}
                title="Élő hisztogram"
                desc="Valós idejű fényerő-eloszlás. Ügyelj rá, hogy ne legyen túl a jobb szélen (túlexponált)."
              />
              <ProHelpRow
                icon={<AlertTriangle className="w-3 h-3 text-amber-400" />}
                title="Túlexpozíció figyelmeztetés"
                desc="Jelzi, ha a képen túl sok a kiégett rész (pixelek >240 felett). Csökkentsd az ISO/expozíciót!"
              />
              <ProHelpRow
                icon={<Settings2 className="w-3 h-3 text-purple-400" />}
                title="Pro vezérlők panel"
                desc="Kézi fókusz, expozíció kompenzáció EV-ben, fehérmérleg beállítás. Csak a támogatott eszközökön."
              />
              <ProHelpRow
                icon={<Plus className="w-3 h-3 text-emerald-400" />}
                title="Élő zoom"
                desc="A kamera alatti csúszkával zoomolhatsz 1x-8x között (ha a készülék támogatja)."
              />
              <ProHelpRow
                icon={<Timer className="w-3 h-3 text-amber-400" />}
                title="Előzár-idő"
                desc={`${settings.timerSeconds}s késleltetés az exponáló megnyomása után. Beállítható a Setup tab-on.`}
              />
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

            {/* Eszköz képességek összefoglaló */}
            {stream && (
              <div className="pt-2 border-t border-white/10 space-y-1">
                <div className="text-[9px] text-slate-400 uppercase tracking-wide mb-1">
                  Eszköz képességek
                </div>
                <CapabilityRow name="Kézi fókusz" supported={capabilities.focusDistance} />
                <CapabilityRow name="Expo kompenzáció" supported={capabilities.exposureCompensation} />
                <CapabilityRow name="Zoom" supported={capabilities.zoom} />
                <CapabilityRow name="Vaku" supported={capabilities.torch} />
                <CapabilityRow name="Fehérmérleg" supported={capabilities.whiteBalanceMode} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProHelpRow({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-md bg-[#080d1a] border border-white/5">
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="font-medium text-slate-200">{title}</div>
        <div className="text-[10px] text-slate-400 leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}

function CapabilityRow({
  name,
  supported,
}: {
  name: string;
  supported: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-slate-400">{name}</span>
      <Badge
        variant="outline"
        className={`text-[9px] ${
          supported
            ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/10"
            : "border-slate-500/30 text-slate-500 bg-slate-500/10"
        }`}
      >
        {supported ? "✓ Támogatott" : "✗ Nem elérhető"}
      </Badge>
    </div>
  );
}
