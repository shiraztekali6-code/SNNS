import type { Metadata } from "next";
import { StatNavigatorApp } from "@/components/statnav/stat-navigator-app";

export const metadata: Metadata = {
  title: "Statistics Navigator for Non-Statisticians",
  description:
    "Upload a data table, answer plain-language design questions, and get rule-based statistical guidance with explainable analysis outputs."
};

export default function StatisticsNavigatorPage() {
  return <StatNavigatorApp />;
}
