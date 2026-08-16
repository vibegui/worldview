import { useEffect, useRef } from "react";

/**
 * A ring of lit smoke.
 *
 * Nothing here is a line. Every earlier attempt stroked polylines and every one
 * of them showed its construction — beads at the round caps, slabs where wide
 * chunks butted together, facets around the curve, a dotted seam wherever two
 * chunks overlapped and additive blending drew the same pixels twice. A stroke
 * has an edge, and an edge is exactly what smoke does not have.
 *
 * So the ring is a few thousand soft radial-gradient sprites laid along a
 * wobbling path. A sprite is opaque at its centre and fades to nothing at its
 * rim, so overlapping sprites sum into cloud rather than into shape. Depth
 * decides size, brightness, and which of two tinted sprites is used, which is
 * what makes the near arc read as nearer with no lighting model at all.
 *
 * The sprites are rendered once into offscreen canvases. Building a radial
 * gradient per particle per frame would be thousands of allocations sixty times
 * a second; `drawImage` of a cached bitmap is the cheap operation.
 *
 * It carries no data and states nothing. It is there so the declaration is
 * opened by something that looks alive.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * One strand per commitment, and the colour is the commitment's.
 *
 * Additive blending is what makes selecting more than one worth doing: where two
 * clouds overlap the channels sum, so green over amber is a yellow nobody drew
 * and cyan over amber lands close to white. Three lights in one glass.
 */
export const STRAND_INKS: Rgb[] = [
  { r: 255, g: 186, b: 64 }, // Brasil protagonista em Tecnologia
  { r: 84, g: 198, b: 255 }, // Liberdade para ser e agir
  { r: 96, g: 236, b: 150 }, // Poder é sereno
];

const STRANDS = STRAND_INKS.length;
/**
 * Filaments per colour, spaced evenly around the tube's cross-section. Each
 * colour is one doughnut: the filaments share a centreline and differ only by
 * where they sit on the ring of the tube, which is what makes the colour cohere
 * as a body instead of fanning into haze.
 */
const FILAMENTS = 9;
/**
 * Sprites along one wisp. The ring is roughly 680px around, so this puts them
 * under three pixels apart — well inside the radius of even the smallest brush,
 * which is what stops the trail from reading as a row of dots.
 */
const PARTICLES = 200;
const SPRITE = 96;

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  };
}

