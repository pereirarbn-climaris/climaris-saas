"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Plus, Trash2, Wrench, Clock, DollarSign, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

interface Material {
  id: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
}

interface ServiceData {
  nome: string
  descricao: string
  tempoExecucao: number
  preco: number
  ativo: boolean
  materiais: Material[]
}

interface ServiceEditFormProps {
  serviceId?: string
  onBack: () => void
}

// Available products for materials
const availableProducts = [
  { id: "1", name: "Tubo de Cobre 1/4", price: 20.67 },
  { id: "2", name: "Tubo de Cobre 3/8", price: 31.80 },
  { id: "3", name: "Tubo Isolante de Poliéster 3/8 Branco", price: 4.90 },
  { id: "4", name: "Tubo Isolante de Poliéster 1/4 Branco", price: 4.90 },
  { id: "5", name: "Suporte Condensadora 430mm", price: 25.00 },
  { id: "6", name: "Cabo de comando 100 cobre PP4x1,5", price: 3.25 },
  { id: "7", name: "Parafuso Sextavado Rosca Soberba 3/16x55mm", price: 0.61 },
  { id: "8", name: "Parafuso Sextavado Rosca Soberba 1/450mm", price: 0.85 },
  { id: "9", name: "Fita PVC Branca 10mmx10m", price: 3.00 },
  { id: "10", name: "Mangueira Crista 3/8", price: 7.10 },
  { id: "11", name: "Arruela Liza Zincada 1/4", price: 0.30 },
]

// Mock service data
const mockServiceData: Record<string, ServiceData> = {
  "1": {
    nome: "Instalação de ar-condicionado hi-wall de até 12000BTUs",
    descricao: "Canos de cobre de 3mts, suporte para condensadora, cabo PP de comunicação entre os aparelhos e outros.",
    tempoExecucao: 240,
    preco: 600.00,
    ativo: true,
    materiais: [
      { id: "1", productId: "1", productName: "Tubo de Cobre 1/4", quantity: 3, unitPrice: 20.67 },
      { id: "2", productId: "2", productName: "Tubo de Cobre 3/8", quantity: 3, unitPrice: 31.80 },
      { id: "3", productId: "3", productName: "Tubo Isolante de Poliéster 3/8 Branco", quantity: 2, unitPrice: 4.90 },
      { id: "4", productId: "4", productName: "Tubo Isolante de Poliéster 1/4 Branco", quantity: 2, unitPrice: 4.90 },
      { id: "5", productId: "5", productName: "Suporte Condensadora 430mm", quantity: 1, unitPrice: 25.00 },
      { id: "6", productId: "6", productName: "Cabo de comando 100 cobre PP4x1,5", quantity: 2, unitPrice: 3.25 },
      { id: "7", productId: "7", productName: "Parafuso Sextavado Rosca Soberba 3/16x55mm", quantity: 4, unitPrice: 0.61 },
      { id: "8", productId: "8", productName: "Parafuso Sextavado Rosca Soberba 1/450mm", quantity: 6, unitPrice: 0.85 },
      { id: "9", productId: "9", productName: "Fita PVC Branca 10mmx10m", quantity: 1, unitPrice: 3.00 },
      { id: "10", productId: "10", productName: "Mangueira Crista 3/8", quantity: 3, unitPrice: 7.10 },
    ],
  },
  "2": {
    nome: "Limpeza e higienização da condensadora hi-wall de 12000BTUs",
    descricao: "Limpeza completa da unidade condensadora com produtos específicos.",
    tempoExecucao: 40,
    preco: 170.00,
    ativo: true,
    materiais: [],
  },
}

const defaultServiceData: ServiceData = {
  nome: "",
  descricao: "",
  tempoExecucao: 60,
  preco: 0,
  ativo: true,
  materiais: [],
}

