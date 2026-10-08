"use client"

import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  Home,
  Users,
  Package,
  Boxes,
  Wrench,
  ClipboardList,
  Calendar,
  FileText,
  DollarSign,
  Puzzle,
  ShoppingBag,
  ChevronLeft,
  ChevronDown,
  Building2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

const menuItems = [
  {
    category: "PRINCIPAL",
    items: [
      { name: "Início", icon: Home, href: "/" },
    ],
  },
  {
    category: "OPERAÇÃO",
    items: [
      { name: "Clientes", icon: Users, href: "/clientes" },
      { name: "Produtos", icon: Package, href: "/produtos" },
      { name: "Estoque", icon: Boxes, href: "/estoque" },
      { name: "Serviços", icon: Wrench, href: "/servicos" },
      { name: "Ordens de serviço", icon: ClipboardList, href: "/ordens" },
      { name: "Agenda", icon: Calendar, href: "/agenda" },
    ],
  },
  {
    category: "COMERCIAL",
    items: [
      { name: "Orçamentos", icon: FileText, href: "/orcamentos" },
      { name: "Financeiro", icon: DollarSign, href: "/financeiro" },
    ],
  },
  {
    category: "INTEGRAÇÕES",
    items: [
      { name: "Loja de integrações", icon: Puzzle, href: "/integracoes" },
      { name: "Mercado Livre", icon: ShoppingBag, href: "/mercadolivre" },
    ],
  },
]

interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void
  activePath?: string
}

export function DashboardSidebar({ collapsed = false, onToggle, activePath = "/" }: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <span className="text-lg font-bold text-primary-foreground">C</span>
          </div>
          {!collapsed && (
            <span className="text-lg font-semibold text-sidebar-foreground">
              Climaris
            </span>
          )}
        </Link>
        <button
          onClick={onToggle}
          className="flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform",
              collapsed && "rotate-180"
            )}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {menuItems.map((group) => (
          <div key={group.category} className="mb-6">
            {!collapsed && (
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                {group.category}
              </h3>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const isActive = activePath === item.href
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-primary"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-sidebar-primary")} />
                      {!collapsed && <span>{item.name}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Workspace */}
      <div className="border-t border-sidebar-border p-3">
        {!collapsed && (
          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            WORKSPACE
          </div>
        )}
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-sidebar-accent">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          {!collapsed && (
            <div className="flex flex-1 items-center justify-between">
              <div>
                <p className="text-sm font-medium text-sidebar-foreground">
                  Ar Ideal Climatizadora
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-sidebar-foreground/60">Plano</span>
                  <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] px-1.5 py-0">
                    ENTERPRISE
                  </Badge>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-sidebar-foreground/50" />
            </div>
          )}
        </button>
      </div>
    </aside>
  )
}
