'use client';

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, ChevronLeft, Minus, Play, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AlertEvent } from '@/lib/api/types';
import { getStation } from '@/lib/api/endpoints';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDemoClock } from '@/lib/demo-clock';
import { fmtClock, fmtSigned } from '@/lib/format';
import { THRESHOLDS } from '@/lib/mock/seed/thresholds';
import { cn } from '@/lib/utils';

/**
 * The PTZ verification prompt (§7.5).
 *
 * Where standing water is detected the Statement of Requirements asks for it to
 * be confirmed on camera before anything else happens, so this is a decision
 * point, not a notification: one obvious button that opens the right feed, and
 * the location and kilometrage spelled out so the person verifying knows which
 * camera they are about to look at.
 *
 * "View live PTZ feed" opens a simulated view of the camera: the track, the rail
 * foot, and the water drawn at the level the radar is reading right now — so the
 * reviewer sees what "verify standing water" will look like, and that the
 * picture and the number are meant to agree. The real feed is a URL MTS supplies.
 *
 * The camera icon blinks, as the client's sample screen specifies — but the
 * ring carries the same meaning for anyone with reduced motion enabled.
 */
export function PtzDialog({
  event,
  onClose,
  onAcknowledge,
  onSnooze,
}: {
  event: AlertEvent | null;
  onClose: () => void;
  onAcknowledge?: (id: string) => void;
  /** Snooze for 10 minutes; the prompt returns if it is still unacknowledged. */
  onSnooze?: (id: string) => void;
}) {
  const [view, setView] = useState<'prompt' | 'feed'>('prompt');
  useEffect(() => {
    if (event) setView('prompt');
  }, [event]);

  return (
    <Dialog open={event !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(view === 'feed' ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="-mx-6 -mt-6 mb-4 flex items-center gap-2 rounded-t-lg bg-sev-warning-tint px-6 py-2.5 text-sm font-semibold uppercase tracking-wide text-sev-warning-strong">
          <Camera className="h-4 w-4" aria-hidden />
          Flood verification required
        </div>

        {view === 'prompt' ? (
          <>
            <DialogHeader className="items-center text-center">
              <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-sev-warning-tint ring-4 ring-sev-warning/30">
                <Camera className="h-9 w-9 animate-blink-alert text-sev-warning-strong" aria-hidden />
              </div>
              <DialogTitle className="text-lg">Standing water detected</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2">
                  <p className="text-sm">
                    {event?.locationName} · <span className="italic">{event?.chainageLabel}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">Verify the standing water on the PTZ camera before acting on the reading.</p>
                </div>
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 space-y-3">
              <Button className="w-full" size="lg" onClick={() => setView('feed')}>
                <Play className="h-4 w-4" /> View live PTZ feed
              </Button>
              <div className="flex items-center justify-center gap-4 text-sm">
                <button
                  className="text-primary hover:underline"
                  onClick={() => {
                    if (event && onAcknowledge) onAcknowledge(event.id);
                    onClose();
                  }}
                >
                  Acknowledge
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  className="text-primary hover:underline"
                  onClick={() => {
                    if (event && onSnooze) onSnooze(event.id);
                    onClose();
                  }}
                >
                  Snooze 10 min
                </button>
              </div>
              <p className="rounded-md border border-sev-info/40 bg-sev-info-tint p-2 text-center text-xs text-sev-info-strong">
                The same link goes out in the email and push alert. Camera URLs and network access are supplied by MTS (§15).
              </p>
            </div>
          </>
        ) : event ? (
          <FeedView
            event={event}
            onBack={() => setView('prompt')}
            onConfirm={() => {
              if (onAcknowledge) onAcknowledge(event.id);
              onClose();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FeedView({ event, onBack, onConfirm }: { event: AlertEvent; onBack: () => void; onConfirm: () => void }) {
  const now = useDemoClock();
  const [level, setLevel] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const minute = Math.floor(now / 60_000);
  useEffect(() => {
    getStation(event.locationId).then((s) => setLevel(s.readings.find((r) => r.parameter === 'water_level')?.value ?? null));
  }, [event.locationId, minute]);

  const cam = `${event.locationId.slice(0, 3).toUpperCase()}-PTZ-01`;
  return (
    <div className="space-y-3">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base">
          <button onClick={onBack} className="rounded p-1 hover:bg-muted" aria-label="Back to the prompt">
            <ChevronLeft className="h-4 w-4" />
          </button>
          Live PTZ feed — {event.locationName}
        </DialogTitle>
        <DialogDescription>
          Compare the picture with the radar reading: {level === null ? 'radar not reporting' : `${fmtSigned(level)} mm above datum`}, standing
          water at +{THRESHOLDS.flood.standingWaterMm} mm, rail foot at +{THRESHOLDS.flood.railFootMm} mm.
        </DialogDescription>
      </DialogHeader>

      <div className="overflow-hidden rounded-md border bg-black">
        <CameraScene level={level ?? 0} zoom={zoom} pan={pan} cam={cam} time={fmtClock(now)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="Pan and tilt">
          <PtzButton label="Pan left" onClick={() => setPan((p) => ({ ...p, x: Math.min(40, p.x + 12) }))}>
            <ArrowLeft className="h-4 w-4" />
          </PtzButton>
          <PtzButton label="Tilt up" onClick={() => setPan((p) => ({ ...p, y: Math.min(30, p.y + 10) }))}>
            <ArrowUp className="h-4 w-4" />
          </PtzButton>
          <PtzButton label="Tilt down" onClick={() => setPan((p) => ({ ...p, y: Math.max(-30, p.y - 10) }))}>
            <ArrowDown className="h-4 w-4" />
          </PtzButton>
          <PtzButton label="Pan right" onClick={() => setPan((p) => ({ ...p, x: Math.max(-40, p.x - 12) }))}>
            <ArrowRight className="h-4 w-4" />
          </PtzButton>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <PtzButton label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
            <Minus className="h-4 w-4" />
          </PtzButton>
          <span className="tabular w-10 text-center text-xs">{zoom.toFixed(1)}×</span>
          <PtzButton label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.5))}>
            <Plus className="h-4 w-4" />
          </PtzButton>
          <Button
            size="sm"
            variant="outline"
            className="ml-1"
            onClick={() => {
              // The staff gauge at the drain — the lowest point of the flood plane.
              setZoom(2);
              setPan({ x: 0, y: 0 });
            }}
          >
            Preset: lowest point
          </Button>
        </div>
        <Button size="sm" onClick={onConfirm}>
          Water confirmed — acknowledge
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Simulated picture. The live stream URL, and any authentication or network access to reach it, are supplied by MTS during
        detailed design (§7.5, §15).
      </p>
    </div>
  );
}

function PtzButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="flex h-8 w-8 items-center justify-center rounded border hover:bg-muted">
      {children}
    </button>
  );
}

/**
 * A stylised CCTV view of the track at the lowest point of the flood plane: rails
 * running to a vanishing point, sleepers, the cess drain, and floodwater whose
 * surface sits where the radar says it is relative to the rail foot.
 */
function CameraScene({ level, zoom, pan, cam, time }: { level: number; zoom: number; pan: { x: number; y: number }; cam: string; time: string }) {
  const W = 320;
  const H = 180;
  // The drain floor (datum) at y=172 and the rail foot at y=108: 200 mm of water
  // spans most of the lower frame, so +80 mm reads as water, not a sliver.
  const datumY = 172;
  const railFootY = 108;
  const waterY = datumY - (Math.max(0, level) / THRESHOLDS.flood.railFootMm) * (datumY - railFootY);
  const vx = W / 2;
  const vy = 52;
  const sleepers = Array.from({ length: 9 }, (_, i) => {
    const k = (i + 1) / 10;
    const y = vy + (H - vy) * k ** 1.6;
    const half = 12 + 120 * k ** 1.6;
    return { y, half };
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Simulated camera view, water ${level} mm above datum`}>
      <defs>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2a3340" />
          <stop offset="1" stopColor="#47515c" />
        </linearGradient>
        <linearGradient id="water" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#6f8fa8" stopOpacity="0.85" />
          <stop offset="1" stopColor="#3d5a70" stopOpacity="0.95" />
        </linearGradient>
        <pattern id="noise" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="4" fill="transparent" />
          <rect width="1" height="1" fill="#fff" opacity="0.04" />
        </pattern>
      </defs>
      <g
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '90px 140px',
          transformBox: 'view-box',
          transition: 'transform 300ms',
        }}
      >
        <rect width={W} height={H} fill="url(#sky)" />
        {/* embankments */}
        <polygon points={`0,${H} 0,70 ${vx - 8},${vy} ${vx - 140},${H}`} fill="#3b4a3a" />
        <polygon points={`${W},${H} ${W},70 ${vx + 8},${vy} ${vx + 140},${H}`} fill="#3b4a3a" />
        {/* ballast bed */}
        <polygon points={`${vx - 6},${vy} ${vx + 6},${vy} ${vx + 150},${H} ${vx - 150},${H}`} fill="#6b6660" />
        {sleepers.map((s) => (
          <rect key={s.y} x={vx - s.half} y={s.y - 1.5} width={s.half * 2} height={3 + s.y / 70} fill="#4a3f36" />
        ))}
        {/* water — drawn before the rails so the rails stand out of it until it reaches the rail foot */}
        {level > 0 ? <rect x="0" y={waterY} width={W} height={H - waterY} fill="url(#water)" /> : null}
        {level > 0 ? <line x1="0" x2={W} y1={waterY} y2={waterY} stroke="#cfe2f0" strokeOpacity="0.6" strokeWidth="0.8" /> : null}
        {/* rails */}
        <line x1={vx - 3} y1={vy} x2={vx - 70} y2={H} stroke="#b9b9b9" strokeWidth="2.5" />
        <line x1={vx + 3} y1={vy} x2={vx + 70} y2={H} stroke="#b9b9b9" strokeWidth="2.5" />
        {/* rail-foot reference on the staff gauge at the drain */}
        <g>
          <rect x="70" y={railFootY - 24} width="7" height={datumY - railFootY + 24} fill="#e7c64a" />
          {Array.from({ length: Math.floor((datumY - railFootY + 24) / 6) }, (_, i) => (
            <line key={i} x1="70" x2={i % 2 ? 74 : 77} y1={railFootY - 24 + i * 6} y2={railFootY - 24 + i * 6} stroke="#111" strokeWidth="0.7" />
          ))}
          <line x1="66" x2="82" y1={railFootY} y2={railFootY} stroke="#ff6b6b" strokeWidth="1.2" />
          <text x="84" y={railFootY + 3} fontSize="6" fill="#ffb4b4" fontFamily="monospace">
            RAIL FOOT
          </text>
        </g>
      </g>
      <rect width={W} height={H} fill="url(#noise)" />
      {/* camera overlay — fixed, not affected by PTZ */}
      <text x="8" y="14" fontSize="8" fill="#fff" fontFamily="monospace">
        {cam}
      </text>
      <circle cx={W - 74} cy="11" r="3" fill="#ef4444" className="animate-blink-alert" />
      <text x={W - 8} y="14" fontSize="8" fill="#fff" fontFamily="monospace" textAnchor="end">
        REC {time}
      </text>
      <text x="8" y={H - 8} fontSize="7" fill="#fff" fontFamily="monospace" opacity="0.85">
        {zoom > 1 ? 'PRESET 1 · LOWEST POINT' : 'WIDE'} · {zoom.toFixed(1)}× · water {level > 0 ? `+${level} mm` : 'not visible'}
      </text>
      <text x={W - 8} y={H - 8} fontSize="7" fill="#fff" fontFamily="monospace" textAnchor="end" opacity="0.85">
        SIMULATED
      </text>
    </svg>
  );
}
