"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Package, Upload, ImageIcon, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { toast } from "sonner"

interface ProductData {
  nome: string
  sku: string
  valorCompra: string
  valorVenda: string
  quantidadeEstoque: string
  ativo: boolean
  imagens: string[]
  categoryId: string
  tipoListagem: string
}

interface ProductEditFormProps {
  productId?: string
  onBack: () => void
}

// Mock data for products
const mockProductData: Record<string, ProductData> = {
  "1": {
    nome: "Arruela Liza Zincada 1/4",
    sku: "ARRUELA-LIZA-7SCD",
    valorCompra: "0,30",
    valorVenda: "0,60",
    quantidadeEstoque: "10",
    ativo: true,
    imagens: [],
    categoryId: "",
    tipoListagem: "gold_special",
  },
  "2": {
    nome: "Bomba de água EOS",
    sku: "BOMBA-DE-AGU-C4O2",
    valorCompra: "220,00",
    valorVenda: "320,00",
    quantidadeEstoque: "5",
    ativo: true,
    imagens: [],
    categoryId: "",
    tipoListagem: "gold_special",
  },
  "3": {
    nome: "Bucha de Plastico 08 c/ Anel",
    sku: "BUCHA-DE-PLA-Z350",
    valorCompra: "0,05",
    valorVenda: "0,10",
    quantidadeEstoque: "100",
    ativo: true,
    imagens: [],
    categoryId: "",
    tipoListagem: "gold_special",
  },
}

const defaultProduct: ProductData = {
  nome: "",
  sku: "",
  valorCompra: "",
  valorVenda: "",
  quantidadeEstoque: "",
  ativo: true,
  imagens: [],
  categoryId: "",
  tipoListagem: "gold_special",
}

export function ProductEditForm({ productId, onBack }: ProductEditFormProps) {
  const router = useRouter()
  const isEditing = !!productId
  
  const initialData = productId && mockProductData[productId] 
    ? mockProductData[productId] 
    : defaultProduct

  const [formData, setFormData] = useState<ProductData>(initialData)

  const handleInputChange = (field: keyof ProductData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const generateSKU = () => {
    if (!formData.nome) {
      toast.error("Preencha o nome do produto primeiro")
      return
    }
    
    const words = formData.nome.toUpperCase().split(" ").slice(0, 3)
    const skuParts = words.map((word) => word.slice(0, 4).replace(/[^A-Z0-9]/g, ""))
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
    const sku = `${skuParts.join("-")}-${randomSuffix}`
    
    handleInputChange("sku", sku)
    toast.success("SKU gerado com sucesso")
  }

  const handleSave = () => {
    if (!formData.nome) {
      toast.error("O nome do produto é obrigatório")
      return
    }
    if (!formData.sku) {
      toast.error("O SKU é obrigatório")
      return
    }
    
    toast.success(isEditing ? "Produto atualizado com sucesso" : "Produto criado com sucesso")
    router.push("/produtos")
  }

  const handleDuplicate = () => {
    toast.success("Produto duplicado com sucesso")
    router.push("/produtos/novo")
  }

  const handleDelete = () => {
    toast.success("Produto excluído com sucesso")
    router.push("/produtos")
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Package className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {isEditing ? "Editar produto" : "Novo produto"}
          </h1>
          <p className="text-muted-foreground">
            Cadastre os produtos com valor de compra e valor de venda para cálculo de margem.
          </p>
        </div>
      </div>

      {/* Dados do Produto */}
      <Card className="border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary">
            Dados do Produto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Nome */}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => handleInputChange("nome", e.target.value)}
              placeholder="Nome do produto"
            />
          </div>

          {/* SKU and Valor de Compra */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <div className="flex gap-2">
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => handleInputChange("sku", e.target.value)}
                  placeholder="Código SKU"
                  className="font-mono"
                />
                <Button 
                  type="button" 
                  onClick={generateSKU}
                  className="shrink-0"
                >
                  Gerar SKU
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="valorCompra">Valor de compra (R$)</Label>
              <Input
                id="valorCompra"
                value={formData.valorCompra}
                onChange={(e) => handleInputChange("valorCompra", e.target.value)}
                placeholder="R$ 0,00"
              />
            </div>
          </div>

          {/* Valor de Venda and Quantidade */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="valorVenda">Valor de venda (R$)</Label>
              <Input
                id="valorVenda"
                value={formData.valorVenda}
                onChange={(e) => handleInputChange("valorVenda", e.target.value)}
                placeholder="R$ 0,00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantidadeEstoque">Quantidade em estoque</Label>
              <Input
                id="quantidadeEstoque"
                type="number"
                value={formData.quantidadeEstoque}
                onChange={(e) => handleInputChange("quantidadeEstoque", e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Para ajustes pontuais no dia a dia, use também a tela de Estoque.
              </p>
            </div>
          </div>

          {/* Produto Ativo */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="ativo"
              checked={formData.ativo}
              onCheckedChange={(checked) => handleInputChange("ativo", !!checked)}
            />
            <Label htmlFor="ativo" className="cursor-pointer">
              Produto ativo
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Imagens */}
      <Card className="border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary">
            Imagens
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Fotos em formato público (armazenadas na nuvem) para vitrine e para publicação no Mercado Livre — até 12 imagens por anúncio.
          </p>
          
          <Button variant="outline" className="gap-2">
            <Upload className="h-4 w-4" />
            Enviar imagens
          </Button>

          {formData.imagens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma imagem ainda.</p>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              {formData.imagens.map((img, index) => (
                <div key={index} className="relative aspect-square rounded-lg border bg-muted">
                  <ImageIcon className="absolute inset-0 m-auto h-8 w-8 text-muted-foreground" />
                  <button
                    className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground"
                    onClick={() => {
                      const newImages = formData.imagens.filter((_, i) => i !== index)
                      setFormData((prev) => ({ ...prev, imagens: newImages }))
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mercado Livre */}
      <Card className="border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary">
            Mercado Livre
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Publique este produto como anúncio com as fotos acima. Use a{" "}
            <a href="#" className="text-primary underline">central da integração</a>{" "}
            para conectar sua conta e buscar o{" "}
            <span className="font-mono text-foreground">category_id</span>.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="categoryId">Category ID (MLB...)</Label>
              <Input
                id="categoryId"
                value={formData.categoryId}
                onChange={(e) => handleInputChange("categoryId", e.target.value)}
                placeholder="Ex.: MLB123456"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipoListagem">Tipo de listagem</Label>
              <Select
                value={formData.tipoListagem}
                onValueChange={(value) => handleInputChange("tipoListagem", value)}
              >
                <SelectTrigger id="tipoListagem">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gold_special">gold_special</SelectItem>
                  <SelectItem value="gold_pro">gold_pro</SelectItem>
                  <SelectItem value="gold">gold</SelectItem>
                  <SelectItem value="silver">silver</SelectItem>
                  <SelectItem value="bronze">bronze</SelectItem>
                  <SelectItem value="free">free</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline">
              Salvar vínculo
            </Button>
            <Button>
              Publicar / atualizar anúncio
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background py-4">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar à lista
        </Button>
        
        <Button onClick={handleSave}>
          Salvar alterações
        </Button>

        {isEditing && (
          <>
            <Button variant="outline" onClick={handleDuplicate}>
              Duplicar produto
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground">
                  Excluir produto
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir produto</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita.
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
  )
}
