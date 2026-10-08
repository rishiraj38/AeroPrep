"use client";

import React, { useRef, useState } from 'react';
import { Loader2, CheckCircle, UploadCloud, AlertTriangle } from 'lucide-react';
import { readResume } from '@/lib/api';

const MAX_BYTES = 5 * 1024 * 1024;

interface ResumeUploaderProps {
  // Called with the text read from the PDF. The file itself is not kept anywhere.
  onUploadSuccess: (resumeText: string) => void;
  onUploadStart?: () => void;
  className?: string;
}

export default function ResumeUploader({ onUploadSuccess, onUploadStart, className }: ResumeUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file || uploading) return;
    setError(null);
    setFileName(null);

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please choose a PDF file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That file is larger than 5MB. Please upload a smaller PDF.');
      return;
    }

    setUploading(true);
    onUploadStart?.();
    try {
      onUploadSuccess(await readResume(file));
      setFileName(file.name);
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      // Let the same file be chosen again after an error
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className={`w-full ${className}`}>
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        className="relative block border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 focus-within:border-primary transition-colors rounded-xl p-8 text-center bg-muted/5 group cursor-pointer"
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          disabled={uploading}
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="sr-only"
        />

        <div className="flex flex-col items-center gap-3">
          {uploading ? (
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
          ) : fileName ? (
            <CheckCircle className="h-10 w-10 text-green-500" />
          ) : (
            <UploadCloud className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors" />
          )}

          <div className="space-y-1">
            <h3 className="font-semibold text-lg">
              {uploading ? "Reading your resume..." : fileName ? "Resume read" : "Click or drop your resume here"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {fileName ? `${fileName} · choose another to replace it` : "PDF files up to 5MB. We keep only the text, not the file."}
            </p>
          </div>
        </div>
      </label>

      {error && (
        <div role="alert" className="mt-3 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 rounded-md text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
    </div>
  );
}
