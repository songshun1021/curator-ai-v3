"use client";

import { RefObject, useEffect } from "react";
import { AsciiFieldPreset } from "@/components/demo/ascii-field/ascii-field-presets";

type Point = {
  x: number;
  y: number;
};

type Particle = Point & {
  baseX: number;
  baseY: number;
  velocityX: number;
  velocityY: number;
  glyph: string;
};

type Ripple = Point & {
  radius: number;
  force: number;
  age: number;
};

const MAX_RIPPLE_AGE = 38;

function pickGlyph(glyphs: string[]) {
  return glyphs[Math.floor(Math.random() * glyphs.length)] ?? "+";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getPalette(presetId: AsciiFieldPreset["id"]) {
  if (presetId === "growth") {
    return {
      text: "rgba(68, 88, 132, 0.74)",
      dim: "rgba(68, 88, 132, 0.14)",
      ripple: "rgba(104, 122, 168, 0.20)",
    };
  }

  if (presetId === "workspace") {
    return {
      text: "rgba(45, 56, 78, 0.76)",
      dim: "rgba(45, 56, 78, 0.12)",
      ripple: "rgba(45, 56, 78, 0.16)",
    };
  }

  return {
    text: "rgba(0, 122, 255, 0.72)",
    dim: "rgba(0, 122, 255, 0.12)",
    ripple: "rgba(0, 122, 255, 0.18)",
  };
}

export function useAsciiField(canvasRef: RefObject<HTMLCanvasElement>, preset: AsciiFieldPreset) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const palette = getPalette(preset.id);
    const prefersReducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let prefersReducedMotion = prefersReducedMotionQuery.matches;

    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles: Particle[] = [];
    let ripples: Ripple[] = [];
    let pointer = { x: -9999, y: -9999, active: false };

    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      prefersReducedMotion = event.matches;
    };

    const getMotionFactor = () => (prefersReducedMotion ? 0.22 : 1);

    const initialize = () => {
      const rect = parent.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      dpr = clamp(window.devicePixelRatio || 1, 1, 2);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(dpr, dpr);
      context.font = "13px ui-monospace, SFMono-Regular, SFMono, Menlo, Consolas, monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";

      const spacing = width < 720 ? 18 : 16;
      const columns = Math.max(10, Math.floor(width / spacing));
      const rows = Math.max(8, Math.floor(height / spacing));
      const offsetX = (width - columns * spacing) / 2 + spacing / 2;
      const offsetY = (height - rows * spacing) / 2 + spacing / 2;

      particles = [];
      for (let column = 0; column < columns; column += 1) {
        for (let row = 0; row < rows; row += 1) {
          const x = offsetX + column * spacing;
          const y = offsetY + row * spacing;
          particles.push({
            x,
            y,
            baseX: x,
            baseY: y,
            velocityX: 0,
            velocityY: 0,
            glyph: pickGlyph(preset.glyphs),
          });
        }
      }

      ripples = [];
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);

      if (!prefersReducedMotion) {
        for (const ripple of ripples) {
          const opacity = Math.max(0, 0.8 - ripple.age / MAX_RIPPLE_AGE);
          context.strokeStyle = palette.ripple.replace(/[\d.]+\)$/, `${0.14 * opacity})`);
          context.lineWidth = 1;
          context.beginPath();
          context.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
          context.stroke();
        }
      }

      context.fillStyle = palette.text;
      for (const particle of particles) {
        context.fillText(particle.glyph, particle.x, particle.y);
      }
    };

    const animate = () => {
      const motionFactor = getMotionFactor();
      const activeRepelRadius = preset.physics.repelRadius * motionFactor;
      const activeRepelForce = preset.physics.repelForce * motionFactor;
      const activeRippleSpeed = Math.max(0.24, preset.physics.rippleSpeed * motionFactor);
      const activeRippleForce = preset.physics.rippleForce * motionFactor;

      ripples = ripples
        .map((ripple) => ({
          ...ripple,
          radius: ripple.radius + activeRippleSpeed,
          force: ripple.force * 0.96,
          age: ripple.age + 1,
        }))
        .filter((ripple) => ripple.age < MAX_RIPPLE_AGE && ripple.force > 0.04);

      for (const particle of particles) {
        if (pointer.active) {
          const deltaX = particle.x - pointer.x;
          const deltaY = particle.y - pointer.y;
          const distance = Math.hypot(deltaX, deltaY) || 1;
          if (distance < activeRepelRadius) {
            const strength = ((activeRepelRadius - distance) / activeRepelRadius) * activeRepelForce;
            particle.velocityX += (deltaX / distance) * strength;
            particle.velocityY += (deltaY / distance) * strength;
          }
        }

        for (const ripple of ripples) {
          const deltaX = particle.x - ripple.x;
          const deltaY = particle.y - ripple.y;
          const distance = Math.hypot(deltaX, deltaY) || 1;
          const rippleBand = Math.abs(distance - ripple.radius);

          if (rippleBand < 16) {
            const strength = ((16 - rippleBand) / 16) * ripple.force * activeRippleForce;
            particle.velocityX += (deltaX / distance) * strength;
            particle.velocityY += (deltaY / distance) * strength;

            if (!prefersReducedMotion && ripple.age % 10 === 0 && Math.random() > 0.82) {
              particle.glyph = pickGlyph(preset.glyphs);
            }
          }
        }

        particle.velocityX += (particle.baseX - particle.x) * preset.physics.spring;
        particle.velocityY += (particle.baseY - particle.y) * preset.physics.spring;
        particle.velocityX *= preset.physics.friction;
        particle.velocityY *= preset.physics.friction;

        particle.x += particle.velocityX;
        particle.y += particle.velocityY;

        const maxOffset = prefersReducedMotion ? 4 : 18;
        particle.x = clamp(particle.x, particle.baseX - maxOffset, particle.baseX + maxOffset);
        particle.y = clamp(particle.y, particle.baseY - maxOffset, particle.baseY + maxOffset);
      }

      draw();
      animationFrame = window.requestAnimationFrame(animate);
    };

    const updatePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        active: true,
      };
    };

    const clearPointer = () => {
      pointer = { x: -9999, y: -9999, active: false };
    };

    const onPointerDown = (event: PointerEvent) => {
      if (prefersReducedMotion) return;
      const rect = canvas.getBoundingClientRect();
      ripples.push({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        radius: 0,
        force: 1,
        age: 0,
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      initialize();
    });

    initialize();
    draw();
    animationFrame = window.requestAnimationFrame(animate);
    resizeObserver.observe(parent);
    canvas.addEventListener("pointermove", updatePointer);
    canvas.addEventListener("pointerleave", clearPointer);
    canvas.addEventListener("pointerdown", onPointerDown);
    prefersReducedMotionQuery.addEventListener("change", onMotionPreferenceChange);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointermove", updatePointer);
      canvas.removeEventListener("pointerleave", clearPointer);
      canvas.removeEventListener("pointerdown", onPointerDown);
      prefersReducedMotionQuery.removeEventListener("change", onMotionPreferenceChange);
    };
  }, [canvasRef, preset]);
}
