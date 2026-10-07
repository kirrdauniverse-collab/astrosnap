"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Camera,
  CameraOff,
  Upload,
  Moon,
  Sun,
  SunMedium,
  Trash2,
  Image as ImageIcon,
  Play,
  Square,
} from "lucide-react";
import type {
  AstroSettings,
  CalibrationType,
  StoredImage,
} from "@/lib/astro/types";
import {
  saveImage,
  genId,
  listImages,
  deleteImage,
} from "@/lib/storage/db";
import {
  imageToImageData,
  imageDataToBlob,
  imageDataToThumbnail,
} from "@/lib/processing/stacking";

interface CalibrationTabProps {
  settings: AstroSettings;
  onCaptured: () => void;
}

const CALIBRATION_INFO: Record<
  CalibrationType,
  { label: string; emoji: string; description: string; instruction: string; icon: React.ReactNode }
> = {
  dark: {
    label: "Dark frame",
    emoji: "🌑",
    description:
      "Sötét expozíció ugyanazokkal a beállításokkal mint a light frame-ek, de a lencse/fedő lefedve.",
    instruction:
      "Helyezd a fényképezőt sötétbe (fedd le a lencsét) és készíts ugyanolyan expozíciójú képeket, mint a normál felvételek.",
    icon: <Moon className="w-4 h-4" />,
  },
  flat: {
    label: "Flat frame",
    emoji: "🔆",
    description:
      "Egyenletes megvilágítású kép a vignettálás és a por foltok korrigálásához.",
    instruction:
      "Világítsd meg egyenletesen a lencsét (pl. fehér képernyővel, ég derengése alatt) és készíts rövid expozíciójú képeket.",
    icon: <SunMedium className="w-4 h-4" />,
  },
  bias: {
    label: "Bias frame (Offset)",
    emoji: "⚡",
    description:
      "A szenzor beépített elektronikai zajának mérése a lehető legrövidebb expozícióval.",
    instruction:
      "Fedd le a lencsét, állítsd a legrövidebb expozícióra (pl. 1/4000s), ISO maradjon ugyanaz.",
    icon: <Sun className="w-4 h-4" />,
  },
  light: {
    label: "Light frame",
    emoji: "📷",
    description:
      "Normál asztrofotó kép (a tényleges célpont). Ezeket stackeljük össze.",
    instruction: "Ezeket a Felvétel tabon készítsd.",
    icon: <Camera className="w-4 h-4" />,
  },
};

