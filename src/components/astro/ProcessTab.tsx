"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Layers,
  Wand2,
  Palette,
  Play,
  Save,
  Download,
  Image as ImageIcon,
  RotateCw,
  Sparkles,
  AlignCenter,
  Moon,
  SunMedium,
  Sun,
  Camera,
  FileImage,
} from "lucide-react";
import type {
  ColorSettings,
  StackOptions,
  StoredImage,
} from "@/lib/astro/types";
import { defaultColorSettings, defaultStackOptions } from "@/lib/astro/types";
import {
  listImages,
  saveImage,
  deleteImage,
  genId,
  blobToUrl,
} from "@/lib/storage/db";
import {
  applyColorCorrection,
  imageDataToBlob,
  imageDataToThumbnail,
  imageToImageData,
  loadImageFromBlob,
  loadStoredImagesAsImageData,
  stackImages,
} from "@/lib/processing/stacking";

type Step = "select" | "stack" | "color" | "done";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  light: <Camera className="w-3 h-3" />,
  dark: <Moon className="w-3 h-3" />,
  flat: <SunMedium className="w-3 h-3" />,
  bias: <Sun className="w-3 h-3" />,
  result: <FileImage className="w-3 h-3" />,
  light_stack: <Layers className="w-3 h-3" />,
};

