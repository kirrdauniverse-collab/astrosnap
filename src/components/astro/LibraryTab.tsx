"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Trash2,
  Download,
  Image as ImageIcon,
  Search,
  Filter,
  Layers,
  FileImage,
  Moon,
  SunMedium,
  Sun,
  Camera,
} from "lucide-react";
import type { StoredImage } from "@/lib/astro/types";
import {
  listImages,
  deleteImage,
  clearImages,
  blobToUrl,
} from "@/lib/storage/db";

type FilterType = "all" | "light" | "dark" | "flat" | "bias" | "result" | "light_stack";

const FILTER_LABELS: Record<FilterType, string> = {
  all: "Mind",
  light: "Light (célpont)",
  dark: "Dark (sötét)",
  flat: "Flat (sík)",
  bias: "Bias (offset)",
  light_stack: "Stackelt",
  result: "Eredmény",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  light: <Camera className="w-3 h-3" />,
  dark: <Moon className="w-3 h-3" />,
  flat: <SunMedium className="w-3 h-3" />,
  bias: <Sun className="w-3 h-3" />,
  result: <FileImage className="w-3 h-3" />,
  light_stack: <Layers className="w-3 h-3" />,
};

export function LibraryTab() {
  const [images, setImages] = useState<StoredImage[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listImages();
      setImages(all);
    } catch (e) {
      console.error(e);
      toast({
        title: "Hiba",
        description: "Nem sikerült betölteni a képeket",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteImage(id);
      refresh();
      toast({ title: "Kép törölve" });
    },
    [refresh, toast]
  );

  const handleDownload = useCallback((img: StoredImage) => {
    const url = blobToUrl(img.blob);
    const a = document.createElement("a");
    a.href = url;
    const ext = img.blob.type.includes("png") ? "png" : "jpg";
    a.download = `astrosnap_${img.type}_${img.id}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const handleClearAll = useCallback(async () => {
    if (!confirm("Biztosan törölni szeretnéd az ÖSSZES képet?")) return;
    await clearImages();
    refresh();
    toast({ title: "Minden kép törölve" });
  }, [refresh, toast]);

  const filtered =
    filter === "all" ? images : images.filter((i) => i.type === filter);

  // Típusonkénti statisztika
  const counts = images.reduce(
    (acc, img) => {
      acc[img.type] = (acc[img.type] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-4">
      {/* Statisztikák */}
      <Card className="bg-[#0c1322] border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            Képkönyvtár
          </CardTitle>
          <CardDescription className="text-xs">
            {images.length} kép összesen a helyi tárolóban
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {(["light", "dark", "flat", "bias", "light_stack", "result"] as const).map(
              (type) => (
                <div
                  key={type}
                  className="p-2 rounded-md bg-[#080d1a] border border-white/5 text-center"
                >
                  <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1 mb-1">
                    {TYPE_ICONS[type]}
                    <span className="capitalize">{FILTER_LABELS[type as FilterType]}</span>
                  </div>
                  <div className="text-lg font-bold font-mono">
                    {counts[type] ?? 0}
                  </div>
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Szűrő + rács */}
      <Card className="bg-[#0c1322] border-white/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="w-4 h-4 text-sky-400" />
              Képek
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select
                value={filter}
                onValueChange={(v) => setFilter(v as FilterType)}
              >
                <SelectTrigger className="bg-[#080d1a] border-white/10 h-8 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0c1322] border-white/10">
                  {Object.entries(FILTER_LABELS).map(([v, label]) => (
                    <SelectItem key={v} value={v} className="text-xs">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {images.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClearAll}
                  className="border-red-500/30 text-red-300 hover:bg-red-500/10 h-8"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Mind törlése
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              Betöltés...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {filter === "all"
                  ? "Még nincs mentett kép."
                  : `Nincs ${FILTER_LABELS[filter]} kép.`}
              </p>
              <p className="text-xs mt-1 text-slate-500">
                Készíts képeket a Felvétel vagy Kalibráció tabokon.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[60vh]">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pr-2">
                {filtered.map((img) => (
                  <ImageCard
                    key={img.id}
                    img={img}
                    onDelete={() => handleDelete(img.id)}
                    onDownload={() => handleDownload(img)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ImageCard({
  img,
  onDelete,
  onDownload,
}: {
  img: StoredImage;
  onDelete: () => void;
  onDownload: () => void;
}) {
  const thumbUrl = useMemo(() => URL.createObjectURL(img.thumbnail), [img.thumbnail]);
  useEffect(() => {
    return () => URL.revokeObjectURL(thumbUrl);
  }, [thumbUrl]);

  return (
    <div className="group relative rounded-lg overflow-hidden border border-white/10 bg-[#080d1a]">
      <div className="aspect-square">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={img.metadata?.label ?? "kép"}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-white/5 animate-pulse" />
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none" />
      <div className="absolute top-1 left-1">
        <Badge
          variant="outline"
          className="bg-black/60 backdrop-blur text-[9px] border-white/20 text-slate-200 flex items-center gap-1"
        >
          {TYPE_ICONS[img.type]}
          {img.type}
        </Badge>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-2 text-[10px]">
        {img.metadata?.label && (
          <div className="font-medium truncate text-white">
            {img.metadata.label}
          </div>
        )}
        <div className="text-slate-400 font-mono flex items-center gap-1">
          {img.metadata?.iso && <span>ISO {img.metadata.iso}</span>}
          {img.metadata?.exposureSeconds && (
            <span>• {img.metadata.exposureSeconds}s</span>
          )}
        </div>
        <div className="text-slate-500 text-[9px]">
          {new Date(img.capturedAt).toLocaleString("hu-HU", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {img.metadata?.stackCount
            ? ` • ${img.metadata.stackCount} stack`
            : ""}
        </div>
      </div>
      <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onDownload}
          className="bg-sky-500/80 hover:bg-sky-500 text-white rounded p-1"
          title="Letöltés"
        >
          <Download className="w-3 h-3" />
        </button>
        <button
          onClick={onDelete}
          className="bg-red-500/80 hover:bg-red-500 text-white rounded p-1"
          title="Törlés"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