export function CalibrationTab({ settings, onCaptured }: CalibrationTabProps) {
  const [activeType, setActiveType] = useState<CalibrationType>("dark");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [burstCount, setBurstCount] = useState(10);
  const [isBurst, setIsBurst] = useState(false);
  const [burstProgress, setBurstProgress] = useState(0);
  const [frames, setFrames] = useState<StoredImage[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const burstIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Képek betöltése
  const refreshFrames = useCallback(async () => {
    try {
      const all = await listImages();
      setFrames(all.filter((f) => f.type === activeType));
    } catch (e) {
      console.error(e);
    }
  }, [activeType]);

  useEffect(() => {
    refreshFrames();
  }, [refreshFrames]);

  // Kamera indítása
  const startCamera = useCallback(async () => {
    setError(null);
    try {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 4096 },
          height: { ideal: 3072 },
        },
        audio: false,
      });
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
    } catch (e: unknown) {
      const err = e as Error;
      setError(err.message);
    }
  }, [stream]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (burstIntervalRef.current) {
        clearInterval(burstIntervalRef.current);
      }
    };
  }, [stream]);

  // Capture egy frame-et a megadott típussal
  const captureFrame = useCallback(async (): Promise<StoredImage | null> => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const blob = await imageDataToBlob(imageData);
    const thumbnail = await imageDataToThumbnail(imageData, 240);

    const stored: StoredImage = {
      id: genId(activeType),
      type: activeType,
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
        label: `${CALIBRATION_INFO[activeType].label} • ${new Date().toLocaleTimeString(
          "hu-HU"
        )}`,
      },
    };

    await saveImage(stored);
    return stored;
  }, [activeType, settings]);

  const handleSingleCapture = useCallback(async () => {
    if (!stream) {
      toast({
        title: "Kamera nem aktív",
        description: "Indítsd el a kamerát először",
        variant: "destructive",
      });
      return;
    }
    const img = await captureFrame();
    if (img) {
      onCaptured();
      refreshFrames();
      toast({
        title: `${CALIBRATION_INFO[activeType].label} mentve`,
        description: `ISO ${settings.iso} • ${settings.exposureSeconds}s`,
      });
    }
  }, [stream, captureFrame, activeType, settings, onCaptured, refreshFrames, toast]);

  const handleStartBurst = useCallback(async () => {
    if (!stream) {
      toast({
        title: "Kamera nem aktív",
        description: "Indítsd el a kamerát először",
        variant: "destructive",
      });
      return;
    }
    setIsBurst(true);
    setBurstProgress(0);

    let count = 0;
    await captureFrame();
    count++;
    setBurstProgress(count);
    onCaptured();
    refreshFrames();

    burstIntervalRef.current = setInterval(async () => {
      await captureFrame();
      count++;
      setBurstProgress(count);
      onCaptured();
      refreshFrames();
      if (count >= burstCount) {
        if (burstIntervalRef.current) {
          clearInterval(burstIntervalRef.current);
          burstIntervalRef.current = null;
        }
        setIsBurst(false);
        toast({
          title: "Sorozat kész",
          description: `${count} ${CALIBRATION_INFO[activeType].label} mentve`,
        });
      }
    }, Math.max(500, settings.intervalSeconds * 1000));
  }, [
    stream,
    burstCount,
    captureFrame,
    activeType,
    settings,
    onCaptured,
    refreshFrames,
    toast,
  ]);

  const handleStopBurst = useCallback(() => {
    if (burstIntervalRef.current) {
      clearInterval(burstIntervalRef.current);
      burstIntervalRef.current = null;
    }
    setIsBurst(false);
    toast({
      title: "Leállítva",
      description: `${burstProgress} kép mentve`,
    });
  }, [burstProgress, toast]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const blob = file;
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
            id: genId(activeType),
            type: activeType,
            blob,
            thumbnail,
            capturedAt: Date.now() + i,
            settings: {
              iso: settings.iso,
              exposureSeconds: settings.exposureSeconds,
            },
            metadata: {
              width: data.width,
              height: data.height,
              iso: settings.iso,
              exposureSeconds: settings.exposureSeconds,
              label: `${file.name}`,
            },
          };
          await saveImage(stored);
          URL.revokeObjectURL(url);
        } catch (err) {
          console.error(err);
        }
      }
      onCaptured();
      refreshFrames();
      toast({
        title: "Képek betöltve",
        description: `${files.length} ${CALIBRATION_INFO[activeType].label} mentve`,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [activeType, settings, onCaptured, refreshFrames, toast]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteImage(id);
      refreshFrames();
      onCaptured();
      toast({ title: "Kép törölve" });
    },
    [refreshFrames, onCaptured, toast]
  );

  const info = CALIBRATION_INFO[activeType];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Bal: Kamera és rögzítés */}
      <div className="lg:col-span-2">
        <Card className="bg-[#0c1322] border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {info.icon}
              <span className="text-xl mr-1">{info.emoji}</span>
              {info.label} rögzítés
            </CardTitle>
            <CardDescription className="text-xs">
              {info.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              value={activeType}
              onValueChange={(v) => setActiveType(v as CalibrationType)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-3 w-full bg-[#080d1a] border border-white/5">
                <TabsTrigger value="dark" className="text-xs">
                  🌑 Dark
                </TabsTrigger>
                <TabsTrigger value="flat" className="text-xs">
                  🔆 Flat
                </TabsTrigger>
                <TabsTrigger value="bias" className="text-xs">
                  ⚡ Bias
                </TabsTrigger>
              </TabsList>

              <TabsContent value={activeType} className="mt-4 space-y-4">
                {/* Instruction */}
                <div className="p-3 rounded-md bg-amber-500/5 border border-amber-500/20 text-xs text-amber-200/90">
                  <strong className="font-medium">Hogyan:</strong> {info.instruction}
                </div>

                {/* Viewfinder */}
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
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                      <CameraOff className="w-12 h-12 text-slate-500 mb-3" />
                      <p className="text-xs text-slate-400 mb-4">
                        {error ? `Hiba: ${error}` : "Kamera nem aktív"}
                      </p>
                      <Button
                        onClick={startCamera}
                        size="sm"
                        className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30"
                      >
                        <Camera className="w-4 h-4 mr-1" />
                        Kamera indítása
                      </Button>
                    </div>
                  )}

                  {isBurst && (
                    <div className="absolute top-2 left-2 right-2 bg-black/60 backdrop-blur rounded-md p-2 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-emerald-300">
                          ⚡ {info.label} sorozat
                        </span>
                        <span className="font-mono">
                          {burstProgress}/{burstCount}
                        </span>
                      </div>
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 transition-all"
                          style={{
                            width: `${(burstProgress / burstCount) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Burst count slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Sorozat képek száma</Label>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {burstCount} db
                    </Badge>
                  </div>
                  <input
                    type="range"
                    value={burstCount}
                    onChange={(e) => setBurstCount(parseInt(e.target.value))}
                    min={5}
                    max={50}
                    step={1}
                    className="w-full accent-emerald-500"
                  />
                </div>

                {/* Capture buttons */}
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    onClick={handleSingleCapture}
                    disabled={!stream}
                    className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40"
                  >
                    <Camera className="w-4 h-4 mr-1" />
                    1 kép
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
                    Feltölt
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

                {stream && (
                  <Button
                    onClick={stopCamera}
                    variant="outline"
                    size="sm"
                    className="w-full border-red-500/30 text-red-300 hover:bg-red-500/10"
                  >
                    <CameraOff className="w-3 h-3 mr-1" />
                    Kamera leállítása
                  </Button>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Jobb: Meglévő frame-ek listája */}
      <div className="lg:col-span-1">
        <Card className="bg-[#0c1322] border-white/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-sky-400" />
                  {info.label} képek
                </CardTitle>
                <CardDescription className="text-[10px]">
                  {frames.length} darab elmentve
                </CardDescription>
              </div>
              {frames.length > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  Kész
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96">
              {frames.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Még nincs {info.label} kép.
                  <br />
                  Készíts egyet a kamerával vagy tölts fel.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 pr-2">
                  {frames.map((f) => (
                    <FrameCard
                      key={f.id}
                      frame={f}
                      onDelete={() => handleDelete(f.id)}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FrameCard({
  frame,
  onDelete,
}: {
  frame: StoredImage;
  onDelete: () => void;
}) {
  const thumbUrl = useMemo(() => URL.createObjectURL(frame.thumbnail), [frame.thumbnail]);
  useEffect(() => {
    return () => URL.revokeObjectURL(thumbUrl);
  }, [thumbUrl]);

  return (
    <div className="relative group rounded-md overflow-hidden border border-white/10 bg-[#080d1a]">
      <div className="aspect-square">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={frame.metadata?.label ?? "frame"}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-white/5" />
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-1.5 text-[9px]">
        <div className="font-mono truncate">
          ISO {frame.metadata?.iso ?? "?"} • {frame.metadata?.exposureSeconds ?? "?"}s
        </div>
        <div className="text-slate-400 truncate">
          {new Date(frame.capturedAt).toLocaleTimeString("hu-HU", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </div>
      </div>
      <button
        onClick={onDelete}
        className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-500 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Törlés"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}
