"use client"

import { useState, useMemo } from "react"
import { Calculator, Home, Sun, Users, Lightbulb, ArrowRight, RotateCcw, Snowflake } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Slider } from "@/components/ui/slider"
import { Card, CardContent } from "@/components/ui/card"

type RoomType = "bedroom" | "living" | "office" | "kitchen" | "commercial"
type SunExposure = "low" | "medium" | "high"

interface CalculatorState {
  area: number
  roomType: RoomType
  sunExposure: SunExposure
  people: number
  electronics: number
}

const roomTypeLabels: Record<RoomType, string> = {
  bedroom: "Quarto",
  living: "Sala de Estar",
  office: "Escritório",
  kitchen: "Cozinha",
  commercial: "Comercial",
}

const roomTypeMultipliers: Record<RoomType, number> = {
  bedroom: 600,
  living: 600,
  office: 700,
  kitchen: 800,
  commercial: 800,
}

const sunExposureLabels: Record<SunExposure, { label: string; description: string }> = {
  low: { label: "Baixa", description: "Pouca luz solar direta" },
  medium: { label: "Média", description: "Luz solar moderada" },
  high: { label: "Alta", description: "Muita luz solar direta" },
}

const sunExposureMultipliers: Record<SunExposure, number> = {
  low: 1.0,
  medium: 1.1,
  high: 1.2,
}

const btuOptions = [
  { btu: 7500, label: "7.500 BTUs" },
  { btu: 9000, label: "9.000 BTUs" },
  { btu: 12000, label: "12.000 BTUs" },
  { btu: 18000, label: "18.000 BTUs" },
  { btu: 22000, label: "22.000 BTUs" },
  { btu: 24000, label: "24.000 BTUs" },
  { btu: 30000, label: "30.000 BTUs" },
  { btu: 36000, label: "36.000 BTUs" },
  { btu: 48000, label: "48.000 BTUs" },
  { btu: 60000, label: "60.000 BTUs" },
]

function getRecommendedBtu(calculatedBtu: number): { btu: number; label: string } {
  for (const option of btuOptions) {
    if (option.btu >= calculatedBtu) {
      return option
    }
  }
  return btuOptions[btuOptions.length - 1]
}