export function ServiceEditForm({ serviceId, onBack }: ServiceEditFormProps) {
  const isEditing = !!serviceId
  const [formData, setFormData] = useState<ServiceData>(defaultServiceData)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (serviceId && mockServiceData[serviceId]) {
      setFormData(mockServiceData[serviceId])
    }
  }, [serviceId])

  const handleInputChange = (field: keyof ServiceData, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const addMaterial = () => {
    const newMaterial: Material = {
      id: Date.now().toString(),
      productId: "",
      productName: "",
      quantity: 1,
      unitPrice: 0,
    }
    setFormData(prev => ({
      ...prev,
      materiais: [...prev.materiais, newMaterial],
    }))
  }

  const updateMaterial = (id: string, field: keyof Material, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      materiais: prev.materiais.map(m => {
        if (m.id === id) {
          if (field === "productId") {
            const product = availableProducts.find(p => p.id === value)
            return {
              ...m,
              productId: value as string,
              productName: product?.name || "",
              unitPrice: product?.price || 0,
            }
          }
          return { ...m, [field]: value }
        }
        return m
      }),
    }))
  }

  const removeMaterial = (id: string) => {
    setFormData(prev => ({
      ...prev,
      materiais: prev.materiais.filter(m => m.id !== id),
    }))
  }

  const custoMateriais = formData.materiais.reduce(
    (acc, m) => acc + m.quantity * m.unitPrice,
    0
  )

  const lucroEstimado = formData.preco - custoMateriais

  const handleSave = async () => {
    setIsLoading(true)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    setIsLoading(false)
    onBack()
  }

  const handleDuplicate = async () => {
    setIsLoading(true)
    await new Promise(resolve => setTimeout(resolve, 500))
    setIsLoading(false)
    // Would create a copy and redirect
  }

  const handleDelete = async () => {
    setIsLoading(true)
    await new Promise(resolve => setTimeout(resolve, 500))
    setIsLoading(false)
    onBack()
  }

  const formatTime = (minutes: number) => {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60)
      const mins = minutes % 60
      return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`
    }
    return `${minutes}min`
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/10">
            <Wrench className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              {isEditing ? "Editar serviço" : "Novo serviço"}
            </h1>
            <p className="text-sm text-muted-foreground">
              O tempo de execução em minutos será usado no agendamento. Você também pode cadastrar produtos consumidos para estimar o lucro real.
            </p>
          </div>
        </div>
      </div>

      {/* Service Data Section */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-primary">
            <Package className="h-4 w-4" />
            Dados do Serviço
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Nome */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Nome</label>
            <Input
              value={formData.nome}
              onChange={(e) => handleInputChange("nome", e.target.value)}
              placeholder="Ex: Instalação de ar-condicionado split"
              className="h-11"
            />
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Descrição</label>
            <Textarea
              value={formData.descricao}
              onChange={(e) => handleInputChange("descricao", e.target.value)}
              placeholder="Descreva o que está incluso neste serviço..."
              className="min-h-[100px] resize-none"
            />
          </div>

          {/* Time and Price */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Tempo de execução (min)
              </label>
              <div className="relative">
                <Input
                  type="number"
                  value={formData.tempoExecucao}
                  onChange={(e) => handleInputChange("tempoExecucao", parseInt(e.target.value) || 0)}
                  className="h-11 pr-16"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {formatTime(formData.tempoExecucao)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                Preço (R$)
              </label>
              <Input
                type="text"
                value={formData.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "")
                  handleInputChange("preco", parseInt(value) / 100 || 0)
                }}
                className="h-11"
              />
            </div>
          </div>

          {/* Active Checkbox */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
            <Checkbox
              id="ativo"
              checked={formData.ativo}
              onCheckedChange={(checked) => handleInputChange("ativo", !!checked)}
              className="h-5 w-5"
            />
            <div className="flex-1">
              <label htmlFor="ativo" className="text-sm font-medium text-foreground cursor-pointer">
                Serviço ativo
              </label>
              <p className="text-xs text-muted-foreground">
                Serviços inativos não aparecem nas opções de orçamento e OS
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products Section Label */}
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">
        Produtos Utilizados (opcional)
      </p>

      {/* Materials Section */}
      <Card className="border-border shadow-sm">
        <CardContent className="pt-6">
          {/* Header with title and add button */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Materiais do serviço</span>
            <Button
              variant="outline"
              size="icon"
              onClick={addMaterial}
              className="h-8 w-8 rounded-full border-primary text-primary hover:bg-primary hover:text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {formData.materiais.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhum material adicionado
            </div>
          ) : (
            <div>
              {/* Column Headers */}
              <div className="mb-3 flex items-center gap-3">
                <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Produto</span>
                <span className="w-20 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quantidade</span>
                <span className="w-10"></span>
              </div>

              {/* Materials List */}
              {formData.materiais.map((material) => (
                <div
                  key={material.id}
                  className="flex items-center gap-3 border-t border-border py-3"
                >
                  <div className="flex-1">
                    <Select
                      value={material.productId}
                      onValueChange={(value) => updateMaterial(material.id, "productId", value)}
                    >
                      <SelectTrigger className="h-10 w-full border-border bg-background">
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableProducts.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Input
                    type="number"
                    min="1"
                    value={material.quantity}
                    onChange={(e) => updateMaterial(material.id, "quantity", parseInt(e.target.value) || 1)}
                    className="h-10 w-20 text-center"
                  />

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMaterial(material.id)}
                    className="h-10 w-10 shrink-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Cost Summary - only show when materials exist */}
          {formData.materiais.length > 0 && (
            <div className="mt-4 grid gap-4 rounded-lg bg-slate-800 p-4 text-white md:grid-cols-2">
              <div>
                <p className="text-xs text-slate-400">Custo estimado de materiais</p>
                <p className="text-lg font-semibold">
                  {custoMateriais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Lucro estimado</p>
                <p className={cn(
                  "text-lg font-semibold",
                  lucroEstimado >= 0 ? "text-white" : "text-red-400"
                )}>
                  {lucroEstimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="sticky bottom-0 -mx-6 border-t border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={onBack}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar à lista
          </Button>

          <Button
            onClick={handleSave}
            disabled={isLoading || !formData.nome}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Salvar alterações
          </Button>

          {isEditing && (
            <>
              <Button
                variant="outline"
                onClick={handleDuplicate}
                disabled={isLoading}
              >
                Duplicar serviço
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-destructive/30 text-destructive hover:bg-destructive/10"
                    disabled={isLoading}
                  >
                    Excluir serviço
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir serviço</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja excluir este serviço? Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
