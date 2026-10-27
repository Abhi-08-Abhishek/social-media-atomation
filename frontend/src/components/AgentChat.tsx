"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { AgentResponse } from "./AgentResponse";
import { ScriptReview, type ContentScript } from "./ScriptReview";
import { useSocialixStore, AgentRole, type PlanBrief } from "@/lib/store";
import {
  Send,
  Clock,
  Sparkles,
  Bot,
  Search,
  Calendar,
  BarChart2,
  ListTodo,
  MessageSquare,
  History,
  RotateCw,
  CheckCircle2,
  Brain,
  Lightbulb,
  Globe,
  ArrowRight,
  ExternalLink,
  TrendingUp,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Tag,
  Zap,
  FilePenLine,
} from "lucide-react";

interface AgentConfig {
  role: AgentRole;
  name: string;
  avatarImg?: string;
  icon: any;
  color: string;
  status: "running" | "idle" | "paused";
  subtitle: string;
  tabs: ("chat" | "history" | "tasks")[];
  chatGreeting: string;
  chatDetail?: string;
  historyTasks: {
    id: string;
    assignedBy: string;
    title: string;
    status: "running" | "completed" | "pending";
    timeAgo: string;
  }[];
}

export interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  role?: AgentRole;
  text: string;
  timestamp: string;
  status?: "running" | "completed" | "error";
  planBrief?: PlanBrief;
  planSummary?: {
    tasks: { agent: string; title: string; status: string }[];
    scheduledTime?: string;
  };
}

const AGENT_CONFIGS: Record<AgentRole, AgentConfig> = {
  MASTER: {
    role: "MASTER",
    name: "Content lead",
    icon: Brain,
    color: "bg-slate-800",
    status: "idle",
    subtitle: "Plans your requests, assigns agents",
    tabs: ["chat", "tasks"],
    chatGreeting: "What are we working on today?",
    chatDetail:
      "Try \"Plan a week of Instagram posts about our launch.\" I'll put together a plan and keep you updated here.",
    historyTasks: [],
  },
  RESEARCH: {
    role: "RESEARCH",
    name: "Research Agent",
    avatarImg: "/avatar-research.png",
    icon: Search,
    color: "bg-amber-500",
    status: "idle",
    subtitle: "Finds stories and checks sources",
    tabs: ["chat", "history"],
    chatGreeting:
      "Here's where you'll find the stories and sources behind your posts.",
    chatDetail:
      "Check the links and dates before turning a story into a post.",
    historyTasks: [],
  },
  SCRIPT: {
    role: "SCRIPT",
    name: "Script Agent",
    icon: FilePenLine,
    color: "bg-violet-600",
    status: "idle",
    subtitle: "Turns research into editable scripts",
    tabs: ["chat", "history"],
    chatGreeting: "Review each script before any image, carousel, or Reel is generated.",
    chatDetail: "Edit the copy or scenes, save your changes, then approve the script for the Creator Agent.",
    historyTasks: [],
  },
  CREATOR: {
    role: "CREATOR",
    name: "Creator Agent",
    avatarImg: "/avatar-creator.png",
    icon: Bot,
    color: "bg-pink-600",
    status: "idle",
    subtitle: "Writes captions and prepares drafts",
    tabs: ["chat", "history"],
    chatGreeting:
      "Your image posts, carousel slides and narrated Reel drafts will appear here.",
    chatDetail:
      "Each draft starts with the research and your brief. Review it before scheduling.",
    historyTasks: [],
  },
  SCHEDULER: {
    role: "SCHEDULER",
    name: "Scheduler Agent",
    avatarImg: "/avatar-scheduler.png",
    icon: Calendar,
    color: "bg-blue-600",
    status: "idle",
    subtitle: "Keeps your posting schedule in order",
    tabs: ["chat", "history"],
    chatGreeting:
      "See which posts are scheduled and when they'll go out through Zernio.",
    historyTasks: [],
  },
  ANALYTICS: {
    role: "ANALYTICS",
    name: "Analytics Agent",
    avatarImg: "/avatar-analytics.png",
    icon: BarChart2,
    color: "bg-emerald-600",
    status: "idle",
    subtitle: "Checks how your posts are doing",
    tabs: ["chat", "history"],
    chatGreeting:
      "Once your posts are published, check their available reach, views and engagement here.",
    historyTasks: [],
  },
  STRATEGIST: {
    role: "STRATEGIST",
    name: "Growth Strategist",
    icon: Lightbulb,
    color: "bg-amber-600",
    status: "idle",
    subtitle: "Suggests what to try next",
    tabs: ["chat", "history"],
    chatGreeting: "Find ideas for your next posts, based on what's working.",
    chatDetail: "Each suggestion links back to your results. You decide which ideas to use.",
    historyTasks: [],
  },
};