export function ProcessTab() {
  const [step, setStep] = useState<Step>("select");
  const [allImages, setAllImages] = useState<StoredImage[]>([]);
  const [selectedLights, setSelectedLights] = useState<Set<string>>(new Set());
  const [selectedDarkId, setSelectedDarkId] = useState<string>("");
  const [selectedFlatId, setSelectedFlatId] = useState<string>("");
  const [selectedBiasId, setSelectedBiasId] = useState<string>("");
  const [stackOptions, setStackOptions] = useState<StackOptions>(defaultStackOptions);
  const [colorSettings, setColorSettings] = useState<ColorSettings>(defaultColorSettings);
  const [stackedImage, setStackedImage] = useState<ImageData | null>(null);
  const [resultImageUrl, setResultImageUrl] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [savedResultId, setSavedResultId] = useState<string>("");

  const resultCanvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  const refresh = useCallback(async () => {
    try {
      const all = await listImages();
      setAllImages(all);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Minden fényképet betöltünk feldolgozásra
  const lights = allImages.filter((i) => i.type === "light" || i.type === "light_stack");
  const darks = allImages.filter((i) => i.type === "dark");
  const flats = allImages.filter((i) => i.type === "flat");
  const biases = allImages.filter((i) => i.type === "bias");

  // Választott vagy legutóbbi stackelt eredmény megjelenítése
  useEffect(() => {
    if (!stackedImage) return;
    if (resultImageUrl) URL.revokeObjectURL(resultImageUrl);
    const canvas = document.createElement("canvas");
    canvas.width = stackedImage.width;
    canvas.height = stackedImage.height;
    canvas.getContext("2d")!.putImageData(stackedImage, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        setResultImageUrl(url);
      }
    }, "image/png");
  }, [stackedImage, resultImageUrl]);

  // Színkorrekció élő alkalmazása a stackelt képre
  const applyColorPreview = useCallback(
    async (cs: ColorSettings) => {
      if (!stackedImage) return;
      const corrected = applyColorCorrection(stackedImage, cs);
      if (resultImageUrl) URL.revokeObjectURL(resultImageUrl);
      const canvas = document.createElement("canvas");
      canvas.width = corrected.width;
      canvas.height = corrected.height;
      canvas.getContext("2d")!.putImageData(corrected, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          setResultImageUrl(url);
        }
      }, "image/png");
    },
    [stackedImage, resultImageUrl]
  );

  // Kiválasztott képek toggle
  const toggleLight = useCallback((id: string) => {
    setSelectedLights((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Összes light választása
  const selectAllLights = useCallback(() => {
    setSelectedLights(new Set(lights.map((l) => l.id)));
  }, [lights]);

  // Stackelés indítása
  const handleStack = useCallback(async () => {
    if (selectedLights.size < 2) {
      toast({
        title: "Túl kevés kép",
        description: "Legalább 2 light frame szükséges az egybeillesztéshez",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setProgressMsg("Képek betöltése...");

    try {
      const lightImages = lights.filter((l) => selectedLights.has(l.id));
      const lightData = await loadStoredImagesAsImageData(
        lightImages,
        2048,
        (p, msg) => {
          setProgress(p * 0.3);
          setProgressMsg(msg);
        }
      );

      // Kalibrációs frame-ek betöltése
      let darkData: ImageData | undefined;
      let flatData: ImageData | undefined;
      let biasData: ImageData | undefined;

      if (stackOptions.useDarkFrame && selectedDarkId) {
        const darkImg = darks.find((d) => d.id === selectedDarkId);
        if (darkImg) {
          const img = await loadImageFromBlob(darkImg.blob);
          darkData = imageToImageData(img, 2048);
        }
      }
      if (stackOptions.useFlatFrame && selectedFlatId) {
        const flatImg = flats.find((d) => d.id === selectedFlatId);
        if (flatImg) {
          const img = await loadImageFromBlob(flatImg.blob);
          flatData = imageToImageData(img, 2048);
        }
      }
      if (stackOptions.useBiasFrame && selectedBiasId) {
        const biasImg = biases.find((d) => d.id === selectedBiasId);
        if (biasImg) {
          const img = await loadImageFromBlob(biasImg.blob);
          biasData = imageToImageData(img, 2048);
        }
      }

      const result = await stackImages({
        lights: lightData,
        dark: darkData,
        flat: flatData,
        bias: biasData,
        options: stackOptions,
        onProgress: (p, msg) => {
          setProgress(0.3 + p * 0.7);
          setProgressMsg(msg);
        },
      });

      setStackedImage(result);
      setStep("stack");
      setProgress(1);
      setProgressMsg("Kész!");
      toast({
        title: "Stackelés kész!",
        description: `${lightData.length} kép egybeillesztve • ${result.width}×${result.height}`,
      });
    } catch (e) {
      const err = e as Error;
      toast({
        title: "Hiba",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [
    selectedLights,
    lights,
    darks,
    flats,
    biases,
    selectedDarkId,
    selectedFlatId,
    selectedBiasId,
    stackOptions,
    toast,
  ]);

  // Mentés könyvtárba
  const handleSaveResult = useCallback(async () => {
    if (!stackedImage) return;
    // Alkalmazzuk a színkorrekciót is ha vannak módosítások
    const finalImage =
      colorSettings.autoLevels ||
      colorSettings.temperatureK !== 0 ||
      colorSettings.tint !== 0 ||
      colorSettings.exposureEv !== 0 ||
      colorSettings.contrast !== 0 ||
      colorSettings.highlights !== 0 ||
      colorSettings.shadows !== 0 ||
      colorSettings.saturation !== 0 ||
      colorSettings.vibrance !== 0 ||
      colorSettings.gamma !== 1.0 ||
      colorSettings.blackPoint !== 0 ||
      colorSettings.whitePoint !== 100
        ? applyColorCorrection(stackedImage, colorSettings)
        : stackedImage;

    const blob = await imageDataToBlob(finalImage);
    const thumbnail = await imageDataToThumbnail(finalImage, 240);
    const id = genId("result");
    const stored: StoredImage = {
      id,
      type: "result",
      blob,
      thumbnail,
      capturedAt: Date.now(),
      metadata: {
        width: finalImage.width,
        height: finalImage.height,
        label: `Eredmény • ${new Date().toLocaleString("hu-HU", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}`,
        stackCount: selectedLights.size,
      },
    };
    await saveImage(stored);
    setSavedResultId(id);
    refresh();
    toast({
      title: "Eredmény mentve",
      description: "A feldolgozott kép elérhető a Könyvtárban",
    });
  }, [stackedImage, colorSettings, selectedLights.size, refresh, toast]);

  // Letöltés
  const handleDownload = useCallback(async () => {
    if (!stackedImage) return;
    const finalImage = applyColorCorrection(stackedImage, colorSettings);
    const blob = await imageDataToBlob(finalImage);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `astrosnap_result_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [stackedImage, colorSettings]);

  const toggleLightHandler = useCallback(
    (id: string) => {
      toggleLight(id);
    },
    [toggleLight]
  );

  return (
    <div className="space-y-4">
      {/* Lépés indikátor */}
      <Card className="bg-[#0c1322] border-white/10">
        <CardContent className="py-3">
          <div className="flex items-center justify-between gap-2">
            <StepIndicator current={step} />
          </div>
          {isProcessing && (
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{progressMsg}</span>
                <span className="font-mono text-emerald-300">
                  {Math.round(progress * 100)}%
                </span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-300"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {step === "select" && (
        <SelectionStep
          lights={lights}
          darks={darks}
          flats={flats}
          biases={biases}
          selectedLights={selectedLights}
          selectedDarkId={selectedDarkId}
          selectedFlatId={selectedFlatId}
          selectedBiasId={selectedBiasId}
          stackOptions={stackOptions}
          onToggleLight={toggleLightHandler}
          onSelectAllLights={selectAllLights}
          onClearLights={() => setSelectedLights(new Set())}
          onDarkChange={setSelectedDarkId}
          onFlatChange={setSelectedFlatId}
          onBiasChange={setSelectedBiasId}
          onStackOptionsChange={setStackOptions}
          onStack={handleStack}
          isProcessing={isProcessing}
        />
      )}

      {step === "stack" && (
        <ResultStep
          imageUrl={resultImageUrl}
          stackInfo={{
            count: selectedLights.size,
            width: stackedImage?.width ?? 0,
            height: stackedImage?.height ?? 0,
          }}
          colorSettings={colorSettings}
          onColorChange={(cs) => {
            setColorSettings(cs);
            applyColorPreview(cs);
          }}
          onSave={handleSaveResult}
          onDownload={handleDownload}
          onResetColors={() => {
            setColorSettings(defaultColorSettings);
            applyColorPreview(defaultColorSettings);
          }}
          onBackToSelect={() => setStep("select")}
          savedId={savedResultId}
        />
      )}
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const steps: { id: Step; label: string; icon: React.ReactNode }[] = [
    { id: "select", label: "Képek kiválasztása", icon: <ImageIcon className="w-4 h-4" /> },
    { id: "stack", label: "Eredmény & színkorrekció", icon: <Palette className="w-4 h-4" /> },
  ];
  const currentIdx = steps.findIndex((s) => s.id === current);

  return (
    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2 sm:gap-3">
          <div
            className={`flex items-center gap-2 px-2 py-1 rounded-md text-xs ${
              i <= currentIdx
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "bg-white/5 text-slate-400 border border-white/10"
            }`}
          >
            <span>{s.icon}</span>
            <span className="hidden sm:inline">{i + 1}. {s.label}</span>
            <span className="sm:hidden">{i + 1}</span>
          </div>
          {i < steps.length - 1 && (
            <div className="w-4 sm:w-8 h-px bg-white/20" />
          )}
        </div>
      ))}
    </div>
  );
}

// ----- 1. lépés: Képek kiválasztása -----
interface SelectionStepProps {
  lights: StoredImage[];
  darks: StoredImage[];
  flats: StoredImage[];
  biases: StoredImage[];
  selectedLights: Set<string>;
  selectedDarkId: string;
  selectedFlatId: string;
  selectedBiasId: string;
  stackOptions: StackOptions;
  onToggleLight: (id: string) => void;
  onSelectAllLights: () => void;
  onClearLights: () => void;
  onDarkChange: (id: string) => void;
  onFlatChange: (id: string) => void;
  onBiasChange: (id: string) => void;
  onStackOptionsChange: (opts: StackOptions) => void;
  onStack: () => void;
  isProcessing: boolean;
}

function SelectionStep(props: SelectionStepProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Bal: Light frame-ek kiválasztása */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="bg-[#0c1322] border-white/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Camera className="w-4 h-4 text-emerald-400" />
                  Light frame-ek kiválasztása
                </CardTitle>
                <CardDescription className="text-xs">
                  {props.selectedLights.size} / {props.lights.length} kiválasztva
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={props.onSelectAllLights}
                  disabled={props.lights.length === 0}
                  className="border-white/20 text-slate-200 hover:bg-white/5 h-8"
                >
                  Mind
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={props.onClearLights}
                  disabled={props.selectedLights.size === 0}
                  className="border-white/20 text-slate-200 hover:bg-white/5 h-8"
                >
                  Egyik sem
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {props.lights.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                Nincs light frame.
                <br />
                Készíts képeket a Felvétel tabon.
              </div>
            ) : (
              <ScrollArea className="h-72">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 pr-2">
                  {props.lights.map((img) => (
                    <SelectableImage
                      key={img.id}
                      img={img}
                      selected={props.selectedLights.has(img.id)}
                      onToggle={() => props.onToggleLight(img.id)}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Jobb: Beállítások */}
      <div className="space-y-4">
        <Card className="bg-[#0c1322] border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-amber-400" />
              Stackelési opciók
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1">
                <AlignCenter className="w-3 h-3" />
                Igazítás (auto offset)
              </Label>
              <Switch
                checked={props.stackOptions.alignImages}
                onCheckedChange={(v) =>
                  props.onStackOptionsChange({
                    ...props.stackOptions,
                    alignImages: v,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Kombinálási módszer</Label>
              <Select
                value={props.stackOptions.method}
                onValueChange={(v) =>
                  props.onStackOptionsChange({
                    ...props.stackOptions,
                    method: v as StackOptions["method"],
                  })
                }
              >
                <SelectTrigger className="bg-[#080d1a] border-white/10 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0c1322] border-white/10">
                  <SelectItem value="average" className="text-xs">
                    Átlag (gyors, alapértelmezett)
                  </SelectItem>
                  <SelectItem value="median" className="text-xs">
                    Medián (jobban kiszűri az outliereket)
                  </SelectItem>
                  <SelectItem value="sigma_clip" className="text-xs">
                    Sigma-clip (legjobb minőség, lassú)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator className="bg-white/10" />

            <div className="space-y-2">
              <Label className="text-xs">Manuális forgatás (fok)</Label>
              <Slider
                value={[props.stackOptions.manualRotationDeg]}
                onValueChange={(v) =>
                  props.onStackOptionsChange({
                    ...props.stackOptions,
                    manualRotationDeg: v[0],
                  })
                }
                min={-180}
                max={180}
                step={0.5}
              />
              <div className="text-[10px] text-slate-500 font-mono text-center">
                {props.stackOptions.manualRotationDeg.toFixed(1)}°
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">X eltolás</Label>
                <Slider
                  value={[props.stackOptions.manualOffsetX]}
                  onValueChange={(v) =>
                    props.onStackOptionsChange({
                      ...props.stackOptions,
                      manualOffsetX: v[0],
                    })
                  }
                  min={-100}
                  max={100}
                  step={1}
                />
              </div>
              <div>
                <Label className="text-[10px]">Y eltolás</Label>
                <Slider
                  value={[props.stackOptions.manualOffsetY]}
                  onValueChange={(v) =>
                    props.onStackOptionsChange({
                      ...props.stackOptions,
                      manualOffsetY: v[0],
                    })
                  }
                  min={-100}
                  max={100}
                  step={1}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Kalibrációs frame-ek */}
        <Card className="bg-[#0c1322] border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400" />
              Kalibrációs frame-ek
            </CardTitle>
            <CardDescription className="text-[10px]">
              Opcionális - zajredukcióhoz
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <CalibrationPicker
              label="Dark frame"
              icon={<Moon className="w-3 h-3" />}
              images={props.darks}
              value={props.selectedDarkId}
              onChange={props.onDarkChange}
              onToggle={(checked) => {
                props.onStackOptionsChange({
                  ...props.stackOptions,
                  useDarkFrame: checked,
                });
                if (!checked) props.onDarkChange("");
              }}
              enabled={props.stackOptions.useDarkFrame}
              count={props.darks.length}
            />
            <CalibrationPicker
              label="Flat frame"
              icon={<SunMedium className="w-3 h-3" />}
              images={props.flats}
              value={props.selectedFlatId}
              onChange={props.onFlatChange}
              onToggle={(checked) => {
                props.onStackOptionsChange({
                  ...props.stackOptions,
                  useFlatFrame: checked,
                });
                if (!checked) props.onFlatChange("");
              }}
              enabled={props.stackOptions.useFlatFrame}
              count={props.flats.length}
            />
            <CalibrationPicker
              label="Bias frame"
              icon={<Sun className="w-3 h-3" />}
              images={props.biases}
              value={props.selectedBiasId}
              onChange={props.onBiasChange}
              onToggle={(checked) => {
                props.onStackOptionsChange({
                  ...props.stackOptions,
                  useBiasFrame: checked,
                });
                if (!checked) props.onBiasChange("");
              }}
              enabled={props.stackOptions.useBiasFrame}
              count={props.biases.length}
            />
          </CardContent>
        </Card>

        <Button
          onClick={props.onStack}
          disabled={props.isProcessing || props.selectedLights.size < 2}
          className="w-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40"
        >
          <Play className="w-4 h-4 mr-2" />
          {props.isProcessing
            ? "Feldolgozás..."
            : `Stackelés (${props.selectedLights.size} képpel)`}
        </Button>
      </div>
    </div>
  );
}

function CalibrationPicker({
  label,
  icon,
  images,
  value,
  onChange,
  onToggle,
  enabled,
  count,
}: {
  label: string;
  icon: React.ReactNode;
  images: StoredImage[];
  value: string;
  onChange: (id: string) => void;
  onToggle: (checked: boolean) => void;
  enabled: boolean;
  count: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs flex items-center gap-1">
          {icon}
          {label}
        </Label>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[9px] font-mono">
            {count} db
          </Badge>
          <Switch checked={enabled} onCheckedChange={onToggle} />
        </div>
      </div>
      {enabled && (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="bg-[#080d1a] border-white/10 h-8 text-xs">
            <SelectValue placeholder="-- válassz --" />
          </SelectTrigger>
          <SelectContent className="bg-[#0c1322] border-white/10">
            {images.length === 0 ? (
              <SelectItem value="_none" disabled>
                Nincs elérhető
              </SelectItem>
            ) : (
              images.map((img) => (
                <SelectItem key={img.id} value={img.id} className="text-xs">
                  {new Date(img.capturedAt).toLocaleString("hu-HU", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {img.metadata?.iso ? ` • ISO ${img.metadata.iso}` : ""}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function SelectableImage({
  img,
  selected,
  onToggle,
}: {
  img: StoredImage;
  selected: boolean;
  onToggle: () => void;
}) {
  const thumbUrl = useMemo(() => URL.createObjectURL(img.thumbnail), [img.thumbnail]);
  useEffect(() => {
    return () => URL.revokeObjectURL(thumbUrl);
  }, [thumbUrl]);

  return (
    <button
      onClick={onToggle}
      className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all ${
        selected
          ? "border-emerald-400 ring-2 ring-emerald-400/30"
          : "border-white/10 hover:border-white/30"
      }`}
    >
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt={img.metadata?.label ?? "kép"}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-white/5" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
      <div className="absolute bottom-1 left-1 right-1 text-[8px] text-slate-300 font-mono">
        <div className="truncate">{img.metadata?.iso ? `ISO ${img.metadata.iso}` : ""}</div>
        <div className="truncate text-slate-400">
          {img.metadata?.exposureSeconds ? `${img.metadata.exposureSeconds}s` : ""}
        </div>
      </div>
      {selected && (
        <div className="absolute top-1 right-1 bg-emerald-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
          ✓
        </div>
      )}
    </button>
  );
}

// ----- 2. lépés: Eredmény + színkorrekció -----
interface ResultStepProps {
  imageUrl: string;
  stackInfo: { count: number; width: number; height: number };
  colorSettings: ColorSettings;
  onColorChange: (cs: ColorSettings) => void;
  onSave: () => void;
  onDownload: () => void;
  onResetColors: () => void;
  onBackToSelect: () => void;
  savedId: string;
}

function ResultStep(props: ResultStepProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Bal: Eredmény nagy képe */}
      <div className="lg:col-span-2">
        <Card className="bg-[#0c1322] border-white/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  Feldolgozott eredmény
                </CardTitle>
                <CardDescription className="text-xs">
                  {props.stackInfo.count} kép stackelve • {props.stackInfo.width}×
                  {props.stackInfo.height}px
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={props.onBackToSelect}
                  className="border-white/20 text-slate-200 hover:bg-white/5 h-8"
                >
                  Vissza
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="aspect-video bg-black rounded-lg overflow-hidden border border-white/10 flex items-center justify-center">
              {props.imageUrl ? (
                <img
                  src={props.imageUrl}
                  alt="Eredmény"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <div className="text-slate-500 text-sm">Nincs eredmény</div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3">
              <Button
                onClick={props.onSave}
                className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30"
              >
                <Save className="w-4 h-4 mr-1" />
                Mentés
              </Button>
              <Button
                onClick={props.onDownload}
                variant="outline"
                className="border-sky-500/30 text-sky-300 hover:bg-sky-500/10"
              >
                <Download className="w-4 h-4 mr-1" />
                Letöltés
              </Button>
              <Button
                onClick={props.onResetColors}
                variant="outline"
                className="border-white/20 text-slate-200 hover:bg-white/5"
              >
                <RotateCw className="w-4 h-4 mr-1" />
                Reset
              </Button>
            </div>

            {props.savedId && (
              <div className="mt-2 text-center text-[10px] text-emerald-300">
                ✓ Mentve a Könyvtárba
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Jobb: Színkorrekció */}
      <div>
        <Card className="bg-[#0c1322] border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Palette className="w-4 h-4 text-pink-400" />
              Színkorrekció
            </CardTitle>
            <CardDescription className="text-[10px]">
              Élő előnézet a változtatásokkal
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Auto levels */}
            <div className="flex items-center justify-between p-2 rounded-md bg-[#080d1a] border border-white/5">
              <Label className="text-xs flex items-center gap-1">
                <Wand2 className="w-3 h-3" />
                Auto levels (hisztogram)
              </Label>
              <Switch
                checked={props.colorSettings.autoLevels}
                onCheckedChange={(v) =>
                  props.onColorChange({ ...props.colorSettings, autoLevels: v })
                }
              />
            </div>

            <ColorSlider
              label="Hőmérséklet (K)"
              value={props.colorSettings.temperatureK}
              min={-100}
              max={100}
              step={1}
              onChange={(v) =>
                props.onColorChange({ ...props.colorSettings, temperatureK: v })
              }
              suffix=""
              hint={props.colorSettings.temperatureK > 0 ? "melegebb" : "hidegebb"}
            />

            <ColorSlider
              label="Színárnyalat (tint)"
              value={props.colorSettings.tint}
              min={-100}
              max={100}
              step={1}
              onChange={(v) =>
                props.onColorChange({ ...props.colorSettings, tint: v })
              }
              hint={props.colorSettings.tint > 0 ? "magenta" : "zöld"}
            />

            <ColorSlider
              label="Expozíció (EV)"
              value={props.colorSettings.exposureEv * 100}
              min={-200}
              max={200}
              step={10}
              onChange={(v) =>
                props.onColorChange({
                  ...props.colorSettings,
                  exposureEv: v / 100,
                })
              }
              suffix=" EV"
              hint=""
            />

            <ColorSlider
              label="Kontraszt"
              value={props.colorSettings.contrast}
              min={-100}
              max={100}
              step={1}
              onChange={(v) =>
                props.onColorChange({ ...props.colorSettings, contrast: v })
              }
              suffix=""
              hint=""
            />

            <ColorSlider
              label="Csúcsfény (highlights)"
              value={props.colorSettings.highlights}
              min={-100}
              max={100}
              step={1}
              onChange={(v) =>
                props.onColorChange({ ...props.colorSettings, highlights: v })
              }
              suffix=""
              hint=""
            />

            <ColorSlider
              label="Árnyékok (shadows)"
              value={props.colorSettings.shadows}
              min={-100}
              max={100}
              step={1}
              onChange={(v) =>
                props.onColorChange({ ...props.colorSettings, shadows: v })
              }
              suffix=""
              hint=""
            />

            <ColorSlider
              label="Telítettség"
              value={props.colorSettings.saturation}
              min={-100}
              max={100}
              step={1}
              onChange={(v) =>
                props.onColorChange({ ...props.colorSettings, saturation: v })
              }
              suffix=""
              hint=""
            />

            <ColorSlider
              label="Vibrance"
              value={props.colorSettings.vibrance}
              min={-100}
              max={100}
              step={1}
              onChange={(v) =>
                props.onColorChange({ ...props.colorSettings, vibrance: v })
              }
              suffix=""
              hint=""
            />

            <ColorSlider
              label="Gamma"
              value={props.colorSettings.gamma * 100}
              min={50}
              max={200}
              step={1}
              onChange={(v) =>
                props.onColorChange({
                  ...props.colorSettings,
                  gamma: v / 100,
                })
              }
              suffix=""
              hint=""
            />

            {!props.colorSettings.autoLevels && (
              <>
                <ColorSlider
                  label="Fekete pont"
                  value={props.colorSettings.blackPoint}
                  min={0}
                  max={50}
                  step={1}
                  onChange={(v) =>
                    props.onColorChange({ ...props.colorSettings, blackPoint: v })
                  }
                  suffix="%"
                  hint=""
                />
                <ColorSlider
                  label="Fehér pont"
                  value={props.colorSettings.whitePoint}
                  min={50}
                  max={100}
                  step={1}
                  onChange={(v) =>
                    props.onColorChange({ ...props.colorSettings, whitePoint: v })
                  }
                  suffix="%"
                  hint=""
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ColorSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix: string;
  hint: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-slate-300">{label}</Label>
        <div className="flex items-center gap-1">
          {hint && (
            <span className="text-[9px] text-slate-500">{hint}</span>
          )}
          <Badge variant="outline" className="text-[9px] font-mono">
            {value > 0 ? "+" : ""}
            {value}
            {suffix}
          </Badge>
        </div>
      </div>
      <Slider
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
        min={min}
        max={max}
        step={step}
        className="py-1"
      />
    </div>
  );
}
