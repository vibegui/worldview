import { useEffect, useRef } from "react";

/**
 * A slowly turning sphere of points, after jakubantalik.com/orbs.
 *
 * Canvas rather than SVG or DOM: ~500 nodes re-projected every frame is a repaint
 * the GPU does not blink at, and the same thing in elements would be 500 style
 * recalculations sixty times a second.
 *
 * Points are placed by the Fibonacci lattice — the golden-angle spiral — because
 * the obvious alternative, nesting latitude and longitude loops, crowds the poles
 * and leaves the equator sparse. The lattice is the one distribution that looks
 * deliberate at every angle, which matters when the thing rotates forever.
 *
 * It is the only organic shape on a page made of straight rules and set type. It
 * carries no data and states nothing: it is there so the declaration is opened
 * by something that looks alive.
 */

const POINTS = 520;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function ThinkingOrb({ size = 340 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    context.scale(dpr, dpr);

    // Placed once. Rotation is applied at draw time, so the lattice never
    // has to be rebuilt and the allocation happens exactly once.
    const lattice = Array.from({ length: POINTS }, (_, index) => {
      const y = 1 - (index / (POINTS - 1)) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = GOLDEN_ANGLE * index;
      return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius };
    });

    const ink = getComputedStyle(canvas).getPropertyValue("color").trim();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const centre = size / 2;
    const sphere = size * 0.42;

    let frame = 0;
    let start: number | null = null;

    const draw = (now: number) => {
      if (start === null) start = now;
      const elapsed = (now - start) / 1000;
      // Two axes at incommensurable speeds, so the silhouette never repeats
      // exactly and the eye cannot lock onto a loop.
      const spin = elapsed * 0.34;
      const tilt = Math.sin(elapsed * 0.21) * 0.42 + 0.3;

      context.clearRect(0, 0, size, size);
      const cosSpin = Math.cos(spin);
      const sinSpin = Math.sin(spin);
      const cosTilt = Math.cos(tilt);
      const sinTilt = Math.sin(tilt);

      for (const point of lattice) {
        const x1 = point.x * cosSpin - point.z * sinSpin;
        const z1 = point.x * sinSpin + point.z * cosSpin;
        const y2 = point.y * cosTilt - z1 * sinTilt;
        const z2 = point.y * sinTilt + z1 * cosTilt;

        // Depth does the whole job: nearer points are bigger, brighter, and
        // drawn last. No z-sorting needed at this density.
        const depth = (z2 + 1) / 2;
        const screenX = centre + x1 * sphere;
        const screenY = centre + y2 * sphere;
        const dot = 0.35 + depth * 1.5;

        context.globalAlpha = 0.08 + depth * depth * 0.72;
        context.beginPath();
        context.arc(screenX, screenY, dot, 0, Math.PI * 2);
        context.fillStyle = ink;
        context.fill();
      }
      context.globalAlpha = 1;

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