/** A soft round brush: opaque core, nothing at the rim, no edge anywhere. */
function brush(ink: Rgb): HTMLCanvasElement {
  const sprite = document.createElement("canvas");
  sprite.width = SPRITE;
  sprite.height = SPRITE;
  const context = sprite.getContext("2d")!;
  const half = SPRITE / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  // No hard core. A sprite with an opaque centre stays individually visible
  // however much haze surrounds it, and a few thousand of those on a regular
  // path is a lattice — the fine mesh that kept showing through the gas. A
  // gentle dome has no point to pick out, so the sum is all anyone sees.
  gradient.addColorStop(0, `rgba(${ink.r},${ink.g},${ink.b},0.5)`);
  gradient.addColorStop(0.32, `rgba(${ink.r},${ink.g},${ink.b},0.26)`);
  gradient.addColorStop(0.62, `rgba(${ink.r},${ink.g},${ink.b},0.07)`);
  gradient.addColorStop(1, `rgba(${ink.r},${ink.g},${ink.b},0)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, SPRITE, SPRITE);
  return sprite;
}

export function ThinkingOrb({
  size = 360,
  active = [],
}: {
  size?: number;
  /**
   * Which strands are turned up. Nothing is ever hidden: a selection raises the
   * gain on one light and lowers the others, so the ring keeps its shape and
   * the reader keeps their bearings. Selecting all three lifts the whole signal.
   */
  active?: number[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read inside the frame loop rather than captured, so toggling a commitment
  // does not tear down and restart the animation mid-turn.
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    context.scale(dpr, dpr);

    // Two brushes per colour: the far one sunk toward an almost-black of its own
    // hue, the near one stoked toward a pale version of it. Mixing toward a
    // neutral would drag every strand to the same washed-out cream.
    const brushes = STRAND_INKS.map((ink) => ({
      far: brush(mix(ink, { r: 6, g: 14, b: 10 }, 0.62)),
      near: brush(mix(ink, { r: 255, g: 255, b: 248 }, 0.42)),
    }));

    const centre = size / 2;
    const radius = size * 0.3;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    let start: number | null = null;
    let previous: number | null = null;
    // Where each strand's brightness actually is, as opposed to where the
    // selection says it should be. Switching sets a target; this chases it.
    const level = STRAND_INKS.map(() => 0.42);

    const draw = (now: number) => {
      if (start === null) start = now;
      const step = previous === null ? 0 : (now - previous) / 1000;
      previous = now;
      const time = still ? 4 : (now - start) / 1000;

      const chosen = activeRef.current;
      // Selecting turns one light *up*. It does not turn the others down —
      // choosing a commitment is not a claim against the other two, and a ring
      // that dims when you look at part of it reads as a filter rather than as
      // attention. Resting sits below full so that lighting all three is
      // visibly brighter than lighting none.
      const targetOf = (index: number) => (chosen.includes(index) ? 1 : 0.42);

      // Exponential approach rather than a jump, and framerate-independent:
      // `1 - e^(-dt/tau)` is the same curve at 120fps or while dropping frames.
      // Rising is slower than falling, so a light comes up like something
      // warming and goes out like something switched off.
      for (let index = 0; index < level.length; index += 1) {
        const target = targetOf(index);
        if (still) {
          level[index] = target;
          continue;
        }
        const tau = target > level[index]! ? 0.42 : 0.26;
        level[index]! += (target - level[index]!) * (1 - Math.exp(-step / tau));
      }

      context.clearRect(0, 0, size, size);
      context.globalCompositeOperation = "lighter";

      // The room the ring is lit in, weighted by which lights are up. Additive
      // like everything else, so it lifts the whole field rather than sitting
      // behind it as a flat wash.
      const glow = STRAND_INKS.reduce(
        (total, ink, index) => {
          const weight = level[index]! / STRANDS;
          return {
            r: total.r + ink.r * weight,
            g: total.g + ink.g * weight,
            b: total.b + ink.b * weight,
          };
        },
        { r: 0, g: 0, b: 0 },
      );
      const halo = context.createRadialGradient(
        centre,
        centre,
        radius * 0.5,
        centre,
        centre,
        radius * 1.75,
      );
      halo.addColorStop(0, `rgba(${glow.r | 0},${glow.g | 0},${glow.b | 0},0.07)`);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = halo;
      context.fillRect(0, 0, size, size);

      for (let strand = 0; strand < STRANDS; strand += 1) {
        const gain = level[strand]!;
        const { far, near } = brushes[strand]!;
        const base = (strand / STRANDS) * Math.PI * 2;

        // The centreline this colour's doughnut is bent along. Every filament
        // shares it, so the colour moves as one body; only the position on the
        // tube's cross-section differs.
        const phase = base;

        for (let filament = 0; filament < FILAMENTS; filament += 1) {
          const around = (filament / FILAMENTS) * Math.PI * 2;

          for (let i = 0; i < PARTICLES; i += 1) {
            const angle = (i / PARTICLES) * Math.PI * 2;
            // Every multiplier on `angle` is an integer, and it has to be:
            // sin(1.5·(θ + 2π)) is not sin(1.5θ), so a fractional harmonic
            // leaves the path open and the ring is cut clean through where θ
            // wraps.
            const wobble =
              1 +
              0.1 * Math.sin(3 * angle + time * 0.7 + phase) +
              0.06 * Math.sin(2 * angle - time * 0.47 + phase * 1.7);
            const spine =
              0.5 * Math.sin(2 * angle + time * 0.53 + phase) +
              0.24 * Math.sin(3 * angle - time * 0.29 + phase * 1.3);

            // The tube itself. The filament rides at `around` on the
            // cross-section, which rotates slowly in time and leans back and
            // forth once per lap.
            //
            // It used to turn a full revolution per lap. With a finite number of
            // filaments that is a helix at a fixed pitch, and a helix drawn as
            // discrete strands is corduroy — regular diagonal ridges, the exact
            // opposite of gas. A gentle lean has the twist without the weave.
            const tube = around + time * 0.35 + 0.7 * Math.sin(angle + phase);
            const swell =
              1 + 0.22 * Math.sin(angle * 2 - time * 0.31 + phase);
            const tubeRadius = radius * 0.17 * swell;

            const out =
              radius * wobble * (1 + spine * 0.05) +
              Math.cos(tube) * tubeRadius;
            const z = spine + Math.sin(tube) * 0.55;

            const x = centre + Math.cos(angle) * out;
            const y = centre + Math.sin(angle) * out;
            const depth = Math.max(0, Math.min(1, z / 2.1 / 2 + 0.5));

            // Density varies along the path, so the body has knots and thin
            // patches instead of an even skin. Never zero, or the wisp breaks.
            const density =
              0.45 +
              0.55 *
                Math.abs(Math.sin(angle * 3 - time * 0.4 + phase + around));
            const spread = filament / FILAMENTS;

            const diameter =
              (22 + spread * 8 + depth * 16) * (0.75 + gain * 0.25);
            const alpha = (0.05 + depth * 0.13) * density * gain;
            const half = diameter / 2;

            context.globalAlpha = alpha * (1 - depth);
            context.drawImage(far, x - half, y - half, diameter, diameter);
            context.globalAlpha = alpha * depth;
            context.drawImage(near, x - half, y - half, diameter, diameter);

            // A tight hot pass on the frontmost arc only. `depth ** 4` keeps it
            // off everything but the part facing the reader, which is where a
            // real filament would catch the light — and it is what separates a
            // lit gas from a grey fog.
            if (depth > 0.62) {
              const heat = (depth - 0.62) / 0.38;
              const core = diameter * 0.34;
              context.globalAlpha = heat ** 2 * 0.3 * density * gain;
              context.drawImage(
                near,
                x - core / 2,
                y - core / 2,
                core,
                core,
              );
            }
          }
        }
      }

      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      if (!still) frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      className="thinking-orb"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