function parseDetail(detail?: string): any {
  if (!detail) return null;
  try {
    return JSON.parse(detail);
  } catch {
    return null;
  }
}

function PlannerBriefCard({ brief }: { brief: PlanBrief }) {
  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Plan ready</p>
          <h3 className="mt-1 font-bold text-slate-900">{brief.title}</h3>
        </div>
      </div>
      <div className="mt-3 border-l-2 border-blue-200 pl-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Objective</p>
        <p className="mt-1 text-sm leading-6 text-slate-700">{brief.objective}</p>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Content pillars</p>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
            {brief.contentPillars.map((pillar) => <li key={pillar} className="flex gap-2"><span className="text-blue-500">•</span><span>{pillar}</span></li>)}
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Research questions</p>
          <ol className="mt-2 space-y-1.5 text-xs text-slate-700">
            {brief.researchQuestions.map((question, index) => <li key={question} className="flex gap-2"><span className="font-semibold text-blue-600">{index + 1}.</span><span>{question}</span></li>)}
          </ol>
        </div>
      </div>
      {!!brief.deliverables?.length && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Planned deliverables</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {brief.deliverables.map((item, index) => (
              <div key={`${item.platform}-${item.format}-${index}`} className="rounded-lg border border-blue-100 bg-white px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600">{index + 1}. {item.platform} · {item.format}</p>
                <p className="mt-1 text-xs font-semibold text-slate-800">{item.topic}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{item.objective}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <details className="group mt-4 border-t border-blue-100 pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-blue-700">
          View full plan <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Success metrics</p><ul className="mt-2 space-y-1 text-xs text-slate-700">{brief.successMetrics.map((item) => <li key={item}>• {item}</li>)}</ul></div>
          <div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Creator instructions</p><p className="mt-2 text-xs leading-5 text-slate-700">{brief.creatorInstructions}</p></div>
        </div>
      </details>
    </section>
  );
}

export function AgentChat() {
  const { activeAgent, setActiveAgent, agentStatuses, plans, posts, executeGoal, messages: savedMessages, currentCampaignId } = useSocialixStore();
  const [activeTab, setActiveTab] = useState<string>("chat");
  const [inputPrompt, setInputPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);

  const currentConfig = AGENT_CONFIGS[activeAgent];
  const activePlan = plans[0];

  // Auto-scroll chat when messages update
  useEffect(() => {
    const panel = conversationRef.current;
    if (panel) panel.scrollTo({ top: panel.scrollHeight, behavior: "smooth" });
  }, [messages, activeTab]);

  // Load existing plan into chat history on load if available
  useEffect(() => {
    if (savedMessages.length) {
      setMessages(savedMessages.map((message) => {
        const plan = message.metadata?.planId ? plans.find((item) => item.id === message.metadata?.planId) : undefined;
        const isPlannerResult = message.metadata?.step === "MASTER" || message.content === "Master step completed.";
        return {
          id: message.id, sender: message.sender === "USER" ? "user" : "agent",
          role: "MASTER", text: isPlannerResult && plan?.brief ? "Your content plan is ready. Research is starting." : message.content,
          timestamp: new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          planBrief: isPlannerResult ? plan?.brief || undefined : undefined,
          planSummary: isPlannerResult && plan ? { tasks: plan.tasks.map((task) => ({ agent: task.assignedAgent, title: task.title, status: task.status })) } : undefined,
        } satisfies ChatMessage;
      }));
    } else if (plans.length > 0) {
      const p = plans[0];
      setMessages([
        {
          id: `init_user_${p.id}`,
          sender: "user",
          text: p.title,
          timestamp: p.createdAt,
        },
        {
          id: `init_agent_${p.id}`,
          sender: "agent",
          role: "MASTER",
          text: `Here's the plan for "${p.title}":`,
          timestamp: p.createdAt,
          status: p.status === "failed" ? "error" : "completed",
          planBrief: p.brief || undefined,
          planSummary: {
            tasks: p.tasks.map((t) => ({
              agent: t.assignedAgent,
              title: t.title,
              status: t.status,
            })),
          },
        },
      ]);
    } else setMessages([]);
  }, [savedMessages, plans, currentCampaignId]);

  // When activeAgent changes, ensure activeTab is valid for this agent
  useEffect(() => {
    if (!currentConfig.tabs.includes(activeTab as any)) {
      setActiveTab(currentConfig.tabs[0]);
    }
  }, [activeAgent, currentConfig, activeTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || isSubmitting) return;

    const query = inputPrompt.trim();
    setInputPrompt("");
    setIsSubmitting(true);

    const userMsgId = `msg_user_${crypto.randomUUID()}`;
    const agentMsgId = `msg_agent_${crypto.randomUUID()}`;
    const currentTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: "user",
      text: query,
      timestamp: currentTime,
    };

    const agentThinkingMsg: ChatMessage = {
      id: agentMsgId,
      sender: "agent",
      role: activeAgent,
      text: `Putting together a plan for: "${query}"`,
      timestamp: currentTime,
      status: "running",
    };

    setMessages((prev) => [...prev, userMsg, agentThinkingMsg]);
    try {
      await executeGoal(query);

      const latestPlan = useSocialixStore.getState().plans[0];
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentMsgId
            ? {
                ...m,
                status: "completed",
                text: `Got it. Your request is queued — you can follow each step above.`,
                planSummary: {
                  tasks:
                    latestPlan?.tasks.map((t) => ({
                      agent: t.assignedAgent,
                      title: t.title,
                      status: t.status,
                    })) || [],
                },
              }
            : m
        )
      );
    } catch (err: unknown) {
      const latestPlan = useSocialixStore.getState().plans[0];
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentMsgId
            ? {
                ...m,
                status: "error",
                text: `We couldn’t start this request. ${err instanceof Error ? err.message : "Please try again."}`,
                planSummary: latestPlan
                  ? {
                      tasks: latestPlan.tasks.map((t) => ({
                        agent: t.assignedAgent,
                        title: t.title,
                        status: t.status,
                      })),
                    }
                  : undefined,
              }
            : m
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTabLabel = (tab: string) => {
    switch (tab) {
      case "chat":
        return activeAgent === "MASTER" ? "Conversation" : "Updates & results";
      case "history":
        return "History";
      case "tasks":
        return "Tasks";
      default:
        return tab;
    }
  };

  const getTabIcon = (tab: string) => {
    switch (tab) {
      case "chat":
        return activeAgent === "MASTER" ? <MessageSquare className="w-4 h-4" /> : <Zap className="w-4 h-4" />;
      case "history":
        return <History className="w-4 h-4" />;
      case "tasks":
        return <ListTodo className="w-4 h-4" />;
      default:
        return null;
    }
  };

  // Agent-specific data
  const researchTask = activePlan?.tasks?.find((t) => t.assignedAgent === "RESEARCH");
  const scriptTask = activePlan?.tasks?.find((t) => t.assignedAgent === "SCRIPT");
  const creatorTask = activePlan?.tasks?.find((t) => t.assignedAgent === "CREATOR");
  const schedulerTask = activePlan?.tasks?.find((t) => t.assignedAgent === "SCHEDULER");

  const parsedResearch = parseDetail(researchTask?.detail);
  const parsedScript = parseDetail(scriptTask?.detail);
  const parsedCreator = parseDetail(creatorTask?.detail);
  const campaignPosts = posts;

  return (
    <div className="flex h-[78dvh] min-h-[560px] flex-col overflow-hidden rounded-2xl border border-white bg-white shadow-[0_8px_40px_-16px_rgba(30,64,175,0.22)] ring-1 ring-slate-200/90 md:h-[calc(100dvh-210px)]">
      {/* Left Agent Selector Strip */}
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200/70 bg-gradient-to-b from-white to-slate-50/80 p-2" aria-label="Choose a team member">
        {(Object.keys(AGENT_CONFIGS) as AgentRole[]).map((role) => {
          const cfg = AGENT_CONFIGS[role];
          const isSelected = activeAgent === role;
          const isRunning = agentStatuses[role] === "running" || cfg.status === "running";

          return (
            <button
              key={role}
              onClick={() => setActiveAgent(role)}
              title={cfg.name}
              aria-label={cfg.name}
              aria-pressed={isSelected}
              className={`relative flex shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors ${
                isSelected
                  ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-500 hover:bg-white hover:text-slate-800"
              }`}
            >
              <cfg.icon className="h-4 w-4" />
              <span>{role === "MASTER" ? "Content lead" : role === "STRATEGIST" ? "Strategy" : cfg.name.replace(" Agent", "")}</span>

              {/* Running Status Dot */}
              {isRunning && (
                <span aria-label="Working" className="h-1.5 w-1.5 rounded-full bg-blue-500 motion-safe:animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* Main Agent Center Area */}
      <div className="flex-1 flex flex-col justify-between min-w-0 min-h-0">
        {/* Top Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3 bg-gradient-to-r from-white via-white to-blue-50/40">
          <div className="flex items-center gap-3">
            <div className="relative">
              {currentConfig.avatarImg ? (
                <img
                  src={currentConfig.avatarImg}
                  alt={currentConfig.name}
                  className="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-xs"
                />
              ) : (
                <div
                  className={`w-10 h-10 rounded-full ${currentConfig.color} text-white flex items-center justify-center shadow-xs`}
                >
                  <currentConfig.icon className="w-5 h-5" />
                </div>
              )}
              {(agentStatuses[activeAgent] === "running" || currentConfig.status === "running") && (
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-white absolute bottom-0 right-0 animate-ping" />
              )}
            </div>

            <div>
              <h3 className="font-bold text-slate-900 text-base leading-tight">
                {currentConfig.name}
              </h3>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span className="flex items-center gap-1.5 font-medium text-slate-500">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      agentStatuses[activeAgent] === "running" || currentConfig.status === "running"
                        ? "bg-blue-600 animate-pulse"
                        : "bg-slate-400"
                    }`}
                  />
                  <span>
                    {agentStatuses[activeAgent] === "running" || currentConfig.status === "running"
                      ? "Working"
                      : "Not running"}
                  </span>
                </span>
                <span className="truncate max-w-[200px] sm:max-w-xs">{currentConfig.subtitle}</span>
              </div>
            </div>
          </div>

          <nav aria-label={`${currentConfig.name} views`} className="ml-auto flex w-full items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-medium sm:w-auto">
            {currentConfig.tabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  aria-pressed={isActive}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 transition sm:flex-none ${
                    isActive
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {getTabIcon(tab)}
                  <span>{getTabLabel(tab)}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Dynamic Tab Body */}
        <div ref={conversationRef} className="min-h-0 flex-1 p-4 sm:p-6 overflow-y-auto bg-gradient-to-b from-slate-50/60 via-white to-white">
          {/* ================= CHAT / EXECUTION TAB ================= */}
          {activeTab === "chat" && (
            <div className="space-y-4">
              {/* Agent Greeting Bubble */}
              <div className="flex gap-3">
                <div className="relative shrink-0">
                  {currentConfig.avatarImg ? (
                    <img
                      src={currentConfig.avatarImg}
                      alt={currentConfig.name}
                      className="w-9 h-9 rounded-full object-cover border border-slate-200 shadow-xs"
                    />
                  ) : (
                    <div
                      className={`w-9 h-9 rounded-full ${currentConfig.color} text-white flex items-center justify-center`}
                    >
                      <currentConfig.icon className="w-5 h-5" />
                    </div>
                  )}
                </div>

                <div className="py-1 text-sm leading-6 text-slate-700 max-w-xl space-y-1.5">
                  <p className="font-semibold text-slate-900 whitespace-pre-line">
                    {currentConfig.chatGreeting}
                  </p>
                  {currentConfig.chatDetail && (
                    <p className="text-slate-600">{currentConfig.chatDetail}</p>
                  )}
                </div>
              </div>

              {/* === MASTER AGENT VIEW: Conversational feed === */}
              {activeAgent === "MASTER" && (
                <>
                  {messages.map((msg) => {
                    if (msg.sender === "user") {
                      return (
                        <div
                          key={msg.id}
                          className="flex justify-end gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150"
                        >
                          <div className="bg-blue-50/80 border border-blue-100 text-slate-800 rounded-xl rounded-tr-sm p-4 text-sm leading-relaxed max-w-xl shadow-sm space-y-2">
                            <p className="font-medium whitespace-pre-wrap">{msg.text}</p>
                            <p className="text-[10px] text-slate-400 text-right">You · {msg.timestamp}</p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={msg.id}
                        className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-150"
                      >
                        <div className="relative hidden sm:block shrink-0">
                          <div className="w-8 h-8 rounded-lg bg-slate-800 text-white flex items-center justify-center shadow-xs">
                            <Brain className="w-5 h-5" />
                          </div>
                        </div>

                        <div className="min-w-0 flex-1 bg-gradient-to-br from-white via-white to-blue-50/30 border border-slate-200/80 rounded-xl p-4 sm:p-5 text-sm leading-relaxed text-slate-800 space-y-4 shadow-[0_2px_12px_-6px_rgba(30,64,175,0.18)]">
                          <div className="flex flex-wrap gap-2 items-center justify-between border-b border-slate-100 pb-3">
                            <span className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>Content lead</span>
                              {msg.status === "running" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
                                  <RotateCw className="w-2.5 h-2.5 animate-spin" />
                                  Planning
                                </span>
                              ) : msg.status === "error" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700 border border-rose-200">
                                  <AlertCircle className="w-2.5 h-2.5" />
                                  Needs attention
                                </span>
                              ) : null}
                            </span>
                            <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
                          </div>

                          <AgentResponse text={msg.text} />

                          {msg.planBrief && <PlannerBriefCard brief={msg.planBrief} />}

                          {/* If Swarm is running */}
                          {msg.status === "running" && (
                            <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-2">
                              <div className="flex items-center gap-2 text-xs text-blue-600 font-semibold">
                                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Preparing your request…</span>
                              </div>
                              <div className="space-y-1 text-[11px] text-slate-500 pl-4">
                                <p>The workflow above shows which step is actually running. Scheduling follows your campaign’s approval settings.</p>
                              </div>
                            </div>
                          )}

                          {/* Task summary */}
                          {msg.planSummary && (
                            <div className="space-y-2.5 pt-1">
                              <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1.5">
                                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                                  Plan at the time of this reply
                                </div>
                                {msg.planSummary.tasks.map((t, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-start justify-between gap-2 text-[11px] text-slate-600"
                                  >
                                    <div className="flex items-start gap-2">
                                      {t.status === "done" ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                      ) : t.status === "running" ? (
                                        <RotateCw className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5 animate-spin" />
                                      ) : t.status === "failed" ? (
                                        <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                                      ) : (
                                        <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
                                      )}
                                      <span>
                                        <strong className="text-slate-800">{AGENT_CONFIGS[t.agent as AgentRole]?.name || t.agent}:</strong> {t.title}
                                      </span>
                                    </div>
                                    <span
                                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                                        t.status === "done"
                                          ? "bg-emerald-50 text-emerald-600"
                                          : t.status === "running"
                                          ? "bg-blue-50 text-blue-600"
                                          : t.status === "failed"
                                          ? "bg-rose-50 text-rose-600"
                                          : "bg-slate-100 text-slate-400"
                                      }`}
                                    >
                                      {t.status === "done"
                                        ? "Completed"
                                        : t.status === "running"
                                        ? "Active"
                                        : t.status === "failed"
                                        ? "Failed"
                                        : "Pending"}
                                    </span>
                                  </div>
                                ))}
                              </div>

                              <div className="flex items-center gap-2 pt-1">
                                <Link
                                  href="/posts"
                                  className="flex-1 text-center py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition"
                                >
                                  Review posts →
                                </Link>
                                <Link
                                  href="/calendar"
                                  className="flex-1 text-center py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
                                >
                                  View in Calendar
                                </Link>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* === RESEARCH AGENT VIEW: Real Web Intelligence === */}
              {activeAgent === "RESEARCH" && (
                <div className="space-y-4">
                  {agentStatuses.RESEARCH === "running" ? (
                    <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-amber-900 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                        <RotateCw className="w-4 h-4 animate-spin text-amber-600" />
                        <span>Looking into your topic…</span>
                      </div>
                      <p className="text-[11px] text-amber-700">
                        Finding relevant stories, checking dates, and collecting sources for your draft.
                      </p>
                    </div>
                  ) : parsedResearch ? (
                    <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2">
                          <Search className="w-4 h-4 text-amber-600" />
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                            Research notes
                          </h4>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                          {parsedResearch.sources?.length || 0} Sources Analyzed
                        </span>
                      </div>

                      {Array.isArray(parsedResearch.evidence) && parsedResearch.evidence.length > 0 && <section className="space-y-3">
                        <h5 className="text-sm font-semibold text-slate-800">Facts behind this draft</h5>
                        {parsedResearch.evidence.map((item: { claim: string; sourceUrl: string; supportingQuote: string; eventDate: string; limitation: string }, index: number) => <details key={index} className="rounded-lg border border-slate-200 p-3">
                          <summary className="cursor-pointer text-sm leading-6 text-slate-700">{item.claim}</summary>
                          <p className="mt-2 text-xs text-slate-500">Event date: {item.eventDate}</p>
                          <blockquote className="my-2 border-l-2 border-blue-200 pl-3 text-xs leading-6 text-slate-600">{item.supportingQuote}</blockquote>
                          <p className="text-xs leading-6 text-slate-500">{item.limitation}</p>
                          <a href={/^https?:\/\//i.test(item.sourceUrl) ? item.sourceUrl : undefined} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-medium text-blue-600">Read the source →</a>
                        </details>)}
                      </section>}

                      {/* Trending Topics */}
                      {Array.isArray(parsedResearch.trendingTopics) && parsedResearch.trendingTopics.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
                            <span>What the research found</span>
                          </p>
                          <ul className="list-disc space-y-2 pl-5 marker:text-blue-400">
                            {parsedResearch.trendingTopics.map((topic: string, i: number) => (
                              <li
                                key={i}
                                className="text-sm leading-6 text-slate-600"
                              >
                                {topic}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Viral Hooks */}
                      {Array.isArray(parsedResearch.viralHooks) && parsedResearch.viralHooks.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-blue-600" />
                            <span>Possible opening lines</span>
                          </p>
                          <div className="space-y-1">
                            {parsedResearch.viralHooks.slice(0, 6).map((hook: string, i: number) => (
                              <div
                                key={i}
                                className="border-l-2 border-blue-200 py-1 pl-3 text-sm leading-6 text-slate-600"
                              >
                                &ldquo;{hook}&rdquo;
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recommended Hashtags */}
                      {Array.isArray(parsedResearch.recommendedHashtags) && parsedResearch.recommendedHashtags.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-purple-600" />
                            <span>Recommended Hashtags</span>
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {parsedResearch.recommendedHashtags.map((tag: string, i: number) => (
                              <span
                                key={i}
                                className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md font-medium"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Web Sources */}
                      {Array.isArray(parsedResearch.sources) && parsedResearch.sources.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-slate-100">
                          <p className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5 text-slate-500" />
                            <span>Sources to review</span>
                          </p>
                          <div className="space-y-1.5">
                            {parsedResearch.sources.map((source: any, i: number) => (
                              <a
                                key={i}
                                href={typeof source.url === "string" && /^https?:\/\//i.test(source.url) ? source.url : undefined}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-100 transition group text-xs"
                              >
                                <span className="font-medium text-slate-700 truncate max-w-sm group-hover:text-blue-600">
                                  {source.title}
                                </span>
                                <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-8 text-center bg-slate-50 border border-slate-200/80 rounded-2xl">
                      <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-700">No active research task</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Share a topic with the Master Agent to start the research.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* === SCRIPT AGENT VIEW: Editable approval gate === */}
              {activeAgent === "SCRIPT" && activePlan && (
                <ScriptReview
                  planId={activePlan.id}
                  scripts={(Array.isArray(parsedScript?.scripts) ? parsedScript.scripts : []) as ContentScript[]}
                />
              )}

              {/* === CREATOR AGENT VIEW: Created Drafts === */}
              {activeAgent === "CREATOR" && (
                <div className="space-y-4">
                  {agentStatuses.CREATOR === "running" ? (
                    <div className="p-4 rounded-2xl bg-pink-50/70 border border-pink-200 text-pink-900 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-pink-800">
                        <RotateCw className="w-4 h-4 animate-spin text-pink-600" />
                        <span>Putting your draft together…</span>
                      </div>
                      <p className="text-[11px] text-pink-700">
                        Turning the research into clear copy and a branded image, using your campaign guidance.
                      </p>
                    </div>
                  ) : campaignPosts.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Bot className="w-4 h-4 text-pink-600" />
                          <span>Your campaign posts ({campaignPosts.length})</span>
                        </h4>
                        <Link
                          href="/posts"
                          className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          View Posts Hub <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>

                      <div className="space-y-3">
                        {campaignPosts.slice(0, 4).map((post) => (
                          <div
                            key={post.id}
                            className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3.5 items-start"
                          >
                            {post.imageUrl && /\.(mp4|mov|webm)(\?|$)/i.test(post.imageUrl) ? <video src={post.imageUrl} controls preload="metadata" aria-label={post.title} className="h-32 w-24 shrink-0 rounded-lg bg-slate-100 object-contain" /> : post.imageUrl && (
                              <img
                                src={post.imageUrl}
                                alt={post.title}
                                className="w-20 h-20 rounded-xl object-cover shrink-0 border border-slate-100 shadow-xs"
                              />
                            )}
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200">
                                  {post.platform}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-500">
                                  {post.format}
                                </span>
                                {post.timeSlot && (
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    Slot: {post.timeSlot}
                                  </span>
                                )}
                              </div>
                              <h5 className="text-xs font-bold text-slate-900 leading-tight">
                                {post.title}
                              </h5>
                              <p className="text-[11px] text-slate-600 line-clamp-2">
                                {post.caption}
                              </p>
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {post.hashtags?.slice(0, 4).map((tag, idx) => (
                                  <span key={idx} className="text-[10px] text-blue-600">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center bg-slate-50 border border-slate-200/80 rounded-2xl">
                      <Bot className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-700">No content drafts yet</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Your drafts will appear here once the research is ready.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* === SCHEDULER AGENT VIEW === */}
              {activeAgent === "SCHEDULER" && (
                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span>Your publishing schedule</span>
                    </h4>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                      {campaignPosts.filter((post) => post.status === "DRAFT").length} drafts
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    In review mode, you choose which drafts go out. Automatic campaigns follow their configured approval and quality checks.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Link
                      href="/posts"
                      className="text-xs font-semibold px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition"
                    >
                      Review & Approve Drafts →
                    </Link>
                    <Link
                      href="/calendar"
                      className="text-xs font-semibold px-4 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                    >
                      View Calendar
                    </Link>
                  </div>
                </div>
              )}

              {/* === ANALYTICS / STRATEGIST VIEW === */}
              {(activeAgent === "ANALYTICS" || activeAgent === "STRATEGIST") && (
                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
                  <h4 className="text-xs font-bold text-slate-900">
                    {activeAgent === "ANALYTICS" ? "What happens after publishing" : "What to try next"}
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {activeAgent === "ANALYTICS" ? "Once your posts are published, we can review the reach and engagement your connected platforms provide. Missing metrics won’t be treated as zero." : "Recommendations use your measured results. When there isn’t enough data, we’ll say so. You choose which ideas become the next brief."}
                  </p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* ================= HISTORY TAB (Worker Agents) ================= */}
          {activeTab === "history" && (
            <div className="space-y-4">
              {(() => {
                const assignedTasks = plans.flatMap((p) =>
                  p.tasks
                    .filter((t) => t.assignedAgent === activeAgent)
                    .map((t) => ({ ...t, planTitle: p.title, planCreatedAt: p.createdAt }))
                );

                if (assignedTasks.length > 0) {
                  return assignedTasks.map((task) => {
                    const parsed = parseDetail(task.detail);
                    const isExpanded = expandedTaskId === task.id;

                    return (
                      <div
                        key={task.id}
                        className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col gap-3 transition"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-xl ${currentConfig.color} text-white flex items-center justify-center shrink-0 shadow-xs font-bold text-xs`}
                            >
                              <currentConfig.icon className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-800">{task.title}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                Assigned by Master Agent • Campaign: {task.planTitle}
                              </p>
                            </div>
                          </div>

                          <span
                            className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${
                              task.status === "done"
                                ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                : task.status === "failed"
                                ? "bg-rose-50 text-rose-600 border border-rose-200"
                                : task.status === "running"
                                ? "bg-blue-50 text-blue-600 border border-blue-200"
                                : "bg-slate-50 text-slate-600 border border-slate-200"
                            }`}
                          >
                            {task.status === "done"
                              ? "Completed"
                              : task.status === "failed"
                              ? "Failed"
                              : task.status === "running"
                              ? "Running"
                              : "Pending"}
                          </span>
                        </div>

                        {/* If task failed, show error clearly */}
                        {task.status === "failed" && (
                          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                              {parsed?.error || "This step couldn't be completed. Check the details and try again."}
                            </span>
                          </div>
                        )}

                        {/* Research Output Details */}
                        {activeAgent === "RESEARCH" && task.status === "done" && parsed && (
                          <div className="space-y-2 pt-2 border-t border-slate-100">
                            {parsed.viralHooks && (
                              <div className="text-[11px] text-slate-600">
                                <strong className="text-slate-800">Top Viral Hook:</strong> &ldquo;
                                {parsed.viralHooks[0]}&rdquo;
                              </div>
                            )}
                            {parsed.trendingTopics && (
                              <div className="flex flex-wrap gap-1">
                                {parsed.trendingTopics.slice(0, 3).map((topic: string, i: number) => (
                                  <span
                                    key={i}
                                    className="text-[10px] bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md font-medium"
                                  >
                                    {topic}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Creator Output Details */}
                        {activeAgent === "CREATOR" && task.status === "done" && (
                          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                            <span className="text-[11px] text-slate-500">
                              Drafts generated with platform copy & visuals
                            </span>
                            <Link
                              href="/posts"
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                            >
                              View in Posts Hub →
                            </Link>
                          </div>
                        )}

                        {activeAgent === "SCRIPT" && task.status === "done" && (
                          <div className="pt-2 text-[11px] text-slate-500 border-t border-slate-100">
                            {Array.isArray(parsed?.scripts) ? `${parsed.scripts.length} script(s) ready for review` : "Scripts ready for review"}
                          </div>
                        )}

                        {/* Scheduler Output */}
                        {activeAgent === "SCHEDULER" && (
                          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                            <span className="text-[11px] text-slate-500">
                              Publishing slots queued for Zernio Gateway
                            </span>
                            <Link
                              href="/calendar"
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                            >
                              View in Calendar →
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  });
                }

                return (
                  <div className="p-8 text-center bg-slate-50 border border-slate-200/80 rounded-2xl">
                    <p className="text-xs font-semibold text-slate-700">
                      No previous tasks for {currentConfig.name}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      When you send a prompt to the Master Agent, it delegates specific tasks to{" "}
                      {currentConfig.name} and progress will appear here.
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ================= TASKS TAB (Master Agent) ================= */}
          {activeTab === "tasks" && (
            <div className="space-y-4">
              {activePlan ? (
                <>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{activePlan.title}</h4>
                      <p className="text-xs text-slate-400">{activePlan.createdAt}</p>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        activePlan.status === "failed"
                          ? "bg-rose-50 text-rose-600 border border-rose-200"
                          : "bg-blue-50 text-blue-600 border border-blue-200"
                      }`}
                    >
                      {activePlan.status.replaceAll("_", " ")}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {activePlan.tasks.map((task) => {
                      const isExpanded = expandedTaskId === task.id;
                      const parsed = parseDetail(task.detail);

                      return (
                        <div
                          key={task.id}
                          className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100/50 transition space-y-2"
                        >
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            className="flex w-full items-center justify-between gap-3 text-left"
                            onClick={() =>
                              setExpandedTaskId(isExpanded ? null : task.id)
                            }
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-xs">
                                {task.assignedAgent.charAt(0)}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-800">{task.title}</p>
                                <p className="text-[11px] text-slate-400 capitalize">
                                  {task.assignedAgent.toLowerCase()} agent
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                                  task.status === "done"
                                    ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                    : task.status === "failed"
                                    ? "bg-rose-50 text-rose-600 border border-rose-200"
                                    : task.status === "running"
                                    ? "bg-blue-50 text-blue-600 border border-blue-200"
                                    : "bg-slate-50 text-slate-600 border border-slate-200"
                                }`}
                              >
                                {task.status === "done"
                                  ? "Completed"
                                  : task.status === "failed"
                                  ? "Failed"
                                  : task.status}
                              </span>
                              {task.detail && (
                                <span className="text-slate-400">
                                  {isExpanded ? (
                                    <ChevronUp className="w-4 h-4" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4" />
                                  )}
                                </span>
                              )}
                            </div>
                          </button>

                          {/* Expanded Task Output Details */}
                          {isExpanded && task.detail && (
                            <div className="pt-2 border-t border-slate-200 text-xs text-slate-700 space-y-2">
                              {task.status === "failed" && (
                                <div className="p-2 rounded bg-rose-50 text-rose-700 text-xs">
                                  {parsed?.error || task.detail}
                                </div>
                              )}
                              {task.assignedAgent === "RESEARCH" && parsed?.viralHooks && (
                                <div className="space-y-1">
                                  <p className="font-bold text-[11px] text-slate-800">Viral Hooks Discovered:</p>
                                  <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                                    {parsed.viralHooks.slice(0, 3).map((h: string, idx: number) => (
                                      <li key={idx}>&ldquo;{h}&rdquo;</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {task.assignedAgent === "CREATOR" && (
                                <p className="text-[11px] text-slate-600">
                                  Platform posts generated and saved to Posts Hub.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="p-8 text-center bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <p className="text-xs font-semibold text-slate-700">No plan yet</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Start with an idea below, like &ldquo;Create 3 posts for our brand launch.&rdquo;
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Natural Language Prompt Input */}
        {activeAgent === "MASTER" ? (
          <form onSubmit={handleSubmit} className="p-4 border-t border-slate-200/70 bg-gradient-to-b from-white to-slate-50/70">
            <div className="flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-50">
            <textarea
              rows={2}
              aria-label="Your content brief"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder="What would you like to share? Add a topic, audience, and goal…"
              className="min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 text-slate-800 placeholder-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!inputPrompt.trim() || isSubmitting}
              aria-label="Send content brief"
              className="w-10 h-10 rounded-lg bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 text-white flex items-center justify-center shadow-sm shadow-blue-500/20 transition shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">{isSubmitting ? "Sending your brief…" : "Your team uses your campaign’s brand voice and approval settings."}</p>
          </form>
        ) : (
          <p className="border-t border-slate-100 p-4 text-center text-xs text-slate-500">
            These are your team’s updates. <button type="button" onClick={() => setActiveAgent("MASTER")} className="font-medium text-blue-600 hover:underline">Send a brief to your content lead →</button>
          </p>
        )}
      </div>
    </div>
  );
}
