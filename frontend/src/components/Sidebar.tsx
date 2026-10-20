"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  LayoutGrid,
  Bot,
  FileText,
  Calendar,
  BarChart3,
  Link2,
  Settings,
  ChevronDown,
  Check,
  Plus,
  Flag,
  PanelLeftClose,
  Flame,
  Rocket,
  Heart,
  Megaphone,
  Leaf,
  Star,
  Camera,
  Globe,
  Trash2,
} from "lucide-react";
import { useSocialixStore } from "@/lib/store";

export function Sidebar() {
  const pathname = usePathname();
  const {
    campaigns,
    currentCampaignId,
    setCurrentCampaign,
    deleteCampaign,
    openCreateCampaignModal,
  } = useSocialixStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const currentCampaign = campaigns.find((c) => c.id === currentCampaignId);

  const navItems = [
    { label: "Overview", href: "/", icon: LayoutGrid },
    { label: "AI Agent", href: "/agents", icon: Bot },
    { label: "Posts", href: "/posts", icon: FileText },
    { label: "Calendar", href: "/calendar", icon: Calendar },
    { label: "Analytics", href: "/analytics", icon: BarChart3 },
    { label: "Accounts", href: "/accounts", icon: Link2 },
  ];

  const getCampaignIcon = (logo: string) => {
    switch (logo) {
      case "fire":
        return <Flame className="w-5 h-5 text-orange-500 fill-orange-500" />;
      case "rocket":
        return <Rocket className="w-5 h-5 text-blue-500 fill-blue-500" />;
      case "sparkles":
        return <Sparkles className="w-5 h-5 text-purple-500 fill-purple-500" />;
      case "megaphone":
        return <Megaphone className="w-5 h-5 text-orange-500 fill-orange-500" />;
      case "leaf":
        return <Leaf className="w-5 h-5 text-emerald-500 fill-emerald-500" />;
      case "star":
        return <Star className="w-5 h-5 text-sky-500 fill-sky-500" />;
      case "camera":
        return <Camera className="w-5 h-5 text-slate-700 fill-slate-700" />;
      case "globe":
        return <Globe className="w-5 h-5 text-teal-500 fill-teal-500" />;
      case "heart":
      default:
        return <Heart className="w-5 h-5 text-pink-500 fill-pink-500" />;
    }
  };

  return (
    <aside
      className={`hidden md:flex shrink-0 h-screen sticky top-0 bg-white border-r border-slate-200 flex-col justify-between transition-all duration-300 z-30 ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      <div>
        {/* Brand Header */}
        <div className="h-16 flex items-center px-6 gap-3 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          {!collapsed && (
            <span className="font-bold text-xl tracking-tight text-slate-900">
              Socialix
            </span>
          )}
        </div>

        {/* Campaign Switcher */}
        <div className="p-3 relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={`w-full flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200/70 transition-all ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-9 h-9 rounded-xl bg-white shadow-xs border border-slate-200 flex items-center justify-center shrink-0">
                {currentCampaign ? getCampaignIcon(currentCampaign.logo) : <Sparkles className="h-5 w-5 text-slate-400" />}
              </div>
              {!collapsed && (
                <div className="text-left truncate">
                  <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    Campaign
                  </div>
                  <div className="text-sm font-semibold text-slate-800 truncate">
                    {currentCampaign ? currentCampaign.name : "No campaign yet"}
                  </div>
                </div>
              )}
            </div>
            {!collapsed && <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
          </button>

          {/* Campaign Dropdown */}
          {isDropdownOpen && !collapsed && (
            <div className="absolute top-full left-3 right-3 mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="text-[11px] font-semibold text-slate-400 px-3 py-1.5 uppercase">
                Your campaigns
              </div>
              {campaigns.length === 0 ? (
                <div className="px-3 py-3 text-center text-xs text-slate-400">
                  No active campaigns
                </div>
              ) : (
                campaigns.map((camp) => (
                  <div
                    key={camp.id}
                    onClick={() => {
                      setCurrentCampaign(camp.id);
                      setIsDropdownOpen(false);
                    }}
                    className="group w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        {getCampaignIcon(camp.logo)}
                      </div>
                      <span className="truncate">{camp.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {camp.id === currentCampaignId && (
                        <Check className="w-4 h-4 text-blue-600 shrink-0" />
                      )}
                      <button
                        type="button"
                        title={`Delete "${camp.name}"`}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteCampaign(camp.id);
                        }}
                        className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition opacity-70 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}

              <div className="border-t border-slate-100 my-1 pt-1 space-y-0.5">
                <button
                  onClick={() => {
                    openCreateCampaignModal();
                    setIsDropdownOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-xl transition"
                >
                  <Plus className="w-4 h-4 text-slate-500" />
                  <span>Create new campaign</span>
                </button>
                {currentCampaign && (
                  <button
                    onClick={() => {
                      deleteCampaign(currentCampaign.id);
                      setIsDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-400 hover:text-red-600 rounded-xl"
                  >
                    <Flag className="w-4 h-4" />
                    <span className="truncate">End "{currentCampaign.name}"</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <div className="px-3 py-2">
          {!collapsed && (
            <div className="px-3 pb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Menu
            </div>
          )}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl font-medium text-sm transition-all ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? "text-white" : "text-slate-500"}`} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="p-3 border-t border-slate-100 space-y-1">
        <Link
          href="/settings"
          className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl font-medium text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <Settings className="w-5 h-5 text-slate-500 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl font-medium text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <div className="flex items-center gap-3">
            <PanelLeftClose className="w-5 h-5 text-slate-500 shrink-0" />
            {!collapsed && <span>Collapse</span>}
          </div>
        </button>
      </div>
    </aside>
  );
}
