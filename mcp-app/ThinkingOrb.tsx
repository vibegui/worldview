import { useEffect, useRef } from "react";

/**
 * A ring of light that will not sit still.
 *
 * Four closed strands trace the same circle at different phases. Each strand's
 * radius and its displacement out of the plane are sums of a few sine harmonics
 * running at speeds that share no common period, so the ring wobbles, the
 * strands cross in front of and behind each other, and the silhouette never
 * repeats. That crossing is the whole illusion of depth — there is no lighting
 * model here, only a z coordinate deciding what is bright and what is thin.
 *
 * Drawn additively (`globalCompositeOperation = "lighter"`), which is what makes
 * it read as light rather than as paint: where strands overlap the values sum
 * toward white the way real exposure does. The bloom is three passes of the same
 * path — wide and faint, then medium, then a thin hot core — rather than a blur
 * filter, because `ctx.filter` re-rasterises the whole surface every frame and
 * this does not.
 *
 * It carries no data and states nothing. It is there so the declaration is
 * opened by something that looks alive.
 */

/**
 * One strand per commitment, and the colour is the commitment's.
 *
 * Additive blending is what makes selecting more than one worth doing: where two
 * strands cross, the channels sum, so green over amber is a yellow nobody drew
 * and cyan over amber is close to white. Three separate lights in one glass.
 */
export const STRAND_INKS: Rgb[] = [
  { r: 255, g: 186, b: 64 }, // Brasil protagonista em Tecnologia
  { r: 84, g: 198, b: 255 }, // Liberdade para ser e agir
  { r: 96, g: 236, b: 150 }, // Poder é sereno
];

const STRANDS = STRAND_INKS.length;
const SAMPLES = 260;
/** Colour changes along the path, so it is stroked in chunks, not in one go. */
const CHUNK = 8;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function readRgb(value: string): Rgb {
  const [r = 255, g = 120, b = 60] = (value.match(/[\d.]+/g) ?? []).map(Number);
  return { r, g, b };
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  };
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

    // Each strand keeps its own hue at both ends of its depth ramp: the far arc
    // sinks toward an almost-black of that colour, the near one is stoked toward
    // a pale version of it. Mixing toward a neutral instead would drag every
    // strand toward the same washed-out cream.
    const ramps = STRAND_INKS.map((ink) => ({
      deep: mix(ink, { r: 5, g: 10, b: 8 }, 0.76),
      hot: mix(ink, { r: 255, g: 255, b: 250 }, 0.5),
    }));

    const centre = size / 2;
    const radius = size * 0.33;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    let start: number | null = null;

    const draw = (now: number) => {
      if (start === null) start = now;
      const time = still ? 4 : (now - start) / 1000;

      context.clearRect(0, 0, size, size);

      const chosen = activeRef.current;
      // Resting is deliberately below full, so that choosing everything is
      // visibly brighter than choosing nothing rather than identical to it.
      const gainOf = (index: number) =>
        chosen.length === 0 ? 0.62 : chosen.includes(index) ? 1 : 0.3;

      // The ambient glow, weighted the same way — the room dims with the lights
      // that are down.
      const glow = STRAND_INKS.reduce(
        (total, _, index) => {
          const ink = ramps[index]!.deep;
          const gain = gainOf(index) / STRAND_INKS.length;
          return {
            r: total.r + ink.r * gain,
            g: total.g + ink.g * gain,
            b: total.b + ink.b * gain,
          };
        },
        { r: 0, g: 0, b: 0 },
      );
      const halo = context.createRadialGradient(
        centre,
        centre,
        radius * 0.1,
        centre,
        centre,
        radius * 1.9,
      );
      halo.addColorStop(0, `rgba(${glow.r | 0},${glow.g | 0},${glow.b | 0},0.3)`);
      halo.addColorStop(
        0.55,
        `rgba(${glow.r | 0},${glow.g | 0},${glow.b | 0},0.09)`,
      );
      halo.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = halo;
      context.fillRect(0, 0, size, size);

      context.globalCompositeOperation = "lighter";
      context.lineCap = "round";
      context.lineJoin = "round";

      for (let strand = 0; strand < STRANDS; strand += 1) {
        const { deep, hot } = ramps[strand]!;
        const gain = gainOf(strand);
        const phase = (strand / STRANDS) * Math.PI * 2;
        const points: Array<{ x: number; y: number; depth: number }> = [];

        for (let i = 0; i <= SAMPLES; i += 1) {
          const angle = (i / SAMPLES) * Math.PI * 2;
          // Three harmonics at unrelated speeds. Two would beat visibly.
          const wobble =
            1 +
            0.085 * Math.sin(3 * angle + time * 0.7 + phase) +
            0.045 * Math.sin(2 * angle - time * 0.47 + phase * 1.7);
          const out = radius * wobble;
          // Displacement out of the ring's own plane. This is the only source of
          // depth: the circle stays a circle on screen, and the strand ribbons
          // toward and away from the reader as it goes round.
          const z =
            0.34 * Math.sin(2 * angle + time * 0.53 + phase) +
            0.17 * Math.sin(4 * angle - time * 0.29 + phase * 1.3);

          // Weak perspective. Enough that the near arc reads as nearer; more
          // than this and the ring stops being a ring.
          const scale = 1 + z * 0.13;

          points.push({
            x: centre + Math.cos(angle) * out * scale,
            y: centre + Math.sin(angle) * out * scale,
            depth: Math.max(0, Math.min(1, z / 1.02 / 2 + 0.5)),
          });
        }

        // Wide and faint, then medium, then the core. Additive, so the three
        // sum into a bloom with a hot centre.
        for (const pass of [
          { width: 54, alpha: 0.022 },
          { width: 26, alpha: 0.04 },
          { width: 12, alpha: 0.08 },
          { width: 5, alpha: 0.2 },
          { width: 1.9, alpha: 0.85 },
        ]) {
          for (let i = 0; i < SAMPLES; i += CHUNK) {
            const here = points[i]!;
            const shade = mix(deep, hot, here.depth ** 1.5);
            context.beginPath();
            context.moveTo(here.x, here.y);
            for (let j = 1; j <= CHUNK && i + j <= SAMPLES; j += 1) {
              const next = points[i + j]!;
              context.lineTo(next.x, next.y);
            }
            context.strokeStyle = `rgba(${shade.r | 0},${shade.g | 0},${shade.b | 0},${
              pass.alpha * (0.18 + here.depth ** 1.2 * 1.15) * gain
            })`;
            context.lineWidth =
              pass.width * (0.22 + here.depth ** 1.4 * 1.5) * (0.6 + gain * 0.4);
            context.stroke();
          }
        }
      }

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
