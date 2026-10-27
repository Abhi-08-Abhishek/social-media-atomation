"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSocialixStore, AgentRole } from "@/lib/store";
import {
  Calendar,
  Search,
  Sparkles,
  BarChart2,
  ArrowRight,
  ListTodo,
  Lightbulb,
  FilePenLine,
} from "lucide-react";

interface AgentDeskHotspot {
  role: AgentRole;
  name: string;
  defaultTask: string;
  icon: any;
  color: string;
  position: { top: string; left: string };
  modalClass: string;
}

export function VirtualOffice() {
  const router = useRouter();
  const {
    activeAgent,
    setActiveAgent,
    agentStatuses,
    plans,
    campaigns,
    currentCampaignId,
    updateCampaignOfficeTheme,
  } = useSocialixStore();
  const [hoveredAgent, setHoveredAgent] = useState<AgentRole | null>(null);
  const [isHoveringModal, setIsHoveringModal] = useState(false);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentCampaign = campaigns.find((c) => c.id === currentCampaignId);
  const isModern = currentCampaign?.officeTheme === "modern";

  const activePlan = plans[0];
  const getAgentTask = (role: AgentRole, idleLabel: string) => {
    return activePlan?.tasks?.find((t) => t.assignedAgent === role)?.title || idleLabel;
  };

  const hotspots: AgentDeskHotspot[] = isModern
    ? [
        {
          role: "CREATOR",
          name: "Creator Agent",
          defaultTask: getAgentTask("CREATOR", "Ready to design posts & captions"),
          icon: Sparkles,
          color: "#ec4899",
          position: { top: "26%", left: "58%" },
          modalClass: "top-3 left-4 sm:left-10",
        },
        {
          role: "RESEARCH",
          name: "Research Agent",
          defaultTask: getAgentTask("RESEARCH", "Ready to analyze real-time trends"),
          icon: Search,
          color: "#eab308",
          position: { top: "54%", left: "20%" },
          modalClass: "top-12 left-3 sm:left-6",
        },
        {
          role: "SCRIPT",
          name: "Script Agent",
          defaultTask: getAgentTask("SCRIPT", "Ready to write editable scripts"),
          icon: FilePenLine,
          color: "#7c3aed",
          position: { top: "40%", left: "40%" },
          modalClass: "top-16 left-4 sm:left-10",
        },
        {
          role: "SCHEDULER",
          name: "Scheduler Agent",
          defaultTask: getAgentTask("SCHEDULER", "Ready to schedule via Zernio"),
          icon: Calendar,
          color: "#3b82f6",
          position: { top: "45%", left: "84%" },
          modalClass: "top-3 right-3 sm:right-6",
        },
        {
          role: "ANALYTICS",
          name: "Analytics Agent",
          defaultTask: getAgentTask("ANALYTICS", "Ready to track performance & reach"),
          icon: BarChart2,
          color: "#10b981",
          position: { top: "74%", left: "70%" },
          modalClass: "top-36 right-3 sm:right-6",
        },
        {
          role: "STRATEGIST",
          name: "Growth Strategist",
          defaultTask: getAgentTask("STRATEGIST", "Waiting for measured post performance"),
          icon: Lightbulb,
          color: "#f59e0b",
          position: { top: "78%", left: "35%" },
          modalClass: "bottom-3 left-4 sm:left-10",
        },
      ]
    : [
        {
          role: "CREATOR",
          name: "Creator Agent",
          defaultTask: getAgentTask("CREATOR", "Ready to design posts & captions"),
          icon: Sparkles,
          color: "#ec4899",
          position: { top: "26.4%", left: "32%" },
          modalClass: "top-3 left-4 sm:left-10",
        },
        {
          role: "RESEARCH",
          name: "Research Agent",
          defaultTask: getAgentTask("RESEARCH", "Ready to analyze real-time trends"),
          icon: Search,
          color: "#eab308",
          position: { top: "49.5%", left: "12%" },
          modalClass: "top-12 left-3 sm:left-6",
        },
        {
          role: "SCRIPT",
          name: "Script Agent",
          defaultTask: getAgentTask("SCRIPT", "Ready to write editable scripts"),
          icon: FilePenLine,
          color: "#7c3aed",
          position: { top: "38%", left: "53%" },
          modalClass: "top-16 left-4 sm:left-10",
        },
        {
          role: "SCHEDULER",
          name: "Scheduler Agent",
          defaultTask: getAgentTask("SCHEDULER", "Ready to schedule via Zernio"),
          icon: Calendar,
          color: "#3b82f6",
          position: { top: "41.5%", left: "85%" },
          modalClass: "top-3 right-3 sm:right-6",
        },
        {
          role: "ANALYTICS",
          name: "Analytics Agent",
          defaultTask: getAgentTask("ANALYTICS", "Ready to track performance & reach"),
          icon: BarChart2,
          color: "#10b981",
          position: { top: "72.5%", left: "70%" },
          modalClass: "top-36 right-3 sm:right-6",
        },
        {
          role: "STRATEGIST",
          name: "Growth Strategist",
          defaultTask: getAgentTask("STRATEGIST", "Waiting for measured post performance"),
          icon: Lightbulb,
          color: "#f59e0b",
          position: { top: "77%", left: "38%" },
          modalClass: "bottom-3 left-4 sm:left-10",
        },
      ];

  const handleAgentEnter = (role: AgentRole) => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    setHoveredAgent(role);
  };

  const handleAgentLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setHoveredAgent(null);
    }, 250);
  };

  const handleModalEnter = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    setIsHoveringModal(true);
  };

  const handleModalLeave = () => {
    setIsHoveringModal(false);
    closeTimeoutRef.current = setTimeout(() => {
      setHoveredAgent(null);
    }, 250);
  };

  const isModalVisible = hoveredAgent !== null || isHoveringModal;
  const activeHotspot =
    hotspots.find((h) => h.role === hoveredAgent) || hotspots[2];
  const isRunning = agentStatuses[activeHotspot.role] === "running";

  const handleOpenAgent = (role: AgentRole) => {
    setActiveAgent(role);
    router.push("/agents");
  };

  return (
    <div
      className={`relative w-full aspect-square max-w-[540px] mx-auto rounded-3xl overflow-hidden shadow-card border border-slate-200/90 transition-all ${
        isModern ? "bg-slate-100" : "bg-[#fef7ee]"
      }`}
    >
      {/* 2D Original Isometric Virtual Office Artwork (Modern vs Wooden) */}
      <img
        src={isModern ? "/modern-virtual-office.png" : "/virtual-office.png"}
        alt={isModern ? "Modern AI Virtual Office" : "Socialix AI Creative Team Office"}
        className="w-full h-full object-cover select-none pointer-events-none"
      />

      {/* Office Theme Switcher / Indicator Pill */}
      {currentCampaign && <div className="absolute top-3.5 left-3.5 z-10">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (currentCampaign) {
              updateCampaignOfficeTheme(
                currentCampaign.id,
                isModern ? "wooden" : "modern"
              );
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 hover:bg-white text-[11px] font-bold text-slate-700 shadow-md border border-slate-200/90 backdrop-blur-md transition-all hover:scale-105 active:scale-95 group"
          title="Click to switch office space"
        >
          <span
            className={`w-2 h-2 rounded-full transition ${
              isModern ? "bg-blue-600 shadow-xs shadow-blue-500/50" : "bg-amber-600 shadow-xs shadow-amber-500/50"
            }`}
          />
          <span>{isModern ? "Modern Office" : "Wooden Office"}</span>
        </button>
      </div>}

      {/* Floating Active Agent Modal Card (Displayed on top of that agent when hovered) */}
      {isModalVisible && (
        <div
          onMouseEnter={handleModalEnter}
          onMouseLeave={handleModalLeave}
          className={`absolute z-30 w-52 max-w-[calc(100%-1.5rem)] bg-white/95 backdrop-blur-md rounded-lg shadow-lg border border-slate-200 p-2.5 animate-in fade-in zoom-in-95 duration-150 ${activeHotspot.modalClass}`}
        >
          {/* Top Header */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                <activeHotspot.icon className="w-3.5 h-3.5 text-slate-600" />
              </div>
              {isRunning && (
                <span className="w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white absolute -bottom-0.5 -right-0.5" />
              )}
            </div>

            <div>
              <h4 className="font-semibold text-slate-900 text-xs leading-tight">
                {activeHotspot.name}
              </h4>
              <div className={`flex items-center gap-1 text-[10px] mt-0.5 ${isRunning ? "text-blue-600" : "text-slate-500"}`}>
                <span className={`w-1 h-1 rounded-full ${isRunning ? "bg-blue-600 motion-safe:animate-pulse" : "bg-slate-400"}`} />
                <span>{isRunning ? "Running" : "Idle"}</span>
              </div>
            </div>
          </div>

          {/* Task Title */}
          <div className="mt-2 pt-2 border-t border-slate-100">
            <div className="text-[11px] text-slate-600 leading-4">
              <span title={activeHotspot.defaultTask} className="line-clamp-2">{activeHotspot.defaultTask}</span>
            </div>

          </div>

          {/* Open Agent CTA Button */}
          <button
            onClick={() => handleOpenAgent(activeHotspot.role)}
            className="mt-2 pt-1.5 border-t border-slate-100 w-full flex items-center justify-between text-[11px] font-medium text-slate-700 hover:text-blue-600 transition group"
          >
            <span>View agent</span>
            <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-blue-600 transition" />
          </button>
        </div>
      )}

      {/* Interactive Clean Hotspots Over Each Desk Pill */}
      {hotspots.map((agent) => {
        const isActiveAgent = activeAgent === agent.role;
        const isHovered = hoveredAgent === agent.role;
        const agentIsRunning = agentStatuses[agent.role] === "running";

        return (
          <div
            key={agent.role}
            style={{ top: agent.position.top, left: agent.position.left }}
            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20"
            onMouseEnter={() => handleAgentEnter(agent.role)}
            onMouseLeave={handleAgentLeave}
            onClick={() => handleOpenAgent(agent.role)}
            title={`Click to open ${agent.name}`}
          >
            {/* In Modern office, render sleek floating agent badges; in Wooden office, match original screenshot */}
            {isModern ? (
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-md transition-all whitespace-nowrap ${
                  isActiveAgent
                    ? "bg-[#2563eb] text-white ring-2 ring-white animate-pulse"
                    : isHovered
                    ? "bg-blue-50 text-blue-700 ring-2 ring-blue-500 scale-105"
                    : "bg-white/95 text-slate-800 border border-slate-200/90 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isActiveAgent
                      ? "bg-white"
                      : agentIsRunning
                      ? "bg-blue-600 animate-pulse"
                      : "bg-slate-400"
                  }`}
                />
                <span>{agent.name}</span>
              </div>
            ) : isActiveAgent ? (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-[#2563eb] text-white shadow-lg ring-2 ring-white animate-pulse whitespace-nowrap">
                <span className="text-xs">☕</span>
                <span>{agent.name}</span>
              </div>
            ) : (
              <div
                className={`w-28 h-7 rounded-full transition-all duration-200 flex items-center justify-center ${
                  isHovered
                    ? "ring-2 ring-blue-400 bg-blue-400/20 shadow-xs"
                    : "hover:ring-2 hover:ring-blue-400/50 hover:bg-blue-500/10"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
