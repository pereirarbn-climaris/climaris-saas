"use client"

import { useRouter } from "next/navigation"
import { Search, Plus, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"

export function ServicesSearch() {
  const router = useRouter()

  const handleNewService = () => {
    router.push("/servicos/novo")
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Search and Filters */}
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar por nome ou descrição..."
                className="h-10 pl-9 bg-background border-border/50 focus-visible:ring-primary/20"
              />
            </div>

            {/* Sort Select */}
            <Select defaultValue="name-asc">
              <SelectTrigger className="h-10 w-full sm:w-[180px] bg-background border-border/50">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name-asc">Nome (A → Z)</SelectItem>
                <SelectItem value="name-desc">Nome (Z → A)</SelectItem>
                <SelectItem value="price-asc">Preço (menor)</SelectItem>
                <SelectItem value="price-desc">Preço (maior)</SelectItem>
                <SelectItem value="profit-asc">Lucro (menor)</SelectItem>
                <SelectItem value="profit-desc">Lucro (maior)</SelectItem>
                <SelectItem value="time-asc">Tempo (menor)</SelectItem>
                <SelectItem value="time-desc">Tempo (maior)</SelectItem>
              </SelectContent>
            </Select>

            {/* Filter Button */}
            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 border-border/50">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>

          {/* New Service Button */}
          <Button 
            onClick={handleNewService}
            className="h-10 gap-2 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Novo serviço
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
