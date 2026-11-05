export type RenderQuality = "high" | "balanced" | "efficient";

export interface RenderQualityState {
  level: RenderQuality;
  slowWindows: number;
  fastWindows: number;
}

export const INITIAL_RENDER_QUALITY: RenderQualityState = {
  level: "high",
  slowWindows: 0,
  fastWindows: 0
};

const PIXEL_RATIO_CAP: Record<RenderQuality, number> = {
  high: 1.65,
  balanced: 1.35,
  efficient: 1.05
};

export function percentile95(samples: readonly number[]): number {
  const sorted = samples.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

export function pixelRatioForQuality(devicePixelRatio: number, quality: RenderQuality): number {
  const deviceRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(deviceRatio, PIXEL_RATIO_CAP[quality]);
}

export function observeRenderQuality(state: RenderQualityState, p95FrameMs: number): RenderQualityState {
  if (!Number.isFinite(p95FrameMs) || p95FrameMs < 0) return state;

  if (p95FrameMs >= 36) {
    return { level: "efficient", slowWindows: 0, fastWindows: 0 };
  }

  if (p95FrameMs > 23) {
    const slowWindows = state.slowWindows + 1;
    if (slowWindows < 2 || state.level === "efficient") {
      return { level: state.level, slowWindows, fastWindows: 0 };
    }
    return {
      level: state.level === "high" ? "balanced" : "efficient",
      slowWindows: 0,
      fastWindows: 0
    };
  }

  if (p95FrameMs < 18) {
    const fastWindows = state.fastWindows + 1;
    if (fastWindows < 5 || state.level === "high") {
      return { level: state.level, slowWindows: 0, fastWindows };
    }
    return {
      level: state.level === "efficient" ? "balanced" : "high",
      slowWindows: 0,
      fastWindows: 0
    };
  }

  return { level: state.level, slowWindows: 0, fastWindows: 0 };
}
