"use client"

import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
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

export function ProductsSearch() {
  const router = useRouter()

  const handleNewProduct = () => {
    router.push("/produtos/novo")
  }

  return (
    <Card className="mb-6 border-border">
      <CardContent className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          {/* Search Input */}
          <div className="flex-1">
            <label className="mb-2 block text-sm font-medium text-foreground">
              Buscar
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Nome ou SKU"
                className="pl-9"
              />
            </div>
          </div>

          {/* Sort Select */}
          <div className="w-full md:w-[200px]">
            <label className="mb-2 block text-sm font-medium text-foreground">
              Ordenar
            </label>
            <Select defaultValue="nome-asc">
              <SelectTrigger>
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nome-asc">Nome (A → Z)</SelectItem>
                <SelectItem value="nome-desc">Nome (Z → A)</SelectItem>
                <SelectItem value="preco-asc">Preço (menor)</SelectItem>
                <SelectItem value="preco-desc">Preço (maior)</SelectItem>
                <SelectItem value="margem-asc">Margem (menor)</SelectItem>
                <SelectItem value="margem-desc">Margem (maior)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* New Product Button */}
          <Button 
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleNewProduct}
          >
            Novo produto
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
