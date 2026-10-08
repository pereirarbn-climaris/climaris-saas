"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const products = [
  { id: "1", name: "Arruela Liza Zincada 1/4" },
  { id: "2", name: "Bomba de água EOS" },
  { id: "3", name: "Bucha de Plastico 08 c/ Anel" },
  { id: "4", name: "Cabo de comando 100 cobre PP4×1,5" },
  { id: "5", name: "Cabo de comando 100 cobre PP4×2,5" },
  { id: "6", name: "Cabo de comando 100 cobre PP5×1,5mm" },
  { id: "7", name: "Fita PVC Branca 10mmx10m" },
  { id: "8", name: "Mangueira Crista 3/8" },
]

export function InventoryAdjustment() {
  const [selectedProduct, setSelectedProduct] = useState<string>("")
  const [quantity, setQuantity] = useState("")
  const [observation, setObservation] = useState("")

  const handleSubmit = () => {
    // In production, this would call an API
    console.log("Adjusting inventory:", { selectedProduct, quantity, observation })
    // Reset form
    setSelectedProduct("")
    setQuantity("")
    setObservation("")
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold text-foreground">
          Ajuste manual
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="product" className="text-sm font-medium text-muted-foreground">
              Produto
            </Label>
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger id="product" className="w-full">
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full space-y-2 lg:w-48">
            <Label htmlFor="quantity" className="text-sm font-medium text-muted-foreground">
              Quantidade (+ entrada / − saída)
            </Label>
            <Input
              id="quantity"
              type="text"
              placeholder="ex: 10 ou -2.5"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="bg-background"
            />
          </div>

          <div className="flex-1 space-y-2">
            <Label htmlFor="observation" className="text-sm font-medium text-muted-foreground">
              Observação (opcional)
            </Label>
            <Input
              id="observation"
              type="text"
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              className="bg-background"
            />
          </div>

          <Button
            onClick={handleSubmit}
            className="bg-primary text-primary-foreground hover:bg-primary/90 lg:w-auto"
          >
            Registrar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