export function BTUCalculator() {
  const [state, setState] = useState<CalculatorState>({
    area: 20,
    roomType: "living",
    sunExposure: "medium",
    people: 2,
    electronics: 1,
  })

  const [showResult, setShowResult] = useState(false)

  const calculatedBtu = useMemo(() => {
    const baseBtu = state.area * roomTypeMultipliers[state.roomType]
    const sunMultiplier = sunExposureMultipliers[state.sunExposure]
    const peopleBtu = state.people * 600
    const electronicsBtu = state.electronics * 200
    
    return Math.round((baseBtu * sunMultiplier + peopleBtu + electronicsBtu) / 100) * 100
  }, [state])

  const recommendedBtu = useMemo(() => getRecommendedBtu(calculatedBtu), [calculatedBtu])

  const handleCalculate = () => {
    setShowResult(true)
  }

  const handleReset = () => {
    setState({
      area: 20,
      roomType: "living",
      sunExposure: "medium",
      people: 2,
      electronics: 1,
    })
    setShowResult(false)
  }

  return (
    <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
      {/* Calculator Form */}
      <div className="space-y-8">
        {/* Area Input */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Home className="h-5 w-5 text-primary" />
            </div>
            <Label className="text-lg font-semibold text-foreground">
              Área do Ambiente
            </Label>
          </div>
          <div className="flex items-center gap-4">
            <Slider
              value={[state.area]}
              onValueChange={([value]) => setState({ ...state, area: value })}
              min={5}
              max={100}
              step={1}
              className="flex-1"
            />
            <div className="flex items-center gap-2 min-w-[100px]">
              <Input
                type="number"
                value={state.area}
                onChange={(e) => setState({ ...state, area: Math.max(5, Math.min(100, parseInt(e.target.value) || 5)) })}
                className="w-20 text-center"
                min={5}
                max={100}
              />
              <span className="text-muted-foreground">m²</span>
            </div>
          </div>
        </div>

        {/* Room Type */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calculator className="h-5 w-5 text-primary" />
            </div>
            <Label className="text-lg font-semibold text-foreground">
              Tipo de Ambiente
            </Label>
          </div>
          <RadioGroup
            value={state.roomType}
            onValueChange={(value) => setState({ ...state, roomType: value as RoomType })}
            className="grid grid-cols-2 sm:grid-cols-3 gap-3"
          >
            {Object.entries(roomTypeLabels).map(([value, label]) => (
              <Label
                key={value}
                htmlFor={value}
                className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  state.roomType === value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <RadioGroupItem value={value} id={value} className="sr-only" />
                <span className="text-sm font-medium">{label}</span>
              </Label>
            ))}
          </RadioGroup>
        </div>

        {/* Sun Exposure */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sun className="h-5 w-5 text-primary" />
            </div>
            <Label className="text-lg font-semibold text-foreground">
              Incidência Solar
            </Label>
          </div>
          <RadioGroup
            value={state.sunExposure}
            onValueChange={(value) => setState({ ...state, sunExposure: value as SunExposure })}
            className="grid grid-cols-3 gap-3"
          >
            {Object.entries(sunExposureLabels).map(([value, { label, description }]) => (
              <Label
                key={value}
                htmlFor={`sun-${value}`}
                className={`flex flex-col items-center justify-center gap-1 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  state.sunExposure === value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <RadioGroupItem value={value} id={`sun-${value}`} className="sr-only" />
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-muted-foreground text-center">{description}</span>
              </Label>
            ))}
          </RadioGroup>
        </div>

        {/* People */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <Label className="text-lg font-semibold text-foreground">
              Quantidade de Pessoas
            </Label>
          </div>
          <div className="flex items-center gap-4">
            <Slider
              value={[state.people]}
              onValueChange={([value]) => setState({ ...state, people: value })}
              min={1}
              max={20}
              step={1}
              className="flex-1"
            />
            <div className="flex items-center gap-2 min-w-[80px]">
              <Input
                type="number"
                value={state.people}
                onChange={(e) => setState({ ...state, people: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })}
                className="w-16 text-center"
                min={1}
                max={20}
              />
              <span className="text-muted-foreground text-sm">pessoa{state.people !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>

        {/* Electronics */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Lightbulb className="h-5 w-5 text-primary" />
            </div>
            <Label className="text-lg font-semibold text-foreground">
              Equipamentos Eletrônicos
            </Label>
          </div>
          <p className="text-sm text-muted-foreground -mt-2">
            Computadores, TVs, lâmpadas e outros aparelhos que geram calor
          </p>
          <div className="flex items-center gap-4">
            <Slider
              value={[state.electronics]}
              onValueChange={([value]) => setState({ ...state, electronics: value })}
              min={0}
              max={10}
              step={1}
              className="flex-1"
            />
            <div className="flex items-center gap-2 min-w-[100px]">
              <Input
                type="number"
                value={state.electronics}
                onChange={(e) => setState({ ...state, electronics: Math.max(0, Math.min(10, parseInt(e.target.value) || 0)) })}
                className="w-16 text-center"
                min={0}
                max={10}
              />
              <span className="text-muted-foreground text-sm">aparelho{state.electronics !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 pt-4">
          <Button
            size="lg"
            onClick={handleCalculate}
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6 rounded-xl"
          >
            <Calculator className="h-5 w-5 mr-2" />
            Calcular BTU
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={handleReset}
            className="py-6 rounded-xl"
          >
            <RotateCcw className="h-5 w-5 mr-2" />
            Limpar
          </Button>
        </div>
      </div>

      {/* Result Panel */}
      <div className="lg:sticky lg:top-32">
        <Card className={`border-2 transition-all duration-500 ${showResult ? "border-primary shadow-lg shadow-primary/10" : "border-border"}`}>
          <CardContent className="p-8">
            <div className="text-center space-y-6">
              <div className={`inline-flex p-4 rounded-2xl transition-colors ${showResult ? "bg-primary/10" : "bg-muted"}`}>
                <Snowflake className={`h-12 w-12 transition-colors ${showResult ? "text-primary" : "text-muted-foreground"}`} />
              </div>

              <div>
                <h3 className="text-lg font-medium text-muted-foreground mb-2">
                  {showResult ? "Capacidade Recomendada" : "Preencha os dados"}
                </h3>
                <div className={`text-5xl md:text-6xl font-bold transition-colors ${showResult ? "text-primary" : "text-muted-foreground/30"}`}>
                  {showResult ? recommendedBtu.label : "-- BTUs"}
                </div>
              </div>

              {showResult && (
                <div className="space-y-6 pt-4 border-t border-border">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="text-left">
                      <span className="text-muted-foreground">BTU Calculado:</span>
                    </div>
                    <div className="text-right font-semibold">
                      {calculatedBtu.toLocaleString("pt-BR")} BTUs
                    </div>
                    <div className="text-left">
                      <span className="text-muted-foreground">Área:</span>
                    </div>
                    <div className="text-right font-semibold">
                      {state.area} m²
                    </div>
                    <div className="text-left">
                      <span className="text-muted-foreground">Ambiente:</span>
                    </div>
                    <div className="text-right font-semibold">
                      {roomTypeLabels[state.roomType]}
                    </div>
                  </div>

                  <div className="bg-accent/10 rounded-xl p-4">
                    <p className="text-sm text-muted-foreground">
                      Este valor é uma estimativa. Para um dimensionamento preciso, 
                      recomendamos uma avaliação técnica presencial.
                    </p>
                  </div>

                  <Button
                    asChild
                    size="lg"
                    className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold py-6 rounded-xl"
                  >
                    <a
                      href={`https://wa.me/5516997369710?text=${encodeURIComponent(
                        `Olá! Fiz uma simulação no site e preciso de um ar-condicionado de ${recommendedBtu.label} para um ambiente de ${state.area}m² (${roomTypeLabels[state.roomType]}). Podem me ajudar?`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2"
                    >
                      Solicitar Orçamento
                      <ArrowRight className="h-5 w-5" />
                    </a>
                  </Button>
                </div>
              )}

              {!showResult && (
                <p className="text-sm text-muted-foreground">
                  Preencha as informações ao lado para descobrir a capacidade 
                  ideal de ar-condicionado para o seu ambiente.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
