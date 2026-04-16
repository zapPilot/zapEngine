import { cn } from "@/lib/ui/classNames";

import { MOCK_ROUTE } from "./reviewModalPreviewData";

type RouteStep = (typeof MOCK_ROUTE)[number];

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function formatSignedPercent(value: number): string {
  if (value > 0) {
    return `+${formatPercent(value)}`;
  }

  if (value < 0) {
    return `-${formatPercent(Math.abs(value))}`;
  }

  return formatPercent(value);
}

function getAllocationChangeClass(change: number): string {
  if (change > 0) {
    return "text-emerald-400";
  }

  return "text-red-400";
}

function getRouteStepDetail(step: RouteStep): string {
  if ("asset" in step) {
    return step.asset;
  }

  if ("action" in step) {
    return step.action;
  }

  return "";
}

function getRouteStepTitle(step: RouteStep): string {
  if ("chain" in step) {
    return step.chain;
  }

  return step.protocol;
}

function getRouteStepIconClass(stepType: RouteStep["type"]): string {
  return cn(
    "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 z-10",
    stepType === "finish"
      ? "bg-green-500/20 border border-green-500/30 text-green-400 shadow-lg shadow-green-500/10"
      : "bg-gray-900 border border-gray-800 text-gray-400"
  );
}

export {
  formatPercent,
  formatSignedPercent,
  getAllocationChangeClass,
  getRouteStepDetail,
  getRouteStepIconClass,
  getRouteStepTitle,
};
