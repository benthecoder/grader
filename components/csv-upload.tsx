"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload, FileText, X } from "lucide-react"

interface CSVUploadProps {
  onDataLoaded: (data: any[]) => void
}

export function CSVUpload({ onDataLoaded }: CSVUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)

  const parseCSV = (csvText: string) => {
    const lines = csvText.trim().split("\n")
    const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""))

    return lines.slice(1).map((line) => {
      const values = []
      let current = ""
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === "," && !inQuotes) {
          values.push(current.trim().replace(/"/g, ""))
          current = ""
        } else {
          current += char
        }
      }
      values.push(current.trim().replace(/"/g, ""))

      const row: any = {}
      headers.forEach((header, index) => {
        row[header] = values[index] || ""
      })
      return row
    })
  }

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".csv")) {
        alert("Please upload a CSV file")
        return
      }

      setIsProcessing(true)
      setFileName(file.name)

      try {
        const text = await file.text()
        const data = parseCSV(text)
        onDataLoaded(data)
      } catch (error) {
        console.error("Error parsing CSV:", error)
        alert("Error parsing CSV file")
      } finally {
        setIsProcessing(false)
      }
    },
    [onDataLoaded],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)

      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) {
        handleFile(files[0])
      }
    },
    [handleFile],
  )

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFile(files[0])
    }
  }

  const clearFile = () => {
    setFileName(null)
    onDataLoaded([])
  }

  return (
    <Card className="border-2 border-dashed border-slate-300">
      <CardContent className="p-8">
        <div
          className={`text-center transition-colors ${isDragOver ? "bg-blue-50 border-blue-300" : ""}`}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          {fileName ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-3">
                <FileText className="h-8 w-8 text-green-600" />
                <span className="font-semibold text-slate-700">{fileName}</span>
                <Button variant="ghost" size="sm" onClick={clearFile}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-green-600">CSV file loaded successfully!</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Upload className="h-12 w-12 text-slate-400 mx-auto" />
              <div>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">Drop your CSV file here</h3>
                <p className="text-slate-500 mb-4">Or click to browse and select your clinical trial data file</p>
                <input type="file" accept=".csv" onChange={handleFileInput} className="hidden" id="csv-upload" />
                <Button asChild variant="outline" disabled={isProcessing}>
                  <label htmlFor="csv-upload" className="cursor-pointer">
                    {isProcessing ? "Processing..." : "Choose CSV File"}
                  </label>
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
